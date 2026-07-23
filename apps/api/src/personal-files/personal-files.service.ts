import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_STORAGE_PROVIDER } from '../file-storage/file-storage.module';
import type { FileStorageProvider } from '../file-storage/file-storage-provider';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { sniffAllowedType } from './lib/magic-bytes';
import { ensureExtension, sanitizeFilename } from './lib/sanitize-filename';
import { PersonalFileDto, toPersonalFileDto } from './dto/personal-file.dto';

const PER_FILE_MAX_BYTES = 10 * 1024 * 1024;
const QUOTA_BYTES = 500 * 1024 * 1024;
const RESTORE_WINDOW_DAYS = 30;
const SIGNED_URL_TTL_SEC = 300;

export type ListOptions = {
  search?: string;
  sort?: 'newest' | 'oldest' | 'name' | 'largest';
  includeDeleted?: boolean;
};

@Injectable()
export class PersonalFilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly storage: FileStorageProvider,
    private readonly auditLogs: AuditLogsService,
    private readonly notificationDispatcher: NotificationDispatcher,
  ) {}

  // ─── Upload ────────────────────────────────────────────────────────────────

  async upload(
    userId: string,
    actorEmail: string | null,
    incoming: { buffer: Buffer; originalName: string; declaredMime: string },
  ): Promise<PersonalFileDto> {
    if (incoming.buffer.length > PER_FILE_MAX_BYTES) {
      throw new BadRequestException({ error: 'oversize' });
    }

    const usage = await this.getUsageRow(userId);
    if (Number(usage.bytesUsed) + incoming.buffer.length > QUOTA_BYTES) {
      throw new PayloadTooLargeException({
        error: 'quota_exceeded',
        usedBytes: Number(usage.bytesUsed),
        quotaBytes: QUOTA_BYTES,
      });
    }

    const sniff = await sniffAllowedType(incoming.buffer);
    if (!sniff) {
      throw new BadRequestException({ error: 'invalid_type' });
    }

    const sanitized = sanitizeFilename(incoming.originalName);
    const requestedDisplay = ensureExtension(sanitized, sniff.ext);
    const displayName = await this.resolveCollision(userId, requestedDisplay);

    const cuid = randomBytes(12).toString('hex');
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const safeForKey = displayName.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const storageKey = `user_${userId}/${yyyy}/${mm}/${cuid}_${safeForKey}`;

    await this.storage.put(storageKey, incoming.buffer, sniff.mime);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const file = await tx.personalFile.create({
          data: {
            userId,
            storageKey,
            originalName: incoming.originalName.slice(0, 250),
            displayName,
            mimeType: sniff.mime,
            sizeBytes: incoming.buffer.length,
          },
        });
        await tx.userStorageUsage.upsert({
          where: { userId },
          create: {
            userId,
            bytesUsed: BigInt(incoming.buffer.length),
            fileCount: 1,
          },
          update: {
            bytesUsed: { increment: BigInt(incoming.buffer.length) },
            fileCount: { increment: 1 },
          },
        });
        return file;
      });

      await this.auditLogs.create({
        action: 'PERSONAL_FILE_UPLOAD',
        entity: 'PERSONAL_FILE',
        entityId: created.id,
        actorUserId: userId,
        actorEmail: actorEmail ?? undefined,
        metadata: {
          displayName: created.displayName,
          sizeBytes: created.sizeBytes,
          mimeType: created.mimeType,
        },
      });

      return toPersonalFileDto(created);
    } catch (e) {
      // Roll back the storage write if the DB insert failed.
      await this.storage.delete(storageKey).catch(() => undefined);
      throw e;
    }
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async list(
    userId: string,
    opts: ListOptions,
  ): Promise<{
    files: PersonalFileDto[];
    usage: { bytesUsed: number; fileCount: number; quotaBytes: number };
  }> {
    const where = {
      userId,
      ...(opts.includeDeleted ? {} : { deletedAt: null }),
      ...(opts.search
        ? {
            displayName: {
              contains: opts.search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };
    const orderBy =
      opts.sort === 'oldest'
        ? { createdAt: 'asc' as const }
        : opts.sort === 'name'
          ? { displayName: 'asc' as const }
          : opts.sort === 'largest'
            ? { sizeBytes: 'desc' as const }
            : { createdAt: 'desc' as const };

    const [rows, usage] = await Promise.all([
      this.prisma.personalFile.findMany({ where, orderBy, take: 100 }),
      this.getUsageRow(userId),
    ]);

    return {
      files: rows.map(toPersonalFileDto),
      usage: {
        bytesUsed: Number(usage.bytesUsed),
        fileCount: usage.fileCount,
        quotaBytes: QUOTA_BYTES,
      },
    };
  }

  // ─── Download (signed URL) ─────────────────────────────────────────────────

  async signDownload(
    userId: string,
    actorEmail: string | null,
    fileId: string,
  ): Promise<string> {
    const file = await this.prisma.personalFile.findFirst({
      where: { id: fileId, userId },
    });
    if (!file) throw new NotFoundException();

    const url = await this.storage.getSignedDownloadUrl(
      file.storageKey,
      SIGNED_URL_TTL_SEC,
      { downloadName: file.displayName },
    );

    await this.auditLogs.create({
      action: 'PERSONAL_FILE_DOWNLOAD',
      entity: 'PERSONAL_FILE',
      entityId: file.id,
      actorUserId: userId,
      actorEmail: actorEmail ?? undefined,
      metadata: { displayName: file.displayName },
    });

    return url;
  }

  // ─── Soft delete + restore ─────────────────────────────────────────────────

  async softDelete(userId: string, actorEmail: string | null, fileId: string) {
    const file = await this.prisma.personalFile.findFirst({
      where: { id: fileId, userId, deletedAt: null },
    });
    if (!file) throw new NotFoundException();

    await this.prisma.personalFile.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogs.create({
      action: 'PERSONAL_FILE_SOFT_DELETE',
      entity: 'PERSONAL_FILE',
      entityId: file.id,
      actorUserId: userId,
      actorEmail: actorEmail ?? undefined,
      metadata: { displayName: file.displayName, sizeBytes: file.sizeBytes },
    });
  }

  async restore(
    userId: string,
    actorEmail: string | null,
    fileId: string,
  ): Promise<PersonalFileDto> {
    const file = await this.prisma.personalFile.findFirst({
      where: { id: fileId, userId },
    });
    if (!file || !file.deletedAt) throw new NotFoundException();

    const cutoff = new Date(
      Date.now() - RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    if (file.deletedAt < cutoff) {
      throw new NotFoundException({ error: 'gc_window_expired' });
    }

    const updated = await this.prisma.personalFile.update({
      where: { id: file.id },
      data: { deletedAt: null },
    });

    await this.auditLogs.create({
      action: 'PERSONAL_FILE_RESTORE',
      entity: 'PERSONAL_FILE',
      entityId: file.id,
      actorUserId: userId,
      actorEmail: actorEmail ?? undefined,
      metadata: { displayName: file.displayName },
    });

    return toPersonalFileDto(updated);
  }

  // ─── Quota ─────────────────────────────────────────────────────────────────

  async quota(userId: string) {
    const usage = await this.getUsageRow(userId);
    return {
      bytesUsed: Number(usage.bytesUsed),
      fileCount: usage.fileCount,
      quotaBytes: QUOTA_BYTES,
    };
  }

  // ─── Case-files (cohort-scoped) ────────────────────────────────────────────

  async listCaseFiles(
    userId: string,
    filters: { serviceId?: string; cityId?: string; courtName?: string },
  ) {
    const rows = await this.prisma.personalFile.findMany({
      where: {
        userId,
        deletedAt: null,
        serviceId: filters.serviceId ?? { not: null },
        ...(filters.cityId ? { cityId: filters.cityId } : {}),
        ...(filters.courtName ? { courtName: filters.courtName } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { files: rows.map(toPersonalFileDto) };
  }

  async cohortAggregates(userId: string) {
    const groups = await this.prisma.personalFile.groupBy({
      by: ['serviceId', 'cityId', 'courtName', 'courtType'],
      where: { userId, deletedAt: null, serviceId: { not: null } },
      _count: { _all: true },
    });

    // D1: surface a representative case title per cohort for the group
    // header. caseMeta is JSON so it can't be part of the groupBy `by` list
    // — read it back in a second pass instead. Cohort files normally share
    // one case; if they don't (rare), the most recently uploaded title wins.
    const rows = await this.prisma.personalFile.findMany({
      where: { userId, deletedAt: null, serviceId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        serviceId: true,
        cityId: true,
        courtName: true,
        courtType: true,
        caseMeta: true,
      },
    });
    const titleByKey = new Map<string, string>();
    for (const r of rows) {
      const key = `${r.serviceId}|${r.cityId}|${r.courtName}|${r.courtType}`;
      if (titleByKey.has(key)) continue;
      const meta = r.caseMeta as Record<string, unknown> | null;
      const title =
        typeof meta?.caseTitle === 'string' ? meta.caseTitle : undefined;
      if (title) titleByKey.set(key, title);
    }

    return groups.map((g) => {
      const key = `${g.serviceId}|${g.cityId}|${g.courtName}|${g.courtType}`;
      return {
        serviceId: g.serviceId as string,
        cityId: g.cityId ?? null,
        courtName: g.courtName ?? null,
        courtType: g.courtType ?? null,
        count: g._count._all,
        caseTitle: titleByKey.get(key) ?? null,
      };
    });
  }

  async uploadCaseFile(
    userId: string,
    actorEmail: string | null,
    file: { buffer: Buffer; originalName: string; declaredMime: string },
    cohort: {
      serviceId: string;
      cityId: string;
      cityName?: string;
      courtName?: string;
      courtType?: string;
      attachedTicketId?: string;
      caption?: string;
      caseNo?: string;
      caseYear?: string;
      caseTitle?: string;
      courtLevel?: string;
      caseType?: string;
    },
  ) {
    if (cohort.attachedTicketId) {
      const ticket = await this.prisma.ticket.findFirst({
        where: { id: cohort.attachedTicketId, consumerId: userId },
        select: { id: true },
      });
      if (!ticket) {
        throw new BadRequestException({ error: 'attached_ticket_not_owned' });
      }
    }
    // Build caseMeta from any supplied intake-style fields, omitting undefined.
    const caseMeta: Record<string, string> = {};
    if (cohort.caseNo) caseMeta.caseNo = cohort.caseNo;
    if (cohort.caseYear) caseMeta.caseYear = cohort.caseYear;
    if (cohort.caseTitle) caseMeta.caseTitle = cohort.caseTitle;
    if (cohort.courtLevel) caseMeta.courtLevel = cohort.courtLevel;
    if (cohort.caseType) caseMeta.caseType = cohort.caseType;

    const result = await this.upload(userId, actorEmail, file);
    const updated = await this.prisma.personalFile.update({
      where: { id: result.id },
      data: {
        serviceId: cohort.serviceId,
        cityId: cohort.cityId,
        courtName: cohort.courtName ?? null,
        courtType: cohort.courtType ?? null,
        attachedTicketId: cohort.attachedTicketId ?? null,
        // When no case fields are supplied, omit caseMeta so the column stays
        // at its DB default (NULL). We cannot assign plain `null` because
        // Prisma's NullableJson type requires `Prisma.DbNull` for a null-set.
        ...(Object.keys(caseMeta).length > 0 ? { caseMeta } : {}),
      },
    });

    // D3: let admins know a consumer uploaded a case file. Best-effort —
    // never fail the upload because a notification couldn't be dispatched
    // (mirrors the `.catch(() => undefined)` pattern used by every other
    // dispatcher call site, e.g. TicketsService.createIntakeTicket).
    await this.notificationDispatcher
      .caseFileUploaded(updated.id)
      .catch(() => undefined);

    return toPersonalFileDto(updated);
  }

  // ─── Bulk soft delete ──────────────────────────────────────────────────────

  /**
   * Soft-deletes every id the caller owns (same ownership + non-deleted
   * filter as `softDelete`). Ids that aren't owned, don't exist, or are
   * already deleted are silently skipped rather than failing the whole
   * request — the caller never learns whether a foreign id exists (D2).
   */
  async bulkSoftDelete(
    userId: string,
    actorEmail: string | null,
    fileIds: string[],
  ): Promise<{ deletedCount: number; skippedIds: string[] }> {
    const uniqueIds = Array.from(new Set(fileIds));
    const owned = await this.prisma.personalFile.findMany({
      where: { id: { in: uniqueIds }, userId, deletedAt: null },
      select: { id: true, displayName: true, sizeBytes: true },
    });
    const ownedIds = new Set(owned.map((f) => f.id));
    const skippedIds = uniqueIds.filter((id) => !ownedIds.has(id));

    if (owned.length > 0) {
      await this.prisma.personalFile.updateMany({
        where: {
          id: { in: owned.map((f) => f.id) },
          userId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      for (const file of owned) {
        await this.auditLogs.create({
          action: 'PERSONAL_FILE_SOFT_DELETE',
          entity: 'PERSONAL_FILE',
          entityId: file.id,
          actorUserId: userId,
          actorEmail: actorEmail ?? undefined,
          metadata: {
            displayName: file.displayName,
            sizeBytes: file.sizeBytes,
            bulk: true,
          },
        });
      }
    }

    return { deletedCount: owned.length, skippedIds };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async getUsageRow(userId: string) {
    return this.prisma.userStorageUsage.upsert({
      where: { userId },
      create: { userId, bytesUsed: BigInt(0), fileCount: 0 },
      update: {},
    });
  }

  private async resolveCollision(
    userId: string,
    requested: string,
  ): Promise<string> {
    const stem = requested.replace(/\.\w+$/, '');
    const existing = await this.prisma.personalFile.findMany({
      where: {
        userId,
        deletedAt: null,
        displayName: { startsWith: stem },
      },
      select: { displayName: true },
    });
    const taken = new Set(existing.map((r) => r.displayName));
    if (!taken.has(requested)) return requested;

    const dot = requested.lastIndexOf('.');
    const stemFull = dot > 0 ? requested.slice(0, dot) : requested;
    const ext = dot > 0 ? requested.slice(dot) : '';
    for (let i = 2; i < 1000; i++) {
      const candidate = `${stemFull} (${i})${ext}`;
      if (!taken.has(candidate)) return candidate;
    }
    // Defensive — extremely unlikely path.
    return `${stemFull} (${randomBytes(2).toString('hex')})${ext}`;
  }

  /** Used by the GC cron in personal-files.gc.ts. */
  async hardDeleteRow(fileId: string) {
    await this.prisma.$transaction(async (tx) => {
      const file = await tx.personalFile.findUnique({ where: { id: fileId } });
      if (!file) return;
      await tx.personalFile.delete({ where: { id: file.id } });
      await tx.userStorageUsage.update({
        where: { userId: file.userId },
        data: {
          bytesUsed: { decrement: BigInt(file.sizeBytes) },
          fileCount: { decrement: 1 },
        },
      });
    });
  }
}
