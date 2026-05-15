import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQueryDto) {
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

    const scopedWhere: Prisma.TicketDocumentWhereInput = {
      ...where,
      ...(query.consumerId
        ? {
            ticket: {
              ...(where.ticket as Prisma.TicketWhereInput | undefined),
              consumerId: query.consumerId,
            },
          }
        : {}),
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
