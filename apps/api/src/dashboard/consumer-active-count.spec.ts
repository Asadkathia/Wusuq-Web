/**
 * Batch-6 A: the consumer dashboard's "Active tickets" KPI must agree with the
 * My Tickets "Active" tab, because the consumer reads both on the same data.
 *
 * The KPI used to be summed on the FE as `pending + inProgress` =
 * UNPAID + ASSIGNED + IN_PROGRESS, which silently dropped PAID and
 * WAITING_APPROVAL. The client's own account — 1 UNPAID + 2 PAID + 1 COMPLETED
 * — showed "Active 1" on the dashboard and "Active 3" on My Tickets.
 *
 * The count is now derived server-side as NOT (COMPLETED | DELIVERED), which is
 * exactly the tab's predicate in consumer-ticket-board.tsx.
 */
import { jest } from '@jest/globals';
import { DashboardService } from './dashboard.service';

/** The My Tickets "Active" tab predicate, mirrored from the web board. */
const isActiveOnMyTicketsTab = (status: string) =>
  status !== 'COMPLETED' && status !== 'DELIVERED';

/** The client's account, exactly as recorded in the video. */
const CLIENT_TICKETS = ['UNPAID', 'PAID', 'PAID', 'COMPLETED'];

function makeService(statuses: string[]) {
  const countFor = (where: any): number => {
    const s = where?.status;
    if (!s) return statuses.length;
    if (typeof s === 'string') return statuses.filter((x) => x === s).length;
    if (s.in) return statuses.filter((x) => s.in.includes(x)).length;
    if (s.notIn) return statuses.filter((x) => !s.notIn.includes(x)).length;
    return 0;
  };

  const prisma: any = {
    ticket: {
      count: jest.fn(({ where }: any) => Promise.resolve(countFor(where))),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { totalAmount: 0, amountPaid: 0 } }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ walletBalance: 0 }) },
    case: { count: jest.fn().mockResolvedValue(0) },
  };
  prisma.$transaction = jest.fn((arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return new DashboardService(prisma as never, {} as never);
}

describe('getConsumerSummary — active ticket count', () => {
  it("reproduces the client's account: 3 active, not 1", async () => {
    const svc = makeService(CLIENT_TICKETS);

    const summary: any = await svc.getConsumerSummary('u1');

    expect(summary.myTickets.total).toBe(4);
    expect(summary.myTickets.completed).toBe(1);
    // The number the client expected, and that My Tickets already showed.
    expect(summary.myTickets.active).toBe(3);
    // The number the dashboard used to show: UNPAID + ASSIGNED + IN_PROGRESS.
    expect(summary.myTickets.pending + summary.myTickets.inProgress).toBe(1);
  });

  it('agrees with the My Tickets tab predicate across every status', async () => {
    const all = [
      'UNPAID',
      'PAID',
      'ASSIGNED',
      'IN_PROGRESS',
      'WAITING_APPROVAL',
      'COMPLETED',
      'DELIVERED',
    ];
    const svc = makeService(all);

    const summary: any = await svc.getConsumerSummary('u1');

    expect(summary.myTickets.active).toBe(
      all.filter(isActiveOnMyTicketsTab).length,
    );
    expect(summary.myTickets.active).toBe(5);
  });

  it('counts nothing as active when every ticket is finished', async () => {
    const svc = makeService(['COMPLETED', 'DELIVERED']);

    const summary: any = await svc.getConsumerSummary('u1');

    expect(summary.myTickets.active).toBe(0);
  });
});
