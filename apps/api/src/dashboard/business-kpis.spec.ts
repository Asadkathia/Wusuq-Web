import { jest } from '@jest/globals';
import { DashboardService } from './dashboard.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Batch-8 items 1, 2 and 7 — the four super-admin KPIs (batch-7 3.1).
 *
 * Client, on video, looking at a board with nothing assigned to anybody:
 *   "PKR 100 has gone to a representative automatically. I haven't assigned
 *    anyone! Where did this 100 rupees go?"
 */
describe('DashboardService.getBusinessKpis', () => {
  type TicketRow = Record<string, unknown>;

  function mkService(
    tickets: TicketRow[],
    opts?: { credit?: number; nonPkrWallets?: number },
  ) {
    const prisma = {
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
      ticket: {
        findMany: jest.fn(async () => tickets),
        count: jest.fn(async () => 0),
        aggregate: jest.fn(async () => ({
          _sum: { totalAmount: 0, amountPaid: 0 },
        })),
        groupBy: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
      },
      user: {
        aggregate: jest.fn(async () => ({
          _sum: { walletBalance: opts?.credit ?? 0 },
        })),
        count: jest.fn(async () => opts?.nonPkrWallets ?? 0),
        findUnique: jest.fn(async () => ({ walletBalance: 0 })),
        findMany: jest.fn(async () => []),
      },
      assignment: {
        groupBy: jest.fn(async () => []),
        findMany: jest.fn(async () => []),
      },
      case: { count: jest.fn(async () => 0) },
    } as unknown as PrismaService;
    const service = new DashboardService(prisma);
    // getBusinessKpis is private; exercising it directly keeps the assertion
    // on the money rule rather than on the whole summary payload.
    return (
      service as unknown as {
        getBusinessKpis(): Promise<{
          totalBusiness: number;
          wusuqProfit: number;
          representativeProfit: number;
          nonPkrWalletCount: number;
        }>;
      }
    ).getBusinessKpis();
  }

  /** A PKR ticket the consumer bought a PDF on — worth PDF_CLERK_FEE (100). */
  const pdfTicket = (assigned: boolean): TicketRow => ({
    totalAmount: 1100,
    amountPaid: 0,
    currency: 'PKR',
    fxRateToPkr: null,
    clerkCost: null,
    defaultClerkCost: null,
    attestedCharges: 0,
    nonAttestedCharges: 0,
    printingCharges: 0,
    deliveryCharges: 0,
    clerkAttestedCharges: null,
    clerkNonAttestedCharges: null,
    clerkPrintingCharges: null,
    clerkDeliveryCharges: null,
    formPayload: { want_pdf_before_dispatch: 'Yes' },
    assignments: assigned ? [{ id: 'a1' }] : [],
  });

  // ITEM 1 — the reported defect, reproduced exactly.
  it('pays NOTHING for a ticket with no active assignment', async () => {
    const kpis = await mkService([pdfTicket(false)]);
    expect(kpis.representativeProfit).toBe(0);
  });

  it('still pays the PDF fee once the ticket IS assigned', async () => {
    const kpis = await mkService([pdfTicket(true)]);
    expect(kpis.representativeProfit).toBe(100);
  });

  it('leaves Wusuq Profit whole when nobody is assigned', async () => {
    // The knock-on: wusuqProfit = totalBusiness − representativeProfit, so the
    // phantom 100 was also understating Wusuq's own margin.
    const kpis = await mkService([pdfTicket(false)]);
    expect(kpis.totalBusiness).toBe(1100);
    expect(kpis.wusuqProfit).toBe(1100);
  });

  // ITEM 2 — `Number(x ?? 0)` turns a NULL clerkCost into 0, and because
  // `0 != null` is TRUE the shared fn's defaultClerkCost fallback could never
  // fire. This is the coercion CLAUDE.md already warns about for this function.
  it('falls back to defaultClerkCost when clerkCost is NULL', async () => {
    const kpis = await mkService([
      {
        ...pdfTicket(true),
        formPayload: {},
        clerkCost: null,
        defaultClerkCost: 600,
      },
    ]);
    expect(kpis.representativeProfit).toBe(600);
  });

  it('honours an explicit clerkCost of 0 rather than falling back', async () => {
    // The absence check must stay strict-equality: a genuine 0 is a real
    // value, not "no value recorded".
    const kpis = await mkService([
      {
        ...pdfTicket(true),
        formPayload: {},
        clerkCost: 0,
        defaultClerkCost: 600,
      },
    ]);
    expect(kpis.representativeProfit).toBe(0);
  });

  // ITEM 7 — USD wallets cannot join a PKR total (no per-wallet FX rate), but
  // they were dropped with no marker at all.
  it('reports how many foreign-currency wallets were excluded', async () => {
    const kpis = await mkService([], { credit: 10000, nonPkrWallets: 2 });
    expect(kpis.nonPkrWalletCount).toBe(2);
  });
});
