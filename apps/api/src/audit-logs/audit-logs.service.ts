import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

export type CreateAuditLogInput = {
  action: string;
  entity: string;
  entityId?: string;
  actorUserId?: string;
  actorEmail?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        metadata: input.metadata,
      },
    });
  }

  async findAll(query: PaginationQueryDto) {
    const skip = (query.page - 1) * query.limit;

    const where = query.search
      ? {
          OR: [
            {
              action: { contains: query.search, mode: 'insensitive' as const },
            },
            {
              entity: { contains: query.search, mode: 'insensitive' as const },
            },
            {
              actorEmail: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }
}
