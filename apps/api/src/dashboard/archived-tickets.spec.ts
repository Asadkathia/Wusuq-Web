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

    // Four count() calls (total/pending/inProgress/completed) each scope out
    // archived tickets.
    expect(ticketCount).toHaveBeenCalledTimes(4);
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
