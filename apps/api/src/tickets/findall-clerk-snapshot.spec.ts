/**
 * Regression: findAll must return the four clerk-submitted phase-2 snapshot
 * columns to staff (and to the assigned representative), never to consumers.
 *
 * Why this matters: computeClerkEarnings caps each phase-2 line at
 * min(clerkSubmitted, adminFinal). When the clerk value is ABSENT the shared
 * formula falls back to the final column ("no clerk submission recorded").
 * findAll used to omit these columns entirely, so every list-driven surface —
 * notably the admin Review & Complete dialog, which computes its earnings
 * preview from the LIST row — silently lost the cap: raising the per-page rate
 * pushed the CLERK's earnings up (500 → 550 → 600) instead of Wusuq's margin.
 * The shared formula was correct; the data never arrived.
 */
import { jest } from '@jest/globals';
import { computeClerkEarningsBreakdown } from '@wusuq/shared';
import { TicketsService } from './tickets.service';

function makeService(rows: any[]) {
  const prisma: any = {
    ticket: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return new TicketsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

// The client's demonstrated ticket: clerk submitted 10 pages @ 10 = 100
// attested; the admin then marked the rate up to 20/page = 200.
const TICKET = {
  id: 't1',
  batchNo: 'TKT-58520394-488577',
  consumer: { id: 'c1', name: 'Ali Zain Cheema' },
  service: {
    id: 's1',
    name: 'Case Files',
    category: 'judicial',
    type: 'case_files',
  },
  serviceCity: 'Lahore',
  caseType: 'Civil',
  intakeFlow: 'judicial_case_files',
  formPayload: null,
  status: 'WAITING_APPROVAL',
  clerkApprovalStatus: 'SUBMITTED',
  clerkReceiptUrl: null,
  serviceCost: 500,
  totalAmount: 700,
  amountPaid: 0,
  currency: 'PKR',
  fxRateToPkr: null,
  createdBy: null,
  remainderFinalizedAt: null,
  scheduledDate: null,
  nextDate: null,
  hearingType: null,
  deliveryStatus: null,
  trackingNo: null,
  clerkCost: 400,
  defaultClerkCost: null,
  dispatchProofUrl: null,
  deliveryCharges: 0,
  printingCharges: 0,
  attestedCharges: 200, // admin's marked-up value
  nonAttestedCharges: 0,
  additionalCharges: 0,
  // What the clerk actually submitted — the cap basis.
  clerkAttestedCharges: 100,
  clerkNonAttestedCharges: 0,
  clerkPrintingCharges: 0,
  clerkDeliveryCharges: 0,
  assignments: [],
  history: [],
  case: null,
  invoiceItem: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('findAll — clerk-submitted snapshot columns', () => {
  it('returns the clerk snapshot to staff so the earnings cap can apply', async () => {
    const svc = makeService([TICKET]);
    const res: any = await svc.findAll({ page: 1, limit: 10 } as never);
    const row = res.items[0];

    expect(row.clerkAttestedCharges).toBe(100);
    expect(row.clerkNonAttestedCharges).toBe(0);
    expect(row.clerkPrintingCharges).toBe(0);
    expect(row.clerkDeliveryCharges).toBe(0);
  });

  it('the returned row caps clerk earnings at the submitted value, not the markup', async () => {
    const svc = makeService([TICKET]);
    const res: any = await svc.findAll({ page: 1, limit: 10 } as never);
    const row = res.items[0];

    // This is the exact computation the admin Review & Complete dialog runs.
    const b = computeClerkEarningsBreakdown({
      clerkCost: row.clerkCost,
      defaultClerkCost: row.defaultClerkCost,
      attestedCharges: row.attestedCharges,
      nonAttestedCharges: row.nonAttestedCharges,
      printingCharges: row.printingCharges,
      deliveryCharges: row.deliveryCharges,
      clerkAttestedCharges: row.clerkAttestedCharges,
      clerkNonAttestedCharges: row.clerkNonAttestedCharges,
      clerkPrintingCharges: row.clerkPrintingCharges,
      clerkDeliveryCharges: row.clerkDeliveryCharges,
    });

    // Clerk keeps their own 100, NOT the admin's marked-up 200.
    expect(b.attested).toBe(100);
    expect(b.total).toBe(500); // 400 clerk cost + 100 attested
    // Without the snapshot columns this was 600 (400 + the admin's 200).
    expect(b.total).not.toBe(600);
  });

  it('never exposes the clerk snapshot to a pure consumer', async () => {
    const svc = makeService([TICKET]);
    const res: any = await svc.findAll(
      { page: 1, limit: 10 } as never,
      {
        forConsumer: true,
      } as never,
    );
    const row = res.items[0];

    expect(row).not.toHaveProperty('clerkAttestedCharges');
    expect(row).not.toHaveProperty('clerkNonAttestedCharges');
    expect(row).not.toHaveProperty('clerkPrintingCharges');
    expect(row).not.toHaveProperty('clerkDeliveryCharges');
    expect(row).not.toHaveProperty('clerkCost');
  });
});
