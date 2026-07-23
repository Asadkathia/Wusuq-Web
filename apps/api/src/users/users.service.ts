import { Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import type { User, Prisma } from '@prisma/client';
import { USER_ROLES, deriveCurrency } from '@wusuq/shared';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatPakistaniPhone } from '../common/utils/phone.util';
import { CreateRepresentativeDto } from './dto/create-representative.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  mapPrismaRoleToShared,
  mapSharedRoleToPrisma,
} from './user-role.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  async findAll(query: ListUsersDto) {
    const skip = (query.page - 1) * query.limit;

    // I1: exact-role filter, applied server-side so a caller filtering by
    // role (e.g. the admin "Manage Users" screen) gets a full page of
    // matching rows instead of a page of mixed roles with the mismatches
    // hidden client-side. `role` is the shared UserRole (hyphenated); map to
    // the Prisma enum spelling before it hits the where clause.
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: mapSharedRoleToPrisma(query.role) } : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                email: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                phone: { contains: query.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((user) => this.serializeUser(user)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.serializeUser(user);
  }

  async create(
    dto: CreateUserDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const phone = dto.phone
      ? (formatPakistaniPhone(dto.phone) ?? dto.phone)
      : undefined;
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone,
        cnic: dto.cnic,
        address: dto.address,
        province: dto.province,
        district: dto.district,
        city: dto.city,
        passwordHash: await hash(dto.password, 10),
        role: mapSharedRoleToPrisma(dto.role),
        // Billing currency is derived once at creation (single source:
        // deriveCurrency). The CreateUserDto has no `country` field (and it
        // lives in another agent's ownership), so we derive from phone only —
        // PKR for +92 / local PK numbers, USD otherwise, default PKR when no
        // phone is on file.
        currency: deriveCurrency({ phone }),
      },
    });
    await this.auditLogsService.create({
      action: 'USER_CREATED',
      entity: 'USER',
      entityId: user.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { role: user.role },
    });

    return this.serializeUser(user);
  }

  async createRepresentative(
    dto: CreateRepresentativeDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const phone = dto.phone
      ? (formatPakistaniPhone(dto.phone) ?? dto.phone)
      : undefined;
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone,
        address: dto.address,
        serviceFocus: dto.serviceFocus,
        court: dto.court,
        courtCity: dto.courtCity,
        courtLevel: dto.courtLevel,
        payoutMethod: dto.payoutMethod,
        payoutBankName: dto.payoutBankName,
        payoutAccountTitle: dto.payoutAccountTitle,
        payoutAccountNumber: dto.payoutAccountNumber,
        payoutJazzCash: dto.payoutJazzCash,
        payoutEasyPaisa: dto.payoutEasyPaisa,
        province: dto.province,
        district: dto.district,
        city: dto.city,
        passwordHash: await hash(dto.password, 10),
        role: mapSharedRoleToPrisma('representative'),
        // Derived once at creation (no `country` on the DTO — derive from phone).
        currency: deriveCurrency({ phone }),
      },
    });

    await this.auditLogsService.create({
      action: 'REPRESENTATIVE_CREATED',
      entity: 'USER',
      entityId: user.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });
    return this.serializeUser(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        country: true,
        walletBalance: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const nextPhone = dto.phone
      ? (formatPakistaniPhone(dto.phone) ?? dto.phone)
      : undefined;

    // Currency locks once the account is active. Re-derive only while the user
    // has zero non-archived tickets AND a zero wallet balance, so an in-flight
    // account can never end up with a mixed PKR/USD ledger. Derive from BOTH the
    // effective phone AND the stored country — dropping country would silently
    // flip a country-derived USD account to PKR on an unrelated edit (e.g. an
    // address change). Including country makes the re-derive idempotent.
    const ticketCount = await this.prisma.ticket.count({
      where: { consumerId: id, archivedAt: null },
    });
    const locked = ticketCount > 0 || Number(existing.walletBalance) !== 0;
    const currencyUpdate = locked
      ? {}
      : {
          currency: deriveCurrency({
            phone: nextPhone ?? existing.phone,
            country: existing.country ?? undefined,
          }),
        };

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        phone: nextPhone,
        passwordHash: dto.password ? await hash(dto.password, 10) : undefined,
        role: dto.role ? mapSharedRoleToPrisma(dto.role) : undefined,
        verified: dto.verified,
        isActive: dto.isActive,
        courtLevel: dto.courtLevel,
        payoutMethod: dto.payoutMethod,
        payoutBankName: dto.payoutBankName,
        payoutAccountTitle: dto.payoutAccountTitle,
        payoutAccountNumber: dto.payoutAccountNumber,
        payoutJazzCash: dto.payoutJazzCash,
        payoutEasyPaisa: dto.payoutEasyPaisa,
        // Address / geo + CNIC — undefined fields are ignored by Prisma, so an
        // admin editing only some of these never clears the rest (batch-3 H2).
        address: dto.address,
        province: dto.province,
        district: dto.district,
        city: dto.city,
        postalCode: dto.postalCode,
        cnic: dto.cnic,
        ...currencyUpdate,
      },
    });
    await this.auditLogsService.create({
      action: 'USER_UPDATED',
      entity: 'USER',
      entityId: user.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    if (dto.password) {
      await this.dispatcher.authPasswordChanged(id).catch(() => undefined);
    }

    return this.serializeUser(user);
  }

  async deactivate(
    id: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    await this.ensureExists(id);
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    await this.auditLogsService.create({
      action: 'USER_DEACTIVATED',
      entity: 'USER',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return { success: true };
  }

  async activate(
    id: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    await this.ensureExists(id);
    await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
    await this.auditLogsService.create({
      action: 'USER_ACTIVATED',
      entity: 'USER',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return { success: true };
  }

  async userTickets(userId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { consumerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { service: { select: { name: true, category: true } } },
    });
    return { items: tickets, total: tickets.length };
  }

  roles() {
    return USER_ROLES;
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  // Payout fields (+ courtLevel) are staff-only PII (C4/C5). This serializer
  // is private and only ever reached via UsersController routes, ALL of which
  // are gated behind `@RequirePermissions('users.read' | 'users.write')` —
  // permissions held ONLY by staff roles in ROLE_PERMISSIONS
  // (super-admin/manager-admin/staff-admin/lead-admin; see isStaffRole in
  // @wusuq/shared). No consumer-class or representative role holds either
  // permission, so a rep can never list/read another user (or themselves)
  // through this module, and a consumer can never reach it at all — the route
  // guard IS the redaction guarantee here. Every OTHER place a User is turned
  // into an API response (auth.service login/refresh/completeProfile,
  // representativeCandidates' explicit `select`) builds its own explicit
  // field allowlist that does not include these columns, so adding them to
  // the Prisma model does not leak them anywhere else. Don't relax the
  // `users.read`/`users.write` grants on ROLE_PERMISSIONS without revisiting
  // this comment.
  private serializeUser(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      cnic: user.cnic,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      photoUrl: user.photoUrl,
      address: user.address,
      country: user.country,
      province: user.province,
      district: user.district,
      tehsil: user.tehsil,
      city: user.city,
      postalCode: user.postalCode,
      serviceFocus: user.serviceFocus,
      court: user.court,
      courtCity: user.courtCity,
      courtLevel: user.courtLevel,
      payoutMethod: user.payoutMethod,
      payoutBankName: user.payoutBankName,
      payoutAccountTitle: user.payoutAccountTitle,
      payoutAccountNumber: user.payoutAccountNumber,
      payoutJazzCash: user.payoutJazzCash,
      payoutEasyPaisa: user.payoutEasyPaisa,
      role: mapPrismaRoleToShared(user.role),
      // Consumer user-type (Civilian/Lawyer/Company) — needed so the profile
      // User-Type editor pre-fills the consumer's real type instead of a blank
      // that invites an accidental overwrite (batch-3 H5/H1).
      consumerKind: user.consumerKind,
      verified: user.verified,
      isActive: user.isActive,
      walletBalance: user.walletBalance,
      currency: user.currency,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
