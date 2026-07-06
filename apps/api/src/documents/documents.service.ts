import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQueryDto, opts?: { forConsumer?: boolean }) {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.TicketDocumentWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { type: { contains: query.search, mode: 'insensitive' } },
            {
              ticket: {
                batchNo: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            },
          ],
        }
      : {};

    const ticketWhere: Prisma.TicketWhereInput | undefined = where.ticket as
      | Prisma.TicketWhereInput
      | undefined;

    const scopedWhere: Prisma.TicketDocumentWhereInput = {
      ...where,
      ...(query.consumerId || opts?.forConsumer
        ? {
            ticket: {
              ...ticketWhere,
              ...(query.consumerId ? { consumerId: query.consumerId } : {}),
              // Consumer-facing list/export must only surface downloadable
              // deliverables — same gate as `redactTicketForConsumer`
              // (tickets.service.ts ~L553-560): visible-to-consumer docs on
              // a ticket that has reached COMPLETED/DELIVERED. Without
              // this, internal WORK_DOCUMENTs and docs on still-in-flight
              // tickets rendered a Download button that then 403'd.
              ...(opts?.forConsumer
                ? { status: { in: ['COMPLETED', 'DELIVERED'] } }
                : {}),
            },
          }
        : {}),
      ...(opts?.forConsumer ? { visibleToConsumer: true } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticketDocument.findMany({
        where: scopedWhere,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ticket: {
            select: {
              id: true,
              batchNo: true,
              consumer: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.ticketDocument.count({ where: scopedWhere }),
    ]);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }
}
