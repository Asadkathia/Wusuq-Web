import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

// Workstream D1, Task 3 (B11): admin "Review & Complete" recomputes
// printing/attested/non-attested charges from editable page counts, mirroring
// the clerk cost-entry precedence — explicit lump wins, then pages × rate,
// then the persisted value.

function makeDispatcher() {
  return {
    ticketCreated: jest.fn().mockResolvedValue(undefined),
    ticketStatusChanged: jest.fn().mockResolvedValue(undefined),
    ticketAssigned: jest.fn().mockResolvedValue(undefined),
    ticketReassigned: jest.fn().mockResolvedValue(undefined),
    ticketAssignmentAccepted: jest.fn().mockResolvedValue(undefined),
    ticketAssignmentRejected: jest.fn().mockResolvedValue(undefined),
    ticketClerkCostsSubmitted: jest.fn().mockResolvedValue(undefined),
    ticketClerkReceiptSubmitted: jest.fn().mockResolvedValue(undefined),
    ticketClerkReceiptDecided: jest.fn().mockResolvedValue(undefined),
    ticketDocumentUploaded: jest.fn().mockResolvedValue(undefined),
    ticketRegenerated: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
    caseDriftDetected: jest.fn().mockResolvedValue(undefined),
  };
}

function buildHarness(ticketOverrides: Record<string, unknown> = {}) {
  const ticket = {
    id: 'tkt-1',
    consumerId: 'c-1',
    status: 'WAITING_APPROVAL',
    deliveryStatus: 'PENDING',
    intakeFlow: 'judicial_case_files',
    serviceCost: 3000,
    clerkCost: 0,
    attestedCharges: 400,
    nonAttestedCharges: 0,
    printingCharges: 150,
    deliveryCharges: 250,
    additionalCharges: 0,
    additionalServiceCost: 0,
    discountPrice: 0,
    amountPaid: 3000,
    remainderFinalizedAt: null,
    noOfPages: null,
    costPerPage: null,
    attestedPages: null,
    attestedCostPerPage: null,
    nonAttestedPages: null,
    nonAttestedCostPerPage: null,
    ...ticketOverrides,
  };
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const userUpdate = jest.fn().mockResolvedValue({ id: 'c-1' });
  const walletTxnCreate = jest.fn().mockResolvedValue({ id: 'wtx-1' });
  const prisma: Record<string, unknown> = {
    $executeRaw: jest.fn(),
    ticket: {
      findUnique: jest.fn().mockResolvedValue(ticket),
      update: jest.fn().mockResolvedValue(ticket),
      updateMany,
    },
    user: { update: userUpdate },
    walletTransaction: { create: walletTxnCreate },
    ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
    assignment: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const wallet = {
    settleTicketsForUser: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TicketsService(
    prisma as never,
    { create: jest.fn().mockResolvedValue({}) } as never,
    { resolve: jest.fn() } as never,
    { resolveProvinceByCity: jest.fn() } as never,
    makeDispatcher() as never,
    wallet as never,
  );
  return {
    service,
    prisma,
    updateMany,
    ticket,
    wallet,
    userUpdate,
    walletTxnCreate,
  };
}

const actor = { actorUserId: 'admin-1', actorEmail: 'a@x.com' };

// clerk-payout invariant (the reason this whole branch exists): the four
// clerk-submitted snapshot columns are written ONLY by submitClerkCosts and
// must never be touched by finalizeRemainderCore — an admin markup after
// submit must not raise clerk pay. This is the REAL guard for that
// invariant (clerk-payout.spec.ts's identically-worded test is a pure
// computeClerkEarningsBreakdown call with hand-written inputs and never
// touches TicketsService, so it can't catch a regression here).
const CLERK_SNAPSHOT_KEYS = [
  'clerkAttestedCharges',
  'clerkNonAttestedCharges',
  'clerkPrintingCharges',
  'clerkDeliveryCharges',
] as const;

function expectFinalizeNeverWritesClerkSnapshot(updateMany: jest.Mock) {
  const data = (
    updateMany.mock.calls[0][0] as { data: Record<string, unknown> }
  ).data;
  for (const key of CLERK_SNAPSHOT_KEYS) {
    expect(data).not.toHaveProperty(key);
  }
}

describe('finalizeRemainder — editable page counts (B11)', () => {
  it('recomputes attestedCharges from pages × rate and persists the page count', async () => {
    const { service, updateMany } = buildHarness();

    await service.finalizeRemainder(
      'tkt-1',
      { attestedPages: 8, attestedCostPerPage: 25 },
      actor,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attestedCharges: 200,
          attestedPages: 8,
          attestedCostPerPage: 25,
          // 3,000 base + 200 attested + 150 printing (persisted, untouched)
          // + 250 delivery
          totalAmount: 3000 + 200 + 150 + 250,
        }),
      }),
    );
    expectFinalizeNeverWritesClerkSnapshot(updateMany);
  });

  it('recomputes printingCharges + nonAttestedCharges from pages × rate', async () => {
    const { service, updateMany } = buildHarness();

    await service.finalizeRemainder(
      'tkt-1',
      {
        noOfPages: 20,
        costPerPage: 4,
        nonAttestedPages: 6,
        nonAttestedCostPerPage: 10,
      },
      actor,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          printingCharges: 80,
          noOfPages: 20,
          costPerPage: 4,
          nonAttestedCharges: 60,
          nonAttestedPages: 6,
          nonAttestedCostPerPage: 10,
        }),
      }),
    );
    expectFinalizeNeverWritesClerkSnapshot(updateMany);
  });

  it('no page fields → the persisted lump/persisted value is used unchanged', async () => {
    const { service, updateMany } = buildHarness();

    await service.finalizeRemainder('tkt-1', {}, actor);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attestedCharges: 400,
          nonAttestedCharges: 0,
          printingCharges: 150,
          attestedPages: null,
          attestedCostPerPage: null,
          noOfPages: null,
          costPerPage: null,
        }),
      }),
    );
    expectFinalizeNeverWritesClerkSnapshot(updateMany);
  });

  it('an explicit lump charge still wins over pages × rate', async () => {
    const { service, updateMany } = buildHarness();

    await service.finalizeRemainder(
      'tkt-1',
      { attestedCharges: 999, attestedPages: 8, attestedCostPerPage: 25 },
      actor,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attestedCharges: 999,
        }),
      }),
    );
    expectFinalizeNeverWritesClerkSnapshot(updateMany);
  });

  it('an admin markup after submit does not raise clerk pay (finalize never touches the clerk snapshot)', async () => {
    // This is the end-to-end version of the invariant: finalize the same
    // ticket that submitClerkCosts already stamped with a clerk snapshot,
    // with the admin marking the attested charge UP from what the clerk
    // submitted. The clerk* columns must be absent from finalize's own
    // update — the cap lives in computeClerkEarningsBreakdown, applied by
    // callers that read the persisted clerk* columns, not by finalize
    // itself re-deriving or overwriting them.
    const { service, updateMany } = buildHarness({
      attestedCharges: 250, // clerk's original submission
      clerkAttestedCharges: 250,
    });

    await service.finalizeRemainder(
      'tkt-1',
      { attestedCharges: 500 }, // admin marks it up
      actor,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attestedCharges: 500 }),
      }),
    );
    expectFinalizeNeverWritesClerkSnapshot(updateMany);
  });
});
