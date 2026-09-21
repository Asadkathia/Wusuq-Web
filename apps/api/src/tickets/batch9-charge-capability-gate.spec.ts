import { jest } from '@jest/globals';
import { computeClerkEarningsBreakdown } from '@wusuq/shared';
import { TicketsService } from './tickets.service';
import { FinanceService } from '../finance/finance.service';

// Batch-9 Task 2 (§4): three server paths wrote the phase-2 charge columns
// (deliveryCharges/printingCharges/attestedCharges/nonAttestedCharges — and,
// for submitClerkCosts, the clerk* payout-snapshot twins) with no capability
// gate. On a flow/currency combo that DEFINITIVELY has no such capability
// (every USD ticket, and — since Task 1 — Case Files' printing) the
// consumer was never billed these charges but computeClerkEarningsBreakdown
// still paid the representative for them.
//
// Fix round 1 (review finding): the first pass over-corrected — it also
// force-zeroed a null/unrecognized `intakeFlow`, which is NOT the same as
// "definitely no charges". Legacy tickets predating flow tracking can carry
// REAL already-persisted nonzero charges (tickets.service.spec.ts "falls
// back to the copied totals when the original cannot be re-priced (no
// flow)"). `resolveGatedCharge` (packages/shared) now distinguishes
// "definitive" (USD, or a flow that IS a key in SERVICE_CHARGE_CAPABILITIES)
// from "unknown" (null flow, or a flow string not in that map) — unknown
// never writes 0 and never accepts a new dto value either.
//
// This spec proves the payout (computeClerkEarningsBreakdown().total), not
// just the persisted column, in both directions: zeroed when definitive,
// untouched/preserved when unknown.

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
    ticketDispatched: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
    caseDriftDetected: jest.fn().mockResolvedValue(undefined),
  };
}

function makeTicketsService(ticketOverrides: Record<string, unknown> = {}) {
  const tx = {
    ticket: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  const ticket = {
    id: 'ticket-1',
    status: 'IN_PROGRESS',
    serviceCost: 800,
    totalAmount: 800,
    deliveryCharges: 0,
    printingCharges: 0,
    attestedCharges: 0,
    nonAttestedCharges: 0,
    additionalCharges: 0,
    additionalServiceCost: 0,
    discountPrice: 0,
    noOfPages: null,
    costPerPage: null,
    attestedPages: null,
    attestedCostPerPage: null,
    nonAttestedPages: null,
    nonAttestedCostPerPage: null,
    dispatchProofUrl: null,
    trackingNo: null,
    remainderFinalizedAt: null,
    currency: 'PKR',
    ...ticketOverrides,
  };
  const prisma = {
    ticket: {
      findUnique: jest.fn().mockResolvedValue(ticket),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'ticket-1', consumerId: 'c1' }),
    },
    assignment: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'asg',
        representativeId: 'rep-1',
        status: 'ACCEPTED',
      }),
    },
    ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    ticketClerkReport: { upsert: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (fn: unknown) =>
      (fn as (t: unknown) => unknown)(tx),
    ),
  };
  const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
  const service = new TicketsService(
    prisma as never,
    auditLogsService as never,
    { resolve: jest.fn() } as never,
    { resolveProvinceByCity: jest.fn() } as never,
    makeDispatcher() as never,
    { settleTicketsForUser: jest.fn().mockResolvedValue(undefined) } as never,
  );
  return {
    service,
    prisma,
    tx,
    updateSpy: tx.ticket.updateMany,
    ticket,
  };
}

function repActor() {
  return { actorUserId: 'rep-1', actorRole: 'representative' };
}

/** Simulates Prisma's `update`/`updateMany` semantics: a key with value
 * `undefined` in `data` leaves that column exactly as it was; any other
 * value overwrites it. Used to compute what the DB would actually hold
 * after the write, so tests can assert the true post-state rather than
 * just the shape of the `data` object. */
function applyPrismaWrite(
  original: Record<string, unknown>,
  data: Record<string, unknown>,
) {
  const merged = { ...original };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) merged[k] = v;
  }
  return merged;
}

describe('submitClerkCosts — capability gate (batch-9 Task 2, fix round 1)', () => {
  it('a Case-Files ticket (post-Task-1: printing capability is FALSE) zeroes printingCharges + clerkPrintingCharges but keeps attestation + delivery', async () => {
    const { service, updateSpy } = makeTicketsService({
      intakeFlow: 'judicial_case_files',
      printingCharges: 250, // leftover from before Task 1
    });

    await service.submitClerkCosts(
      'ticket-1',
      {
        printingCharges: 999,
        attestedPages: 10,
        attestedCostPerPage: 50,
        deliveryCharges: 300,
      } as never,
      repActor(),
    );

    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;

    expect(Number(data.printingCharges)).toBe(0);
    expect(Number(data.clerkPrintingCharges)).toBe(0);
    // Attestation + delivery ARE capabilities of judicial_case_files —
    // untouched by the gate.
    expect(Number(data.attestedCharges)).toBe(500);
    expect(Number(data.clerkAttestedCharges)).toBe(500);
    expect(Number(data.deliveryCharges)).toBe(300);
    expect(Number(data.clerkDeliveryCharges)).toBe(300);
  });

  it('a USD ticket zeroes all four charges + all four clerk* snapshots even though the dto supplies values', async () => {
    const { service, updateSpy } = makeTicketsService({
      intakeFlow: 'judicial_case_files',
      currency: 'USD',
    });

    await service.submitClerkCosts(
      'ticket-1',
      {
        deliveryCharges: 500,
        attestedCharges: 900,
        nonAttestedCharges: 700,
      } as never,
      repActor(),
    );

    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;

    expect(Number(data.deliveryCharges)).toBe(0);
    expect(Number(data.attestedCharges)).toBe(0);
    expect(Number(data.nonAttestedCharges)).toBe(0);
    expect(Number(data.printingCharges)).toBe(0);
    expect(Number(data.clerkDeliveryCharges)).toBe(0);
    expect(Number(data.clerkAttestedCharges)).toBe(0);
    expect(Number(data.clerkNonAttestedCharges)).toBe(0);
    expect(Number(data.clerkPrintingCharges)).toBe(0);

    // Reproduces the client's own USD ticket: rep earnings must be clerkCost
    // only, not 900 + 700 + 500 = 2,100 on top of it.
    const payout = computeClerkEarningsBreakdown({
      clerkCost: 0,
      defaultClerkCost: 0,
      attestedCharges: Number(data.attestedCharges),
      clerkAttestedCharges: data.clerkAttestedCharges as number,
      nonAttestedCharges: Number(data.nonAttestedCharges),
      clerkNonAttestedCharges: data.clerkNonAttestedCharges as number,
      deliveryCharges: Number(data.deliveryCharges),
      clerkDeliveryCharges: data.clerkDeliveryCharges as number,
    });
    expect(payout.total).toBe(0);
  });

  it('a PKR DIGITAL-flow ticket (judicial_case_information — recognized flow, absent from SERVICE_CHARGE_CAPABILITIES) zeroes a leftover printingCharges — fix round 2 regression coverage', async () => {
    // Fix round 2: round 1 conflated "not a key in SERVICE_CHARGE_
    // CAPABILITIES" with "unknown/legacy" — a digital flow is a recognized
    // FlowKey deliberately absent from that map (it resolves through
    // chargeCapabilitiesFor's `?? NO_CHARGES` fallback), NOT the same as a
    // null legacy flow. This is the exact case the round-1 spec covered and
    // the round-2 fix deleted; restored here per the review.
    const { service, updateSpy } = makeTicketsService({
      intakeFlow: 'judicial_case_information',
      currency: 'PKR',
      printingCharges: 500, // legacy leftover — MUST be zeroed, not preserved
      deliveryCharges: 300,
      attestedCharges: 400,
      nonAttestedCharges: 200,
      clerkCost: 400,
    });

    await service.submitClerkCosts(
      'ticket-1',
      {
        deliveryCharges: 999,
        printingCharges: 999,
        attestedCharges: 999,
        nonAttestedCharges: 999,
      } as never,
      repActor(),
    );

    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;

    expect(Number(data.deliveryCharges)).toBe(0);
    expect(Number(data.printingCharges)).toBe(0);
    expect(Number(data.attestedCharges)).toBe(0);
    expect(Number(data.nonAttestedCharges)).toBe(0);
    expect(Number(data.clerkDeliveryCharges)).toBe(0);
    expect(Number(data.clerkPrintingCharges)).toBe(0);
    expect(Number(data.clerkAttestedCharges)).toBe(0);
    expect(Number(data.clerkNonAttestedCharges)).toBe(0);

    const payout = computeClerkEarningsBreakdown({
      clerkCost: 400,
      attestedCharges: Number(data.attestedCharges),
      clerkAttestedCharges: data.clerkAttestedCharges as number,
      nonAttestedCharges: Number(data.nonAttestedCharges),
      clerkNonAttestedCharges: data.clerkNonAttestedCharges as number,
      printingCharges: Number(data.printingCharges),
      clerkPrintingCharges: data.clerkPrintingCharges as number,
      deliveryCharges: Number(data.deliveryCharges),
      clerkDeliveryCharges: data.clerkDeliveryCharges as number,
    });
    expect(payout.total).toBe(400); // clerkCost only — no leftover leak.
  });

  it('a USD ticket with intakeFlow: null still gets zeroed (currency is definitive regardless of flow)', async () => {
    const { service, updateSpy } = makeTicketsService({
      intakeFlow: null,
      currency: 'USD',
      deliveryCharges: 300, // legacy leftover — must not survive on a USD ticket
    });

    await service.submitClerkCosts(
      'ticket-1',
      {
        deliveryCharges: 500,
        attestedCharges: 900,
        nonAttestedCharges: 700,
      } as never,
      repActor(),
    );

    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;

    expect(Number(data.deliveryCharges)).toBe(0);
    expect(Number(data.attestedCharges)).toBe(0);
    expect(Number(data.nonAttestedCharges)).toBe(0);
    expect(Number(data.printingCharges)).toBe(0);
    expect(Number(data.clerkDeliveryCharges)).toBe(0);
  });

  it('intakeFlow: null (unknown, PKR) — an existing persisted charge SURVIVES, and the dto cannot add a new one', async () => {
    const { service, updateSpy, ticket } = makeTicketsService({
      intakeFlow: null,
      currency: 'PKR',
      deliveryCharges: 5, // real legacy money — must not be destroyed
      printingCharges: 2,
      attestedCharges: 3,
      nonAttestedCharges: 0,
      clerkCost: 10,
    });

    await service.submitClerkCosts(
      'ticket-1',
      {
        // The clerk attempts to submit NEW values — an unknown-capability
        // ticket must neither gain nor lose a charge, so these must be
        // rejected too, not just the persisted values preserved.
        deliveryCharges: 999,
        printingCharges: 999,
        attestedCharges: 999,
        nonAttestedCharges: 999,
      } as never,
      repActor(),
    );

    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;

    // Prisma `undefined` = column left untouched.
    expect(data.deliveryCharges).toBeUndefined();
    expect(data.printingCharges).toBeUndefined();
    expect(data.attestedCharges).toBeUndefined();
    expect(data.nonAttestedCharges).toBeUndefined();
    expect(data.clerkDeliveryCharges).toBeUndefined();
    expect(data.clerkPrintingCharges).toBeUndefined();
    expect(data.clerkAttestedCharges).toBeUndefined();
    expect(data.clerkNonAttestedCharges).toBeUndefined();

    // Reconstruct what the DB would actually hold and assert the payout is
    // exactly what it was before this call — not 0, not the dto's 999s.
    const finalTicket = applyPrismaWrite(ticket, data);
    const payout = computeClerkEarningsBreakdown({
      clerkCost: finalTicket.clerkCost as number,
      attestedCharges: finalTicket.attestedCharges as number,
      clerkAttestedCharges: finalTicket.clerkAttestedCharges as
        | number
        | null
        | undefined,
      nonAttestedCharges: finalTicket.nonAttestedCharges as number,
      clerkNonAttestedCharges: finalTicket.clerkNonAttestedCharges as
        | number
        | null
        | undefined,
      printingCharges: finalTicket.printingCharges as number,
      clerkPrintingCharges: finalTicket.clerkPrintingCharges as
        | number
        | null
        | undefined,
      deliveryCharges: finalTicket.deliveryCharges as number,
      clerkDeliveryCharges: finalTicket.clerkDeliveryCharges as
        | number
        | null
        | undefined,
    });
    // 10 (clerkCost) + 3 (attested) + 0 (nonAttested) + 2 (printing) +
    // 5 (delivery) = 20 — the ORIGINAL persisted figures, no dto leak, no
    // zeroing.
    expect(payout.total).toBe(20);
  });
});

describe('saveClerkCharges — capability gate (batch-9 Task 2, fix round 1)', () => {
  function makeSaveChargesService(ticketOverrides: Record<string, unknown>) {
    const ticket = {
      id: 'ticket-1',
      intakeFlow: 'judicial_case_files',
      currency: 'PKR',
      ...ticketOverrides,
    };
    const updateSpy = jest.fn().mockResolvedValue({});
    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(ticket),
        update: updateSpy,
      },
      assignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'asg',
          representativeId: 'rep-1',
          status: 'ACCEPTED',
        }),
      },
    };
    const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      { resolve: jest.fn() } as never,
      { resolveProvinceByCity: jest.fn() } as never,
      makeDispatcher() as never,
      {
        settleTicketsForUser: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
    // findOne is called at the end of saveClerkCharges to build the redacted
    // return value — stub it out so this test only exercises the update
    // payload, not the full read path.
    (service as unknown as { findOne: unknown }).findOne = jest
      .fn()
      .mockResolvedValue({ id: 'ticket-1' });
    return { service, updateSpy, ticket };
  }

  it('a USD ticket forces printingCharges: 0 and deliveryCharges: 0 — literal 0, not undefined', async () => {
    const { service, updateSpy } = makeSaveChargesService({
      intakeFlow: 'judicial_case_files',
      currency: 'USD',
    });

    await service.saveClerkCharges(
      'ticket-1',
      { printingCharges: 500, deliveryCharges: 300 } as never,
      repActor(),
    );

    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data.printingCharges).toBe(0);
    expect(data.deliveryCharges).toBe(0);
    expect(data.attestedCharges).toBe(0);
    expect(data.nonAttestedCharges).toBe(0);
  });

  it('a PKR DIGITAL-flow ticket (judicial_case_information) zeroes a leftover charge — fix round 2 regression coverage', async () => {
    const { service, updateSpy } = makeSaveChargesService({
      intakeFlow: 'judicial_case_information',
      currency: 'PKR',
      printingCharges: 500, // legacy leftover — MUST be zeroed
      deliveryCharges: 300,
      attestedCharges: 400,
      nonAttestedCharges: 200,
      clerkCost: 400,
    });

    await service.saveClerkCharges(
      'ticket-1',
      { printingCharges: 999, deliveryCharges: 999 } as never,
      repActor(),
    );

    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data.printingCharges).toBe(0);
    expect(data.deliveryCharges).toBe(0);
    expect(data.attestedCharges).toBe(0);
    expect(data.nonAttestedCharges).toBe(0);

    const payout = computeClerkEarningsBreakdown({
      clerkCost: 400,
      attestedCharges: Number(data.attestedCharges),
      nonAttestedCharges: Number(data.nonAttestedCharges),
      printingCharges: Number(data.printingCharges),
      deliveryCharges: Number(data.deliveryCharges),
    });
    expect(payout.total).toBe(400); // clerkCost only.
  });

  it('intakeFlow: null (unknown, PKR) — an existing persisted charge SURVIVES a draft save that tries to change it', async () => {
    const { service, updateSpy, ticket } = makeSaveChargesService({
      intakeFlow: null,
      currency: 'PKR',
      deliveryCharges: 5,
      printingCharges: 2,
      attestedCharges: 3,
      nonAttestedCharges: 0,
      clerkCost: 10,
    });

    await service.saveClerkCharges(
      'ticket-1',
      {
        deliveryCharges: 999,
        printingCharges: 999,
        attestedCharges: 999,
        nonAttestedCharges: 999,
      } as never,
      repActor(),
    );

    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data.deliveryCharges).toBeUndefined();
    expect(data.printingCharges).toBeUndefined();
    expect(data.attestedCharges).toBeUndefined();
    expect(data.nonAttestedCharges).toBeUndefined();

    const finalTicket = applyPrismaWrite(ticket, data);
    const payout = computeClerkEarningsBreakdown({
      clerkCost: finalTicket.clerkCost as number,
      attestedCharges: finalTicket.attestedCharges as number,
      nonAttestedCharges: finalTicket.nonAttestedCharges as number,
      printingCharges: finalTicket.printingCharges as number,
      deliveryCharges: finalTicket.deliveryCharges as number,
    });
    expect(payout.total).toBe(20); // unchanged from the persisted figures.
  });
});

describe('FinanceService.updateCharge — capability gate (batch-9 Task 2, fix round 1)', () => {
  function build(ticket: Record<string, unknown>) {
    const prisma = {
      ticket: {
        findUnique: jest.fn(async () => ticket),
        update: jest.fn(async ({ data }: any) => ({
          ...applyPrismaWrite(ticket, data),
          assignments: [{ id: 'a1' }],
        })),
      },
    };
    const auditLogsService = { create: jest.fn() };
    return {
      service: new FinanceService(prisma as never, auditLogsService as never),
      prisma,
      ticket,
    };
  }

  const BASE_TICKET = {
    id: 't1',
    intakeFlow: 'judicial_case_files',
    currency: 'USD',
    serviceCost: 500,
    deliveryCharges: 0,
    printingCharges: 0,
    attestedCharges: 0,
    nonAttestedCharges: 0,
    additionalCharges: 0,
    additionalServiceCost: 0,
    discountPrice: 0,
    promoDiscount: 0,
    taxRate: 0,
    totalAmount: 500,
    amountPaid: 0,
    clerkCost: 0,
    defaultClerkCost: null,
    formPayload: null,
    clerkAttestedCharges: null,
    clerkNonAttestedCharges: null,
    clerkPrintingCharges: null,
    clerkDeliveryCharges: null,
  };

  it('a USD ticket keeps all four charges at 0 even when the dto supplies values', async () => {
    const { service, prisma } = build(BASE_TICKET);

    const result = await service.updateCharge('t1', {
      deliveryCharges: 500,
      printingCharges: 900,
      attestedCharges: 900,
      nonAttestedCharges: 700,
    } as never);

    const data = (prisma.ticket.update.mock.calls.at(-1) as any)[0].data;
    expect(data.deliveryCharges).toBe(0);
    expect(data.printingCharges).toBe(0);
    expect(data.attestedCharges).toBe(0);
    expect(data.nonAttestedCharges).toBe(0);

    expect(result.charges.deliveryCharges).toBe(0);
    expect(result.charges.printingCharges).toBe(0);
    expect(result.charges.attestedCharges).toBe(0);
    expect(result.charges.nonAttestedCharges).toBe(0);

    // The client's own reproduction: rep earnings must be 0, not
    // 900 + 700 + 500 = 2,100.
    expect(result.clerkPayout).toBe(0);
  });

  it('a PKR ticket on a flow with the capability keeps the admin override', async () => {
    const { service, prisma } = build({
      ...BASE_TICKET,
      currency: 'PKR',
      clerkCost: 400,
    });

    const result = await service.updateCharge('t1', {
      deliveryCharges: 300,
      attestedCharges: 900,
    } as never);

    const data = (prisma.ticket.update.mock.calls.at(-1) as any)[0].data;
    expect(data.deliveryCharges).toBe(300);
    expect(data.attestedCharges).toBe(900);
    expect(result.clerkPayout).toBe(400 + 300 + 900);
  });

  it('a PKR DIGITAL-flow ticket (judicial_case_information) zeroes a leftover charge via an admin override attempt — fix round 2 regression coverage', async () => {
    const { service, prisma } = build({
      ...BASE_TICKET,
      intakeFlow: 'judicial_case_information',
      currency: 'PKR',
      printingCharges: 500, // legacy leftover — MUST be zeroed
      deliveryCharges: 300,
      attestedCharges: 400,
      nonAttestedCharges: 200,
      clerkCost: 400,
    });

    const result = await service.updateCharge('t1', {
      deliveryCharges: 999,
      printingCharges: 999,
      attestedCharges: 999,
      nonAttestedCharges: 999,
    } as never);

    const data = (prisma.ticket.update.mock.calls.at(-1) as any)[0].data;
    expect(data.deliveryCharges).toBe(0);
    expect(data.printingCharges).toBe(0);
    expect(data.attestedCharges).toBe(0);
    expect(data.nonAttestedCharges).toBe(0);

    expect(result.charges.deliveryCharges).toBe(0);
    expect(result.charges.printingCharges).toBe(0);
    expect(result.charges.attestedCharges).toBe(0);
    expect(result.charges.nonAttestedCharges).toBe(0);
    expect(result.clerkPayout).toBe(400); // clerkCost only — no leftover leak.
  });

  it('a USD ticket with intakeFlow: null still gets zeroed (currency is definitive regardless of flow)', async () => {
    const { service, prisma } = build({
      ...BASE_TICKET,
      intakeFlow: null,
      deliveryCharges: 300, // legacy leftover — must not survive on USD
    });

    const result = await service.updateCharge('t1', {
      deliveryCharges: 500,
      attestedCharges: 900,
    } as never);

    const data = (prisma.ticket.update.mock.calls.at(-1) as any)[0].data;
    expect(data.deliveryCharges).toBe(0);
    expect(data.attestedCharges).toBe(0);
    expect(result.clerkPayout).toBe(0);
  });

  it('intakeFlow: null (unknown, PKR) — an existing persisted charge SURVIVES an edit to an unrelated field, and the dto cannot add a new charge', async () => {
    const { service, prisma } = build({
      ...BASE_TICKET,
      intakeFlow: null,
      currency: 'PKR',
      deliveryCharges: 5,
      printingCharges: 2,
      attestedCharges: 3,
      nonAttestedCharges: 0,
      clerkCost: 10,
      totalAmount: 20,
      amountPaid: 0,
    });

    // Only touches discountPrice — an admin editing something unrelated must
    // not silently erase the legacy charge columns.
    const result = await service.updateCharge('t1', {
      discountPrice: 1,
      // Also try (and fail) to smuggle a new delivery charge through.
      deliveryCharges: 999,
    } as never);

    const data = (prisma.ticket.update.mock.calls.at(-1) as any)[0].data;
    expect(data.deliveryCharges).toBeUndefined();
    expect(data.printingCharges).toBeUndefined();
    expect(data.attestedCharges).toBeUndefined();
    expect(data.nonAttestedCharges).toBeUndefined();

    // The persisted charges survive — reflected in both the returned
    // `charges` snapshot and the clerk payout.
    expect(result.charges.deliveryCharges).toBe(5);
    expect(result.charges.printingCharges).toBe(2);
    expect(result.charges.attestedCharges).toBe(3);
    expect(result.charges.nonAttestedCharges).toBe(0);
    // 10 (clerkCost) + 3 (attested) + 2 (printing) + 5 (delivery) = 20 —
    // unaffected by the discountPrice edit or the smuggled dto value.
    expect(result.clerkPayout).toBe(20);
  });
});
