import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { deriveCurrency } from '@wusuq/shared';
import { compare, hash } from 'bcryptjs';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { formatPakistaniPhone } from '../common/utils/phone.util';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { mapPrismaRoleToShared } from '../users/user-role.mapper';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import type { JwtUser } from './types/jwt-user.type';

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { phone: dto.identifier }],
        isActive: true,
      },
    });

    if (!user) {
      await this.auditLogsService.create({
        action: 'AUTH_LOGIN_FAILED',
        entity: 'AUTH',
        actorEmail: dto.identifier,
        metadata: { reason: 'user_not_found' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isValid = await compare(dto.password, user.passwordHash);
    if (!isValid) {
      await this.auditLogsService.create({
        action: 'AUTH_LOGIN_FAILED',
        entity: 'AUTH',
        actorUserId: user.id,
        actorEmail: user.email ?? undefined,
        metadata: { reason: 'invalid_password' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtUser = {
      sub: user.id,
      email: user.email!,
      role: mapPrismaRoleToShared(user.role),
    };

    const tokens = await this.issueTokens(payload);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { hashedRefreshToken: await hash(tokens.refreshToken, 10) },
    });
    await this.auditLogsService.create({
      action: 'AUTH_LOGIN_SUCCESS',
      entity: 'AUTH',
      actorUserId: user.id,
      actorEmail: user.email ?? undefined,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: payload.role,
        verified: user.verified,
        currency: user.currency,
        country: user.country,
        // city/consumerKind feed straight into localStorage.wusuq_user on the
        // frontend (login + the auto-login-after-signup flow), which is what
        // ProfileCompletionBanner reads. Without these here, consumerKind set
        // at signup (2026-06-29, mandatory) never reaches the banner and it
        // stays permanently "missing" until the DB value is actually
        // reflected client-side (H5 root cause).
        city: user.city,
        consumerKind: user.consumerKind,
      },
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        hashedRefreshToken: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive || !user.hashedRefreshToken) {
      await this.auditLogsService.create({
        action: 'AUTH_REFRESH_FAILED',
        entity: 'AUTH',
        metadata: { reason: 'user_or_token_state_invalid' },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const refreshMatches = await compare(refreshToken, user.hashedRefreshToken);
    if (!refreshMatches) {
      await this.auditLogsService.create({
        action: 'AUTH_REFRESH_FAILED',
        entity: 'AUTH',
        actorUserId: user.id,
        actorEmail: user.email ?? undefined,
        metadata: { reason: 'refresh_token_hash_mismatch' },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextPayload: JwtUser = {
      sub: user.id,
      email: user.email ?? user.id,
      role: mapPrismaRoleToShared(user.role),
    };

    const tokens = await this.issueTokens(nextPayload);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { hashedRefreshToken: await hash(tokens.refreshToken, 10) },
    });
    await this.auditLogsService.create({
      action: 'AUTH_REFRESH_SUCCESS',
      entity: 'AUTH',
      actorUserId: user.id,
      actorEmail: user.email ?? undefined,
    });

    return tokens;
  }

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hash(dto.password, 10);
    // Currency is derived from the RAW phone first (deriveCurrency is the
    // single source and already normalises internally), then the phone is
    // normalised for storage. A genuinely non-PK number is left unmangled —
    // formatPakistaniPhone returns null for anything that isn't a Pakistani
    // local/E.164 shape, so `?? dto.phone` preserves international numbers
    // (H3; admin-created users already get this via formatPakistaniPhone in
    // users.service.ts — signup was the one path that stored the raw string).
    const currency = deriveCurrency({ phone: dto.phone, country: dto.country });
    const normalizedPhone = formatPakistaniPhone(dto.phone) ?? dto.phone;
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        phone: normalizedPhone,
        consumerKind: dto.consumerKind,
        country: dto.country ?? null,
        currency,
        role: 'consumer',
      },
    });

    return { id: user.id, email: user.email, role: 'consumer' as const };
  }

  async impersonate(targetUserId: string, actor: JwtUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user || (!user.isActive && actor.role !== 'super-admin')) {
      throw new UnauthorizedException('Target user is invalid');
    }

    const payload: JwtUser = {
      sub: user.id,
      email: user.email ?? user.id,
      role: mapPrismaRoleToShared(user.role),
    };

    const tokens = await this.issueTokens(payload);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { hashedRefreshToken: await hash(tokens.refreshToken, 10) },
    });

    // The AuditLog row below is the impersonation trail (kept). We deliberately
    // do NOT notify the impersonated user: a staff/admin "log in as" should be
    // silent to the target (the audit log preserves accountability instead).
    // `dispatcher.authImpersonationStarted` + its template are intentionally
    // left in place — other code/tests may reference them — just not called.
    await this.auditLogsService.create({
      action: 'AUTH_IMPERSONATE',
      entity: 'AUTH',
      entityId: targetUserId,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      metadata: { reason: 'admin impersonation', targetUserId },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: payload.role,
        verified: user.verified,
        city: user.city,
        consumerKind: user.consumerKind,
      },
    };
  }

  async completeProfile(
    userId: string,
    dto: {
      name: string;
      cityName?: string;
      consumerKind?: 'LAWYER' | 'NON_LAWYER' | 'CORPORATE';
      address?: string;
      province?: string;
      district?: string;
      postalCode?: string;
      country?: string;
      phone?: string;
      cnic?: string;
      dateOfBirth?: string;
    },
  ) {
    // Currency locks once the account is active. Re-derive (and update
    // country) only when the user has zero non-archived tickets AND zero
    // wallet balance, so an in-flight account can never end up with a mixed
    // PKR/USD ledger. Phone dial code is the primary currency signal
    // (deriveCurrency), so an unlocked account editing its phone (not just
    // its country) must re-derive the same way — otherwise a consumer who
    // fixes their number before ever transacting would be stuck on whatever
    // currency the (possibly wrong) signup phone implied.
    const [existing, ticketCount] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { walletBalance: true, phone: true, country: true },
      }),
      this.prisma.ticket.count({
        where: { consumerId: userId, archivedAt: null },
      }),
    ]);
    const locked = ticketCount > 0 || Number(existing.walletBalance) !== 0;
    const touchesRegion = dto.country !== undefined || dto.phone !== undefined;
    const currencyUpdate = !touchesRegion
      ? {}
      : locked
        ? { ...(dto.country ? { country: dto.country } : {}) } // contact info only; billing currency stays
        : {
            ...(dto.country ? { country: dto.country } : {}),
            currency: deriveCurrency({
              phone: dto.phone ?? existing.phone,
              country: dto.country ?? existing.country,
            }),
          };

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        ...(dto.cityName ? { city: dto.cityName } : {}),
        ...(dto.consumerKind ? { consumerKind: dto.consumerKind } : {}),
        ...(dto.address ? { address: dto.address } : {}),
        ...(dto.province ? { province: dto.province } : {}),
        ...(dto.district ? { district: dto.district } : {}),
        ...(dto.postalCode ? { postalCode: dto.postalCode } : {}),
        ...(dto.phone ? { phone: dto.phone } : {}),
        ...(dto.cnic ? { cnic: dto.cnic } : {}),
        ...(dto.dateOfBirth ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
        ...currencyUpdate,
      },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      city: user.city,
      consumerKind: user.consumerKind,
      currency: user.currency,
      phone: user.phone,
      cnic: user.cnic,
      dateOfBirth: user.dateOfBirth,
      address: user.address,
      province: user.province,
      district: user.district,
      postalCode: user.postalCode,
      country: user.country,
    };
  }

  async logout(userId?: string) {
    if (userId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { hashedRefreshToken: null },
      });
      await this.auditLogsService.create({
        action: 'AUTH_LOGOUT',
        entity: 'AUTH',
        actorUserId: userId,
      });
    }
    return { success: true };
  }

  async issueTokensForUser(user: {
    id: string;
    email: string | null;
    role: UserRole;
    name: string | null;
  }) {
    const payload: JwtUser = {
      sub: user.id,
      email: user.email ?? '',
      role: mapPrismaRoleToShared(user.role),
    };
    const tokens = await this.issueTokens(payload);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { hashedRefreshToken: await hash(tokens.refreshToken, 10) },
    });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: payload.role,
      },
    };
  }

  private async issueTokens(payload: JwtUser): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtUser> {
    try {
      return await this.jwtService.verifyAsync<JwtUser>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
