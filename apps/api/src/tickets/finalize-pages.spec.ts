import { jest } from '@jest/globals';
import { computeClerkEarningsBreakdown } from '@wusuq/shared';
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
    ticketEdited: jest.fn(async () => undefined),
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
  // Batch-9 Task 1 (owner decision 2026-09-21):
  // SERVICE_CHARGE_CAPABILITIES.judicial_case_files.printing is now FALSE —
  // Case Files bills its pages through the attested/non-attested counts, so
  // a third "Photocopy" counter is redundant. No flow now has BOTH
  // attestation AND printing capabilities at once, so the tests below split
  // by flow: judicial_case_files (attestation, no printing) and
  // non_judicial_copy_of_fir (printing, no attestation).
  it('recomputes attestedCharges from pages × rate and persists the page count (Case Files)', async () => {
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
          // Case Files has no printing capability — the persisted 150 is
          // forced to 0 regardless of the dto/persisted column.
          printingCharges: 0,
          // 3,000 base + 200 attested + 0 printing (capability-gated) + 250 delivery
          totalAmount: 3000 + 200 + 0 + 250,
        }),
      }),
    );
    expectFinalizeNeverWritesClerkSnapshot(updateMany);
  });

  it('recomputes nonAttestedCharges from pages × rate (Case Files)', async () => {
    const { service, updateMany } = buildHarness();

    await service.finalizeRemainder(
      'tkt-1',
      { nonAttestedPages: 6, nonAttestedCostPerPage: 10 },
      actor,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nonAttestedCharges: 60,
          nonAttestedPages: 6,
          nonAttestedCostPerPage: 10,
          // No printing capability on Case Files — forced to 0.
          printingCharges: 0,
        }),
      }),
    );
    expectFinalizeNeverWritesClerkSnapshot(updateMany);
  });

  it('recomputes printingCharges from pages × rate (non-judicial copy — printing capable, no attestation)', async () => {
    const { service, updateMany } = buildHarness({
      intakeFlow: 'non_judicial_copy_of_fir',
      attestedCharges: 0,
    });

    await service.finalizeRemainder(
      'tkt-1',
      { noOfPages: 20, costPerPage: 4 },
      actor,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          printingCharges: 80,
          noOfPages: 20,
          costPerPage: 4,
          // No attestation capability on this flow — forced to 0.
          attestedCharges: 0,
          nonAttestedCharges: 0,
        }),
      }),
    );
    expectFinalizeNeverWritesClerkSnapshot(updateMany);
  });

  it('no page fields → the persisted attested charge is unchanged, printing forced to 0 (Case Files)', async () => {
    const { service, updateMany } = buildHarness();

    await service.finalizeRemainder('tkt-1', {}, actor);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attestedCharges: 400,
          nonAttestedCharges: 0,
          printingCharges: 0,
          attestedPages: null,
          attestedCostPerPage: null,
          noOfPages: null,
          costPerPage: null,
        }),
      }),
    );
    expectFinalizeNeverWritesClerkSnapshot(updateMany);
  });

  it('no page fields → the persisted printing charge is unchanged (non-judicial copy)', async () => {
    const { service, updateMany } = buildHarness({
      intakeFlow: 'non_judicial_copy_of_fir',
      attestedCharges: 0,
    });

    await service.finalizeRemainder('tkt-1', {}, actor);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          printingCharges: 150,
          // No attestation capability on this flow — forced to 0.
          attestedCharges: 0,
          nonAttestedCharges: 0,
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

// Batch-9 Task 2 (§4, fix round 2): finalizeRemainderCore is reachable
// directly via `POST /tickets/:id/finalize-remainder` (finalizeRemainder,
// tested here), which BYPASSES reviewAndComplete's `hasCaps` guard. Before
// this fix it force-wrote literal 0 for the four gated charges on ANY
// ticket whose capability determination wasn't a straightforward "known and
// granted" — including a legacy null-flow ticket carrying real
// already-persisted money. It is now routed through the same
// resolveGatedCharge (packages/shared) as updateCharge/saveClerkCharges/
// submitClerkCosts: `undefined` (leave the column untouched) only for a
// genuinely unrecognized flow; a recognized FlowKey — physical or digital —
// is always definitive.
describe('finalizeRemainder — capability gate for legacy/digital flows (batch-9 Task 2, fix round 2)', () => {
  it('a null-flow (legacy, unknown) ticket PRESERVES existing charges and rejects a smuggled dto value', async () => {
    const { service, updateMany } = buildHarness({
      intakeFlow: null,
      clerkCost: 10,
      attestedCharges: 400,
      nonAttestedCharges: 0,
      printingCharges: 150,
      deliveryCharges: 250,
    });

    await service.finalizeRemainder(
      'tkt-1',
      {
        attestedCharges: 999,
        nonAttestedCharges: 999,
        printingCharges: 999,
        deliveryCharges: 999,
      },
      actor,
    );

    const data = (
      updateMany.mock.calls[0][0] as { data: Record<string, unknown> }
    ).data;

    // Prisma `undefined` = column left untouched — not zeroed, not
    // overwritten with the smuggled 999.
    expect(data.attestedCharges).toBeUndefined();
    expect(data.nonAttestedCharges).toBeUndefined();
    expect(data.printingCharges).toBeUndefined();
    expect(data.deliveryCharges).toBeUndefined();

    // The total still finalizes correctly against the PERSISTED figures
    // (3000 base + 400 attested + 0 nonAttested + 150 printing + 250
    // delivery = 3800) — an unknown determination affects only what gets
    // WRITTEN to the four gated columns, never the total computation.
    expect(data.totalAmount).toBe(3000 + 400 + 0 + 150 + 250);

    expectFinalizeNeverWritesClerkSnapshot(updateMany);

    // The payout is unaffected — still exactly what the persisted figures
    // always implied, not zeroed and not inflated by the smuggled 999s.
    const payout = computeClerkEarningsBreakdown({
      clerkCost: 10,
      attestedCharges: 400,
      nonAttestedCharges: 0,
      printingCharges: 150,
      deliveryCharges: 250,
    });
    expect(payout.total).toBe(10 + 400 + 0 + 150 + 250);
  });

  it('a recognized DIGITAL flow (judicial_case_information) ZEROES a leftover charge — the fix-round-1 regression this round closes', async () => {
    const { service, updateMany } = buildHarness({
      intakeFlow: 'judicial_case_information',
      clerkCost: 400,
      attestedCharges: 400,
      nonAttestedCharges: 200,
      printingCharges: 500, // legacy leftover — MUST be zeroed
      deliveryCharges: 300,
    });

    await service.finalizeRemainder(
      'tkt-1',
      {
        attestedCharges: 999,
        nonAttestedCharges: 999,
        printingCharges: 999,
        deliveryCharges: 999,
      },
      actor,
    );

    const data = (
      updateMany.mock.calls[0][0] as { data: Record<string, unknown> }
    ).data;

    expect(data.attestedCharges).toBe(0);
    expect(data.nonAttestedCharges).toBe(0);
    expect(data.printingCharges).toBe(0);
    expect(data.deliveryCharges).toBe(0);
    // Digital flow — no phase-2 charges, total is base only.
    expect(data.totalAmount).toBe(3000);

    expectFinalizeNeverWritesClerkSnapshot(updateMany);

    const payout = computeClerkEarningsBreakdown({
      clerkCost: 400,
      attestedCharges: Number(data.attestedCharges),
      nonAttestedCharges: Number(data.nonAttestedCharges),
      printingCharges: Number(data.printingCharges),
      deliveryCharges: Number(data.deliveryCharges),
    });
    expect(payout.total).toBe(400); // clerkCost only — no leftover leak.
  });
});
