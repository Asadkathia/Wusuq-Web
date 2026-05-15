import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { subDays, startOfDay } from 'date-fns';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  listAvailable() {
    return [
      'logs',
      'cases-processed',
      'cases-services',
      'cases-city',
      'cases-status',
      'cases-turnaround',
    ];
  }

  async run(type: string, filters?: { dateRange?: string; status?: string }) {
    const where: Prisma.TicketWhereInput = {};
    if (filters?.dateRange && filters.dateRange !== 'all') {
      const days = parseInt(filters.dateRange.replace('d', ''), 10);
      if (!isNaN(days)) {
        where.createdAt = { gte: startOfDay(subDays(new Date(), days - 1)) };
      }
    }
    if (filters?.status && filters.status !== 'all') {
      where.status = filters.status as Prisma.TicketWhereInput['status'];
    }

    if (type === 'logs') {
      const logsWhere: Prisma.AuditLogWhereInput = {};
      if (where.createdAt)
        logsWhere.createdAt =
          where.createdAt as Prisma.AuditLogWhereInput['createdAt'];
      return {
        type,
        data: await this.prisma.auditLog.findMany({
          where: logsWhere,
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      };
    }

    if (type === 'cases-processed') {
      const total = await this.prisma.ticket.count({ where });
      const completed = await this.prisma.ticket.count({
        where: { ...where, status: 'COMPLETED' },
      });
      return {
        type,
        data: {
          total,
          completed,
          processedRate: total > 0 ? Number((completed / total).toFixed(4)) : 0,
        },
      };
    }

    if (type === 'cases-services') {
      const rows = await this.prisma.ticket.groupBy({
        by: ['serviceId'],
        where,
        _count: { _all: true },
      });
      const services = await this.prisma.service.findMany({
        where: { id: { in: rows.map((r) => r.serviceId) } },
      });
      const serviceMap = new Map(services.map((s) => [s.id, s]));

      return {
        type,
        data: rows.map((row) => ({
          serviceId: row.serviceId,
          serviceName: serviceMap.get(row.serviceId)?.name ?? row.serviceId,
          category: serviceMap.get(row.serviceId)?.category ?? null,
          count: row._count._all,
        })),
      };
    }

    if (type === 'cases-city') {
      const rows = await this.prisma.ticket.groupBy({
        by: ['serviceCity'],
        where,
        _count: { _all: true },
      });

      return {
        type,
        data: rows.map((row) => ({
          city: row.serviceCity ?? 'Unknown',
          count: row._count._all,
        })),
      };
    }

    if (type === 'cases-status') {
      const rows = await this.prisma.ticket.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      });

      return {
        type,
        data: rows.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
      };
    }

    if (type === 'cases-turnaround') {
      const completed = await this.prisma.ticket.findMany({
        where: { ...where, status: 'COMPLETED' },
        select: { createdAt: true, updatedAt: true, batchNo: true },
      });

      const entries = completed.map((ticket) => {
        const ms = ticket.updatedAt.getTime() - ticket.createdAt.getTime();
        return {
          batchNo: ticket.batchNo,
          turnaroundHours: Number((ms / (1000 * 60 * 60)).toFixed(2)),
        };
      });

      const avg =
        entries.length > 0
          ? Number(
              (
                entries.reduce((acc, item) => acc + item.turnaroundHours, 0) /
                entries.length
              ).toFixed(2),
            )
          : 0;

      return { type, data: { averageHours: avg, items: entries } };
    }

    return { type, data: [] };
  }
}
