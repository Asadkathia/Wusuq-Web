import { jest } from '@jest/globals';
import { DashboardService } from './dashboard.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * B3 — the consumer "next hearing" widget must be driven by the clerk-set
 * `Ticket.scheduledDate`, not gated on a linked `Case` row existing.
 * Before the fix, the query filtered `caseId: { not: null }`, so a ticket
 * with a future `scheduledDate` but no `caseId` was silently excluded.
 */
describe('DashboardService.getConsumerSummary — next-hearing query', () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  function mkPrisma(nextHearingRow: unknown) {
    const ticketFindFirst = jest.fn(async () => nextHearingRow);
    const prisma = {
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
      ticket: {
        count: jest.fn(async () => 0),
        aggregate: jest.fn(async () => ({
          _sum: { totalAmount: 0, amountPaid: 0 },
        })),
        findMany: jest.fn(async () => []),
        findFirst: ticketFindFirst,
      },
      user: {
        findUnique: jest.fn(async () => ({ walletBalance: 0 })),
      },
      case: {
        count: jest.fn(async () => 0),
      },
    } as unknown as PrismaService;
    return { prisma, ticketFindFirst };
  }

  it('does not filter on caseId — a ticket with caseId: null and a future scheduledDate is returned', async () => {
    const { prisma, ticketFindFirst } = mkPrisma({
      scheduledDate: futureDate,
      hearingType: 'Hearing',
      case: null,
      service: { name: 'Case Filing' },
    });
    const service = new DashboardService(prisma);

    const summary = await service.getConsumerSummary('consumer-1');

    // Assert the query itself no longer excludes caseId-less tickets.
    const args = ticketFindFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).not.toHaveProperty('caseId');
    expect(args.where).toMatchObject({ consumerId: 'consumer-1' });
    expect((args.where.scheduledDate as { gte: Date }).gte).toBeInstanceOf(
      Date,
    );

    // Assert the response still surfaces a hearing (case-less), falling back
    // to the ticket's service name for the title so the FE's
    // `myNextHearing.case.title` render never sees a null case object.
    expect(summary.myNextHearing).not.toBeNull();
    expect(summary.myNextHearing).toMatchObject({
      scheduledDate: futureDate,
      hearingType: 'Hearing',
      case: { title: 'Case Filing' },
    });
  });

  it('prefers the linked case title when a Case row exists', async () => {
    const { prisma } = mkPrisma({
      scheduledDate: futureDate,
      hearingType: 'Hearing',
      case: { title: 'State vs Ali' },
      service: { name: 'Judicial Case Files' },
    });
    const service = new DashboardService(prisma);

    const summary = await service.getConsumerSummary('consumer-1');

    expect(summary.myNextHearing).toMatchObject({
      case: { title: 'State vs Ali' },
    });
  });

  it('returns null when there is no upcoming hearing', async () => {
    const { prisma } = mkPrisma(null);
    const service = new DashboardService(prisma);

    const summary = await service.getConsumerSummary('consumer-1');

    expect(summary.myNextHearing).toBeNull();
  });
});
