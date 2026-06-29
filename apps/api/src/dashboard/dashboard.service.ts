import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';
import {
  recommendationsForCase,
  isFlowKey,
  computeClerkEarnings,
  type FlowKey,
} from '@wusuq/shared';

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
    ] = await this.prisma.$transaction([
      this.prisma.ticket.count({
        where: {
          consumerId: userId,
        },
      }),
      this.prisma.ticket.count({
        where: {
          consumerId: userId,
          status: 'UNPAID',
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
          status: { notIn: ['DELIVERED'] },
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
      this.prisma.ticket.findFirst({
        where: {
          scheduledDate: { gte: now },
          consumerId: userId,
          caseId: { not: null },
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
      Number(outstandingAgg._sum.totalAmount || 0) -
      Number(outstandingAgg._sum.amountPaid || 0);

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

  /**
   * Clerk (representative) dashboard. Self-scoped to `repId` — earnings split
   * into realized (work done: COMPLETED + DELIVERED) vs pending (in flight:
   * IN_PROGRESS + WAITING_APPROVAL), plus this-month realized, status counts,
   * recent assignments and upcoming hearings. Earnings use the shared
   * computeClerkEarnings (internal payout; never exposed to consumers).
   */
  async getClerkSummary(repId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

    const tickets = await this.prisma.ticket.findMany({
      where: { assignments: { some: { representativeId: repId } }, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        batchNo: true,
        status: true,
        updatedAt: true,
        scheduledDate: true,
        hearingType: true,
        formPayload: true,
        clerkCost: true,
        defaultClerkCost: true,
        attestedCharges: true,
        nonAttestedCharges: true,
        printingCharges: true,
        deliveryCharges: true,
        service: { select: { name: true } },
        case: { select: { caseNo: true, title: true } },
      },
    });

    const REALIZED = new Set(['COMPLETED', 'DELIVERED']);
    const PENDING = new Set(['IN_PROGRESS', 'WAITING_APPROVAL']);

    let realized = 0;
    let pending = 0;
    let thisMonth = 0;
    const counts: Record<string, number> = {};

    for (const t of tickets) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
      const wantPdf =
        ((t.formPayload ?? {}) as Record<string, unknown>).want_pdf_before_dispatch === 'Yes';
      const earn = computeClerkEarnings({
        clerkCost: toNum(t.clerkCost),
        defaultClerkCost: toNum(t.defaultClerkCost),
        attestedCharges: toNum(t.attestedCharges),
        nonAttestedCharges: toNum(t.nonAttestedCharges),
        printingCharges: toNum(t.printingCharges),
        deliveryCharges: toNum(t.deliveryCharges),
        wantPdf,
      });
      if (REALIZED.has(t.status)) {
        realized += earn;
        if (t.updatedAt >= startOfMonth) thisMonth += earn;
      } else if (PENDING.has(t.status)) {
        pending += earn;
      }
    }

    const recent = tickets.slice(0, 6).map((t) => ({
      id: t.id,
      batchNo: t.batchNo,
      status: t.status,
      service: t.service?.name ?? null,
      caseNo: t.case?.caseNo ?? null,
    }));

    const upcomingHearings = tickets
      .filter((t) => t.scheduledDate && t.scheduledDate >= now)
      .sort((a, b) => a.scheduledDate!.getTime() - b.scheduledDate!.getTime())
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        batchNo: t.batchNo,
        scheduledDate: t.scheduledDate,
        hearingType: t.hearingType,
        caseTitle: t.case?.title ?? null,
      }));

    return {
      earnings: {
        realized: round2(realized),
        pending: round2(pending),
        thisMonth: round2(thisMonth),
      },
      counts: {
        assigned: counts['ASSIGNED'] ?? 0,
        inProgress: counts['IN_PROGRESS'] ?? 0,
        waitingApproval: counts['WAITING_APPROVAL'] ?? 0,
        completed: counts['COMPLETED'] ?? 0,
        delivered: counts['DELIVERED'] ?? 0,
      },
      pendingAcceptance: counts['ASSIGNED'] ?? 0,
      recent,
      upcomingHearings,
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
      throw new BadRequestException(
        'Invalid range. Supported values: 7d, 30d, 90d',
      );
    }

    const startDate = startOfDay(subDays(new Date(), days - 1));
    const prevStart = startOfDay(subDays(new Date(), days * 2 - 1));
    const prevEnd = startDate;

    const totalTickets = await this.prisma.ticket.count();
    const completedTickets = await this.prisma.ticket.count({
      where: { status: 'COMPLETED' },
    });

    const revenueResult = await this.prisma.ticket.aggregate({
      _sum: { amountPaid: true, totalAmount: true },
    });
    const totalRevenue = Number(revenueResult._sum.amountPaid || 0);
    const totalOutstanding =
      Number(revenueResult._sum.totalAmount || 0) - totalRevenue;

    const kpis = {
      totalTickets,
      completedTickets,
      totalRevenue,
      outstandingBalance: totalOutstanding > 0 ? totalOutstanding : 0,
    };

    // Period-over-period deltas (current window vs same-length prior window)
    const [
      currTicketsInRange,
      prevTicketsInRange,
      currCompletedInRange,
      prevCompletedInRange,
      currRevenueAgg,
      prevRevenueAgg,
    ] = await Promise.all([
      this.prisma.ticket.count({ where: { createdAt: { gte: startDate } } }),
      this.prisma.ticket.count({
        where: { createdAt: { gte: prevStart, lt: prevEnd } },
      }),
      this.prisma.ticket.count({
        where: { status: 'COMPLETED', updatedAt: { gte: startDate } },
      }),
      this.prisma.ticket.count({
        where: {
          status: 'COMPLETED',
          updatedAt: { gte: prevStart, lt: prevEnd },
        },
      }),
      // Audit 1.11: revenue = money applied to tickets, which is exactly the
      // TICKET_DEBIT rows (wallet settlement + finance reconcile). TOPUP and
      // TICKET_PAYMENT rows are the consumer handing us money — verifying a
      // TICKET_PAYMENT immediately writes a TICKET_DEBIT for the applied
      // amount, so counting both would double-count.
      this.prisma.walletTransaction.aggregate({
        where: {
          verifiedAt: { gte: startDate },
          status: 'VERIFIED',
          type: 'TICKET_DEBIT',
        },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: {
          verifiedAt: { gte: prevStart, lt: prevEnd },
          status: 'VERIFIED',
          type: 'TICKET_DEBIT',
        },
        _sum: { amount: true },
      }),
    ]);

    const pct = (curr: number, prev: number): number | null => {
      if (prev === 0) return curr === 0 ? 0 : null;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    const kpisDelta = {
      totalTickets: pct(currTicketsInRange, prevTicketsInRange),
      completedTickets: pct(currCompletedInRange, prevCompletedInRange),
      totalRevenue: pct(
        Number(currRevenueAgg._sum.amount || 0),
        Number(prevRevenueAgg._sum.amount || 0),
      ),
      outstandingBalance: null as number | null,
    };

    const statusGroups = await this.prisma.ticket.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const ticketsByStatus = statusGroups.map((g) => ({
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

    recentTickets.forEach((t) => {
      const day = format(t.createdAt, 'MMM dd');
      if (ticketTrendMap.has(day)) {
        ticketTrendMap.set(day, ticketTrendMap.get(day)! + 1);
      }
    });

    const ticketTrend = Array.from(ticketTrendMap.entries())
      .reverse()
      .map(([date, count]) => ({ date, count }));

    // Per-day completed tickets for KPI sparkline
    const completedInRange = await this.prisma.ticket.findMany({
      where: { status: 'COMPLETED', updatedAt: { gte: startDate } },
      select: { updatedAt: true },
    });
    const completedTrendMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      completedTrendMap.set(format(subDays(new Date(), i), 'MMM dd'), 0);
    }
    completedInRange.forEach((t) => {
      const day = format(t.updatedAt, 'MMM dd');
      if (completedTrendMap.has(day)) {
        completedTrendMap.set(day, completedTrendMap.get(day)! + 1);
      }
    });
    const completedTrend = Array.from(completedTrendMap.entries())
      .reverse()
      .map(([date, count]) => ({ date, count }));

    // Service Mix & City Mix
    const serviceMixMap = new Map<string, number>();
    const cityMixMap = new Map<string, number>();

    recentTickets.forEach((t) => {
      // Service Mix
      const cat = t.service?.category || 'Unknown';
      serviceMixMap.set(cat, (serviceMixMap.get(cat) || 0) + 1);

      // City Mix
      const city = t.serviceCity || 'Unknown';
      cityMixMap.set(city, (cityMixMap.get(city) || 0) + 1);
    });

    const serviceMix = Array.from(serviceMixMap.entries()).map(
      ([name, value]) => ({ name, value }),
    );
    const cityMix = Array.from(cityMixMap.entries()).map(([name, value]) => ({
      name,
      value,
    }));

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
    recentTransactions.forEach((tx) => {
      if (!tx.verifiedAt) return;
      const day = format(tx.verifiedAt, 'MMM dd');
      if (financeTrendMap.has(day)) {
        financeTrendMap.set(day, financeTrendMap.get(day)! + Number(tx.amount));
      }
    });
    const financeTrend = Array.from(financeTrendMap.entries())
      .reverse()
      .map(([date, amount]) => ({ date, amount }));

    // Pending Actions — structured for the action center
    const sevenDaysAgo = subDays(new Date(), 7);
    const thirtyDaysAgo = subDays(new Date(), 30);

    const [
      pendingVerifications,
      oldestPendingVerification,
      pendingTicketsCount,
      oldestPendingTicket,
      waitingApprovalCount,
      oldestWaitingApproval,
      clerkSubmittedCount,
      stuckInProgressCount,
      agedOutstandingAgg,
    ] = await Promise.all([
      this.prisma.walletTransaction.count({
        where: { status: 'PENDING_VERIFICATION' },
      }),
      this.prisma.walletTransaction.findFirst({
        where: { status: 'PENDING_VERIFICATION' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.ticket.count({ where: { status: 'UNPAID' } }),
      this.prisma.ticket.findFirst({
        where: { status: 'UNPAID' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.ticket.count({ where: { status: 'WAITING_APPROVAL' } }),
      this.prisma.ticket.findFirst({
        where: { status: 'WAITING_APPROVAL' },
        orderBy: { updatedAt: 'asc' },
        select: { updatedAt: true },
      }),
      this.prisma.ticket.count({
        where: { clerkApprovalStatus: 'SUBMITTED' },
      }),
      this.prisma.ticket.count({
        where: {
          status: 'IN_PROGRESS',
          updatedAt: { lt: sevenDaysAgo },
        },
      }),
      this.prisma.ticket.aggregate({
        where: {
          status: { notIn: ['DELIVERED'] },
          createdAt: { lt: thirtyDaysAgo },
        },
        _sum: { totalAmount: true, amountPaid: true },
      }),
    ]);

    const ageHours = (d: Date | null | undefined): number | null =>
      d ? Math.round((Date.now() - new Date(d).getTime()) / 36e5) : null;

    const agedOutstandingAmount =
      Number(agedOutstandingAgg._sum.totalAmount || 0) -
      Number(agedOutstandingAgg._sum.amountPaid || 0);

    const pendingActions = [
      {
        key: 'wallet_verifications',
        label: 'Wallet receipts to verify',
        count: pendingVerifications,
        oldestAgeHours: ageHours(oldestPendingVerification?.createdAt),
        deepLink: '/wallet?tab=pending',
        severity: 'warning' as const,
      },
      {
        key: 'unpaid_tickets',
        label: 'Tickets awaiting payment',
        count: pendingTicketsCount,
        oldestAgeHours: ageHours(oldestPendingTicket?.createdAt),
        deepLink: '/tickets/unpaid',
        severity: 'info' as const,
      },
      {
        key: 'waiting_approval',
        label: 'Tickets waiting approval',
        count: waitingApprovalCount,
        oldestAgeHours: ageHours(oldestWaitingApproval?.updatedAt),
        deepLink: '/tickets/waiting-approval',
        severity: 'info' as const,
      },
      {
        key: 'clerk_submitted',
        label: 'Clerk submissions to verify',
        count: clerkSubmittedCount,
        oldestAgeHours: null,
        deepLink: '/tickets/in-progress',
        severity: 'info' as const,
      },
      {
        key: 'stuck_in_progress',
        label: 'Tickets stuck in progress > 7 days',
        count: stuckInProgressCount,
        oldestAgeHours: null,
        deepLink: '/tickets/in-progress',
        severity: 'danger' as const,
      },
      {
        key: 'aged_outstanding',
        label: 'Outstanding > 30 days (PKR)',
        count: Math.max(0, Math.round(agedOutstandingAmount)),
        oldestAgeHours: null,
        deepLink: '/finance',
        severity: 'danger' as const,
      },
    ];

    // Cases-with-suggestions row (case workflow redesign §2.5).
    // Counts open, non-deleted cases that have at least one active
    // recommendation. Uses the pure shared filter — no DB roundtrip per case.
    const openCases = await this.prisma.case.findMany({
      where: { status: 'OPEN', deletedAt: null },
      select: {
        id: true,
        createdAt: true,
        tickets: {
          select: {
            status: true,
            intakeFlow: true,
            service: { select: { flowKey: true } },
          },
        },
      },
    });

    let casesWithRecommendations = 0;
    let oldestRecommendationCaseAt: Date | null = null;
    for (const c of openCases) {
      const triggerFlows: FlowKey[] = [];
      const blockingFlows: FlowKey[] = [];
      for (const t of c.tickets) {
        const flow = t.service?.flowKey ?? t.intakeFlow;
        if (!flow || !isFlowKey(flow)) continue;
        blockingFlows.push(flow);
        if (t.status === 'COMPLETED') triggerFlows.push(flow);
      }
      const recs = recommendationsForCase({ triggerFlows, blockingFlows });
      if (recs.length > 0) {
        casesWithRecommendations++;
        if (
          !oldestRecommendationCaseAt ||
          c.createdAt < oldestRecommendationCaseAt
        ) {
          oldestRecommendationCaseAt = c.createdAt;
        }
      }
    }

    pendingActions.push({
      key: 'case_recommendations',
      label: 'Cases with suggested next steps',
      count: casesWithRecommendations,
      oldestAgeHours: oldestRecommendationCaseAt
        ? Math.round((Date.now() - oldestRecommendationCaseAt.getTime()) / 36e5)
        : null,
      deepLink: '/cases?filter=has_recommendations',
      severity: 'info' as const,
    });

    // Recent Activity
    const recentActivity = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Today's hearings — sourced from tickets with scheduledDate set today.
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const todayTickets = await this.prisma.ticket.findMany({
      where: {
        scheduledDate: { gte: todayStart, lte: todayEnd },
        caseId: { not: null },
      },
      orderBy: { scheduledDate: 'asc' },
      take: 8,
      select: {
        id: true,
        scheduledDate: true,
        hearingType: true,
        case: {
          select: {
            id: true,
            title: true,
            consumer: { select: { id: true, name: true } },
          },
        },
      },
    });
    const todaysHearings = todayTickets.map((t) => ({
      id: t.id,
      scheduledDate: t.scheduledDate,
      hearingType: t.hearingType,
      case: t.case,
    }));

    // Top paralegals — by completed-ticket count in current range
    const topAssignments = await this.prisma.assignment.groupBy({
      by: ['representativeId'],
      where: {
        ticket: {
          status: 'COMPLETED',
          updatedAt: { gte: startDate },
        },
      },
      _count: { _all: true },
      orderBy: { _count: { representativeId: 'desc' } },
      take: 5,
    });
    const topRepIds = topAssignments.map((a) => a.representativeId);
    const topRepUsers = topRepIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: topRepIds } },
          select: { id: true, name: true, email: true, city: true },
        })
      : [];
    const topParalegals = topAssignments.map((a) => {
      const user = topRepUsers.find((u) => u.id === a.representativeId);
      return {
        id: a.representativeId,
        name: user?.name ?? 'Unknown',
        email: user?.email ?? null,
        city: user?.city ?? null,
        completed: a._count._all,
      };
    });

    const kpiSparks = {
      totalTickets: ticketTrend.map((p) => p.count),
      completedTickets: completedTrend.map((p) => p.count),
      totalRevenue: financeTrend.map((p) => p.amount),
      outstandingBalance: [] as number[],
    };

    return {
      kpis,
      kpisDelta,
      kpiSparks,
      ticketsByStatus,
      ticketTrend,
      financeTrend,
      serviceMix,
      cityMix,
      pendingActions,
      recentActivity,
      todaysHearings,
      topParalegals,
    };
  }
}
