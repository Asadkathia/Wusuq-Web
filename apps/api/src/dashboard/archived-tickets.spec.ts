import { jest } from '@jest/globals';
import { DashboardService } from './dashboard.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * F1 — client complaint: "I deleted this ticket, everything deleted, but not
 * from here." `getConsumerSummary` must exclude archived (soft-deleted)
 * tickets from its counts, outstanding aggregate, recent-activity list and
 * next-hearing lookup — mirroring `findAll`'s `archivedAt: null` default and
 * the sibling `getClerkSummary`, which already filters correctly.
 */
describe('DashboardService.getConsumerSummary — archived-ticket exclusion (F1)', () => {
  function mkPrisma() {
    const ticketCount = jest.fn(async () => 0);
    const ticketAggregate = jest.fn(async () => ({
      _sum: { totalAmount: 0, amountPaid: 0 },
    }));
    const ticketFindMany = jest.fn(async () => []);
    const ticketFindFirst = jest.fn(async () => null);
    const prisma = {
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
      ticket: {
        count: ticketCount,
        aggregate: ticketAggregate,
        findMany: ticketFindMany,
        findFirst: ticketFindFirst,
      },
      user: {
        findUnique: jest.fn(async () => ({ walletBalance: 0 })),
      },
      case: {
        count: jest.fn(async () => 0),
      },
    } as unknown as PrismaService;
    return {
      prisma,
      ticketCount,
      ticketAggregate,
      ticketFindMany,
      ticketFindFirst,
    };
  }

  it('excludes archived tickets from every ticket query in the summary', async () => {
    const {
      prisma,
      ticketCount,
      ticketAggregate,
      ticketFindMany,
      ticketFindFirst,
    } = mkPrisma();
    const service = new DashboardService(prisma);

    await service.getConsumerSummary('consumer-1');

    // Five count() calls — total / pending / inProgress / active / completed —
    // each scope out archived tickets. `active` was added in batch-6 A (the
    // NOT-COMPLETED-and-NOT-DELIVERED count the dashboard KPI now reads).
    // The loop below is the real invariant; this number just pins that no
    // ticket count is ever added without going through it.
    expect(ticketCount).toHaveBeenCalledTimes(5);
    for (const call of ticketCount.mock.calls) {
      const where = (call[0] as { where: Record<string, unknown> }).where;
      expect(where).toMatchObject({ archivedAt: null });
    }

    // Outstanding aggregate.
    expect(ticketAggregate).toHaveBeenCalledTimes(1);
    const aggWhere = (
      ticketAggregate.mock.calls[0][0] as { where: Record<string, unknown> }
    ).where;
    expect(aggWhere).toMatchObject({ archivedAt: null });

    // Recent-activity list ("Recent activity" source).
    expect(ticketFindMany).toHaveBeenCalledTimes(1);
    const recentWhere = (
      ticketFindMany.mock.calls[0][0] as { where: Record<string, unknown> }
    ).where;
    expect(recentWhere).toMatchObject({ archivedAt: null });

    // Next-hearing lookup.
    expect(ticketFindFirst).toHaveBeenCalledTimes(1);
    const hearingWhere = (
      ticketFindFirst.mock.calls[0][0] as { where: Record<string, unknown> }
    ).where;
    expect(hearingWhere).toMatchObject({ archivedAt: null });
  });

  it('is capable of failing: a query missing archivedAt would fail this assertion', () => {
    // Sanity check on the assertion shape itself — toMatchObject requires the
    // key to be present with the exact value, so a where clause lacking
    // `archivedAt` (the pre-fix state) fails this exact style of assertion.
    expect({ consumerId: 'x' }).not.toMatchObject({ archivedAt: null });
  });
});

/**
 * Client's exact bug report: "the super admin's doesn't go. Here only one
 * ticket is showing, and in his dashboard this money is showing and a ticket
 * is also showing" — a fix had added `archivedAt: null` to the CONSUMER
 * dashboard (above) and the clerk dashboard, but the ADMIN/STAFF dashboard
 * (`getRevenueKpis` + the admin summary counts in `computeSummary`) was
 * missed entirely, so an archived ticket kept inflating staff-facing KPIs
 * while the ticket-detail endpoint correctly 404'd it as gone.
 */
describe('DashboardService.getRevenueKpis — archived-ticket exclusion (admin path)', () => {
  // A minimal in-memory "DB" so the mocked findMany actually behaves like a
  // real Prisma call would: it only returns rows matching the archivedAt
  // filter it was given. This lets the "excludes from totals" test fail for
  // a real reason (the where clause not being passed), not just simulate one.
  const activeRow = {
    totalAmount: 500,
    amountPaid: 200,
    currency: 'PKR',
    fxRateToPkr: null,
    archivedAt: null as Date | null,
  };
  const archivedRow = {
    totalAmount: 999,
    amountPaid: 0,
    currency: 'PKR',
    fxRateToPkr: null,
    archivedAt: new Date('2026-01-01'),
  };
  const allRows = [activeRow, archivedRow];

  function mkPrisma() {
    const ticketFindMany = jest.fn(
      async (args?: { where?: { archivedAt?: null } }) => {
        if (args?.where?.archivedAt === null) {
          return allRows.filter((r) => r.archivedAt === null);
        }
        // Simulates the pre-fix bug: no archivedAt filter means the archived
        // row leaks through.
        return allRows;
      },
    );
    const prisma = {
      ticket: { findMany: ticketFindMany },
    } as unknown as PrismaService;
    return { prisma, ticketFindMany };
  }

  it('passes archivedAt: null in the where clause', async () => {
    const { prisma, ticketFindMany } = mkPrisma();
    const service = new DashboardService(prisma);

    await (
      service as unknown as {
        getRevenueKpis: () => Promise<unknown>;
      }
    ).getRevenueKpis();

    expect(ticketFindMany).toHaveBeenCalledTimes(1);
    const where = (
      ticketFindMany.mock.calls[0][0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({ archivedAt: null });
  });

  it('excludes the archived ticket amount from totalRevenue/outstandingBalance', async () => {
    const { prisma } = mkPrisma();
    const service = new DashboardService(prisma);

    const kpis = await (
      service as unknown as {
        getRevenueKpis: () => Promise<{
          totalRevenue: number;
          outstandingBalance: number;
        }>;
      }
    ).getRevenueKpis();

    // Only the active row should count: paid=200, outstanding=500-200=300.
    // If the archived row (999 total / 0 paid) leaked in, revenue would still
    // be 200 but outstanding would jump to 1099 — assert both.
    expect(kpis.totalRevenue).toBe(200);
    expect(kpis.outstandingBalance).toBe(300);
  });
});

describe('DashboardService.getSummary — admin summary counts exclude archived tickets', () => {
  function mkPrisma() {
    const ticketCount = jest.fn(async () => 0);
    const ticketFindMany = jest.fn(async () => []);
    const ticketFindFirst = jest.fn(async () => null);
    const ticketGroupBy = jest.fn(async () => []);
    const prisma = {
      ticket: {
        count: ticketCount,
        findMany: ticketFindMany,
        findFirst: ticketFindFirst,
        groupBy: ticketGroupBy,
        aggregate: jest.fn(async () => ({
          _sum: { totalAmount: 0, amountPaid: 0 },
        })),
      },
      walletTransaction: {
        aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
        count: jest.fn(async () => 0),
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      case: {
        findMany: jest.fn(async () => []),
      },
      auditLog: {
        findMany: jest.fn(async () => []),
      },
      assignment: {
        groupBy: jest.fn(async () => []),
      },
      user: {
        findMany: jest.fn(async () => []),
      },
    } as unknown as PrismaService;
    return { prisma, ticketCount, ticketGroupBy };
  }

  it('every ticket.count call (totalTickets, completedTickets, and the range/action-center counts) excludes archived tickets', async () => {
    const { prisma, ticketCount } = mkPrisma();
    const service = new DashboardService(prisma);

    await service.getSummary('7d');

    // totalTickets, completedTickets, currTicketsInRange, prevTicketsInRange,
    // currCompletedInRange, prevCompletedInRange, pendingTicketsCount,
    // waitingApprovalCount, clerkSubmittedCount, stuckInProgressCount = 10.
    expect(ticketCount).toHaveBeenCalledTimes(10);
    for (const call of ticketCount.mock.calls) {
      const where = (call[0] as { where: Record<string, unknown> }).where;
      expect(where).toMatchObject({ archivedAt: null });
    }
  });

  it('the ticket status groupBy excludes archived tickets', async () => {
    const { prisma, ticketGroupBy } = mkPrisma();
    const service = new DashboardService(prisma);

    await service.getSummary('7d');

    expect(ticketGroupBy).toHaveBeenCalledTimes(1);
    const where = (
      ticketGroupBy.mock.calls[0][0] as { where: Record<string, unknown> }
    ).where;
    expect(where).toMatchObject({ archivedAt: null });
  });
});
