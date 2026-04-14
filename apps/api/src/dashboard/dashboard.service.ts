import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { subDays, startOfDay, format } from 'date-fns';

@Injectable()
export class DashboardService {
  private statsCache = new Map<string, { data: unknown; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async getConsumerSummary(userId: string) {
    const now = new Date();

    const [
      totalTickets,
      pendingTickets,
      inProgressTickets,
      completedTickets,
      walletUser,
      outstandingAgg,
      myActiveCases,
      myRecentTickets,
      myNextHearing,
    ] =
      await this.prisma.$transaction([
        this.prisma.ticket.count({
          where: {
            consumerId: userId,
          },
        }),
        this.prisma.ticket.count({
          where: {
            consumerId: userId,
            status: 'PENDING',
          },
        }),
        this.prisma.ticket.count({
          where: {
            consumerId: userId,
            status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
          },
        }),
        this.prisma.ticket.count({
          where: {
            consumerId: userId,
            status: 'COMPLETED',
          },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { walletBalance: true },
        }),
        this.prisma.ticket.aggregate({
          where: {
            consumerId: userId,
            paymentStatus: { not: 'PAID' },
          },
          _sum: {
            totalAmount: true,
            amountPaid: true,
          },
        }),
        this.prisma.case.count({
          where: {
            consumerId: userId,
            status: 'OPEN',
          },
        }),
        this.prisma.ticket.findMany({
          where: { consumerId: userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            batchNo: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            service: { select: { name: true } },
          },
        }),
        this.prisma.hearing.findFirst({
          where: {
            scheduledDate: { gte: now },
            case: { consumerId: userId },
          },
          orderBy: { scheduledDate: 'asc' },
          select: {
            scheduledDate: true,
            hearingType: true,
            case: { select: { title: true } },
          },
        }),
      ]);

    const myTickets = {
      total: totalTickets,
      pending: pendingTickets,
      inProgress: inProgressTickets,
      completed: completedTickets,
    };

    const myOutstanding =
      Number(outstandingAgg._sum.totalAmount || 0) - Number(outstandingAgg._sum.amountPaid || 0);

    return {
      myTickets,
      myWalletBalance: Number(walletUser?.walletBalance || 0),
      myOutstanding: myOutstanding > 0 ? myOutstanding : 0,
      myActiveCases,
      myRecentTickets: myRecentTickets.map((ticket) => ({
        ...ticket,
        totalAmount: Number(ticket.totalAmount || 0),
      })),
      myNextHearing,
    };
  }

  async getSummary(range: string = '7d') {
    const cached = this.statsCache.get(range);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const data = await this.computeSummary(range);
    this.statsCache.set(range, { data, expiresAt: Date.now() + 60_000 });
    return data;
  }

  private async computeSummary(range: string) {
    const daysStr = range.replace('d', '');
    const days = parseInt(daysStr, 10);
    
    if (isNaN(days) || ![7, 30, 90].includes(days)) {
      throw new BadRequestException('Invalid range. Supported values: 7d, 30d, 90d');
    }

    const startDate = startOfDay(subDays(new Date(), days - 1));

    const totalTickets = await this.prisma.ticket.count();
    const completedTickets = await this.prisma.ticket.count({
      where: { status: 'COMPLETED' },
    });

    const revenueResult = await this.prisma.ticket.aggregate({
      _sum: { amountPaid: true, totalAmount: true },
    });
    const totalRevenue = Number(revenueResult._sum.amountPaid || 0);
    const totalOutstanding = Number(revenueResult._sum.totalAmount || 0) - totalRevenue;

    const kpis = {
      totalTickets,
      completedTickets,
      totalRevenue,
      outstandingBalance: totalOutstanding > 0 ? totalOutstanding : 0,
    };

    const statusGroups = await this.prisma.ticket.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const ticketsByStatus = statusGroups.map(g => ({
      name: g.status,
      value: g._count._all,
    }));

    // Fetch tickets in range for trend and mix
    const recentTickets = await this.prisma.ticket.findMany({
      where: { createdAt: { gte: startDate } },
      select: {
        createdAt: true,
        serviceCity: true,
        service: { select: { category: true } },
      },
    });

    // Compute Ticket Trend
    const ticketTrendMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
        ticketTrendMap.set(format(subDays(new Date(), i), 'MMM dd'), 0);
    }
    
    recentTickets.forEach(t => {
      const day = format(t.createdAt, 'MMM dd');
      if (ticketTrendMap.has(day)) {
        ticketTrendMap.set(day, ticketTrendMap.get(day)! + 1);
      }
    });

    const ticketTrend = Array.from(ticketTrendMap.entries())
      .reverse()
      .map(([date, count]) => ({ date, count }));

    // Service Mix & City Mix
    const serviceMixMap = new Map<string, number>();
    const cityMixMap = new Map<string, number>();

    recentTickets.forEach(t => {
      // Service Mix
      const cat = t.service?.category || 'Unknown';
      serviceMixMap.set(cat, (serviceMixMap.get(cat) || 0) + 1);

      // City Mix
      const city = t.serviceCity || 'Unknown';
      cityMixMap.set(city, (cityMixMap.get(city) || 0) + 1);
    });

    const serviceMix = Array.from(serviceMixMap.entries()).map(([name, value]) => ({ name, value }));
    const cityMix = Array.from(cityMixMap.entries()).map(([name, value]) => ({ name, value }));

    // Finance Trend (simplified: based on ticket creation date for simplicity, mapping to their amountPaid)
    // In a real scenario, we'd query WalletTransaction verifiedAt or Invoice paidAt.
    const recentTransactions = await this.prisma.walletTransaction.findMany({
      where: { verifiedAt: { gte: startDate }, status: 'VERIFIED' },
      select: { verifiedAt: true, amount: true },
    });

    const financeTrendMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
        financeTrendMap.set(format(subDays(new Date(), i), 'MMM dd'), 0);
    }
    recentTransactions.forEach(tx => {
       if (!tx.verifiedAt) return;
       const day = format(tx.verifiedAt, 'MMM dd');
       if (financeTrendMap.has(day)) {
           financeTrendMap.set(day, financeTrendMap.get(day)! + Number(tx.amount));
       }
    });
    const financeTrend = Array.from(financeTrendMap.entries())
      .reverse()
      .map(([date, amount]) => ({ date, amount }));

    // Pending Actions
    const pendingVerifications = await this.prisma.walletTransaction.count({
      where: { status: 'PENDING_VERIFICATION' }
    });
    const pendingTickets = await this.prisma.ticket.count({
      where: { status: 'PENDING' }
    });
    
    const pendingActions = {
      pendingVerifications,
      pendingTickets,
    };

    // Recent Activity
    const recentActivity = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      kpis,
      ticketsByStatus,
      ticketTrend,
      financeTrend,
      serviceMix,
      cityMix,
      pendingActions,
      recentActivity,
    };
  }
}
