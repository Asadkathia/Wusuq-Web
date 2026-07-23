/**
 * D2 (bulk delete ownership enforcement) + D3 (case-file-upload admin
 * notification dispatch) — client review batch 3, item set 1.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PersonalFilesService } from './personal-files.service';

type Row = {
  id: string;
  userId: string;
  displayName: string;
  sizeBytes: number;
  deletedAt: Date | null;
};

function makeService(rows: Row[]) {
  const state = new Map(rows.map((r) => [r.id, { ...r }]));

  const prisma = {
    personalFile: {
      findMany: jest.fn(async (args: any) => {
        const ids: string[] = args.where?.id?.in ?? [];
        const userId = args.where?.userId;
        const wantsNotDeleted = args.where?.deletedAt === null;
        return ids
          .map((id) => state.get(id))
          .filter(
            (r): r is Row =>
              !!r &&
              r.userId === userId &&
              (!wantsNotDeleted || r.deletedAt === null),
          )
          .map((r) => ({
            id: r.id,
            displayName: r.displayName,
            sizeBytes: r.sizeBytes,
          }));
      }),
      updateMany: jest.fn(async (args: any) => {
        const ids: string[] = args.where?.id?.in ?? [];
        let count = 0;
        for (const id of ids) {
          const row = state.get(id);
          if (
            row &&
            row.userId === args.where.userId &&
            row.deletedAt === null
          ) {
            row.deletedAt = args.data.deletedAt;
            count++;
          }
        }
        return { count };
      }),
      findUnique: jest.fn(async (args: any) => {
        const row = state.get(args.where.id);
        if (!row) return null;
        return {
          id: row.id,
          displayName: row.displayName,
          user: { name: 'Test Consumer' },
        };
      }),
    },
  } as any;

  const auditLogs = { create: jest.fn(async () => undefined) };
  const notificationDispatcher = {
    caseFileUploaded: jest.fn(async () => undefined),
  };

  const service = new PersonalFilesService(
    prisma,
    {} as any,
    auditLogs as any,
    notificationDispatcher as any,
  );

  return { service, prisma, auditLogs, notificationDispatcher, state };
}

describe('PersonalFilesService.bulkSoftDelete — ownership enforcement (D2)', () => {
  it('soft-deletes only files owned by the caller, skipping the rest', async () => {
    const { service, state } = makeService([
      {
        id: 'a',
        userId: 'user-1',
        displayName: 'a.pdf',
        sizeBytes: 10,
        deletedAt: null,
      },
      {
        id: 'b',
        userId: 'user-1',
        displayName: 'b.pdf',
        sizeBytes: 20,
        deletedAt: null,
      },
      // Owned by a different user — must never be deleted by user-1's call.
      {
        id: 'c',
        userId: 'user-2',
        displayName: 'c.pdf',
        sizeBytes: 30,
        deletedAt: null,
      },
    ]);

    const result = await service.bulkSoftDelete('user-1', null, [
      'a',
      'b',
      'c',
    ]);

    expect(result.deletedCount).toBe(2);
    expect(result.skippedIds).toEqual(['c']);
    expect(state.get('a')!.deletedAt).not.toBeNull();
    expect(state.get('b')!.deletedAt).not.toBeNull();
    // The foreign file must remain untouched.
    expect(state.get('c')!.deletedAt).toBeNull();
  });

  it('skips ids that do not exist or are already deleted, without failing', async () => {
    const { service, state } = makeService([
      {
        id: 'a',
        userId: 'user-1',
        displayName: 'a.pdf',
        sizeBytes: 10,
        deletedAt: null,
      },
      {
        id: 'b',
        userId: 'user-1',
        displayName: 'b.pdf',
        sizeBytes: 20,
        deletedAt: new Date(),
      },
    ]);

    const result = await service.bulkSoftDelete('user-1', null, [
      'a',
      'b',
      'does-not-exist',
    ]);

    expect(result.deletedCount).toBe(1);
    expect(result.skippedIds.sort()).toEqual(['b', 'does-not-exist'].sort());
    expect(state.get('a')!.deletedAt).not.toBeNull();
  });

  it('writes an audit-log row per deleted file, never for a foreign/skipped id', async () => {
    const { service, auditLogs } = makeService([
      {
        id: 'a',
        userId: 'user-1',
        displayName: 'a.pdf',
        sizeBytes: 10,
        deletedAt: null,
      },
      {
        id: 'c',
        userId: 'user-2',
        displayName: 'c.pdf',
        sizeBytes: 30,
        deletedAt: null,
      },
    ]);

    await service.bulkSoftDelete('user-1', 'me@example.com', ['a', 'c']);

    expect(auditLogs.create).toHaveBeenCalledTimes(1);
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'a', actorUserId: 'user-1' }),
    );
  });
});

describe('PersonalFilesService.uploadCaseFile — admin notification dispatch (D3)', () => {
  it('dispatches caseFileUploaded after a consumer uploads a case file', async () => {
    const PDF_BUF = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
    ]);
    const prisma = {
      personalFile: {
        create: jest.fn(async (a: any) => ({
          id: 'file-1',
          userId: a.data.userId,
          displayName: a.data.displayName,
          mimeType: a.data.mimeType,
          sizeBytes: a.data.sizeBytes,
          createdAt: new Date(),
          deletedAt: null,
        })),
        findMany: jest.fn(async () => []),
        update: jest.fn(async (args: any) => ({
          id: 'file-1',
          userId: 'user-1',
          displayName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: PDF_BUF.length,
          createdAt: new Date(),
          deletedAt: null,
          ...args.data,
        })),
        findFirst: jest.fn(async () => null),
      },
      userStorageUsage: {
        upsert: jest.fn(async () => ({
          userId: 'user-1',
          bytesUsed: BigInt(0),
          fileCount: 0,
        })),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          personalFile: { create: prisma.personalFile.create },
          userStorageUsage: { upsert: prisma.userStorageUsage.upsert },
        }),
      ),
    } as any;

    const storage = {
      put: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    };
    const auditLogs = { create: jest.fn(async () => undefined) };
    const notificationDispatcher = {
      caseFileUploaded: jest.fn(async () => undefined),
    };

    const service = new PersonalFilesService(
      prisma,
      storage as any,
      auditLogs as any,
      notificationDispatcher as any,
    );

    await service.uploadCaseFile(
      'user-1',
      null,
      {
        buffer: PDF_BUF,
        originalName: 'test.pdf',
        declaredMime: 'application/pdf',
      },
      { serviceId: 'svc_judicial_case_files', cityId: 'city-1' },
    );

    expect(notificationDispatcher.caseFileUploaded).toHaveBeenCalledTimes(1);
    expect(notificationDispatcher.caseFileUploaded).toHaveBeenCalledWith(
      'file-1',
    );
  });

  it('does not let a notification failure fail the upload', async () => {
    const PDF_BUF = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
    ]);
    const prisma = {
      personalFile: {
        create: jest.fn(async (a: any) => ({
          id: 'file-2',
          userId: a.data.userId,
          displayName: a.data.displayName,
          mimeType: a.data.mimeType,
          sizeBytes: a.data.sizeBytes,
          createdAt: new Date(),
          deletedAt: null,
        })),
        findMany: jest.fn(async () => []),
        update: jest.fn(async (args: any) => ({
          id: 'file-2',
          userId: 'user-1',
          displayName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: PDF_BUF.length,
          createdAt: new Date(),
          deletedAt: null,
          ...args.data,
        })),
        findFirst: jest.fn(async () => null),
      },
      userStorageUsage: {
        upsert: jest.fn(async () => ({
          userId: 'user-1',
          bytesUsed: BigInt(0),
          fileCount: 0,
        })),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          personalFile: { create: prisma.personalFile.create },
          userStorageUsage: { upsert: prisma.userStorageUsage.upsert },
        }),
      ),
    } as any;

    const storage = {
      put: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    };
    const auditLogs = { create: jest.fn(async () => undefined) };
    const notificationDispatcher = {
      caseFileUploaded: jest.fn(async () => {
        throw new Error('notification service down');
      }),
    };

    const service = new PersonalFilesService(
      prisma,
      storage as any,
      auditLogs as any,
      notificationDispatcher as any,
    );

    await expect(
      service.uploadCaseFile(
        'user-1',
        null,
        {
          buffer: PDF_BUF,
          originalName: 'test.pdf',
          declaredMime: 'application/pdf',
        },
        { serviceId: 'svc_judicial_case_files', cityId: 'city-1' },
      ),
    ).resolves.toBeDefined();
  });
});
