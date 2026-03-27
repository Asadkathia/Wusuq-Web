import { Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { USER_ROLES } from '@wusuq/shared';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateRepresentativeDto } from './dto/create-representative.dto';
import { CreateUserDto } from './dto/create-user.dto';
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
  ) {}

  async findAll(query: PaginationQueryDto) {
    const skip = (query.page - 1) * query.limit;

    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

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
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        cnic: (dto as any).cnic,
        address: (dto as any).address,
        province: (dto as any).province,
        district: (dto as any).district,
        city: (dto as any).city,
        passwordHash: await hash(dto.password, 10),
        role: mapSharedRoleToPrisma(dto.role),
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
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        serviceFocus: dto.serviceFocus,
        court: dto.court,
        courtCity: dto.courtCity,
        district: dto.district,
        city: dto.city,
        passwordHash: await hash(dto.password, 10),
        role: mapSharedRoleToPrisma('representative'),
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
    await this.ensureExists(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash: dto.password ? await hash(dto.password, 10) : undefined,
        role: dto.role ? mapSharedRoleToPrisma(dto.role) : undefined,
        verified: dto.verified,
        isActive: dto.isActive,
      },
    });
    await this.auditLogsService.create({
      action: 'USER_UPDATED',
      entity: 'USER',
      entityId: user.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

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

  private serializeUser(user: Record<string, any>) {
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
      role: mapPrismaRoleToShared(user.role),
      verified: user.verified,
      isActive: user.isActive,
      walletBalance: user.walletBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
