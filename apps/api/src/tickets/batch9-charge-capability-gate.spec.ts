import { jest } from '@jest/globals';
import { computeClerkEarningsBreakdown } from '@wusuq/shared';
import { TicketsService } from './tickets.service';
import { FinanceService } from '../finance/finance.service';

// Batch-9 Task 2 (§4): three server paths wrote the phase-2 charge columns
// (deliveryCharges/printingCharges/attestedCharges/nonAttestedCharges — and,
// for submitClerkCosts, the clerk* payout-snapshot twins) with no
// chargeCapabilitiesFor gate. On a flow/currency combo with no such
// capability (every USD ticket, every digital flow, and — since Task 1 —
// Case Files' printing) the consumer was never billed these charges but
// computeClerkEarningsBreakdown still paid the representative for them. This
// spec proves the payout, not just the persisted column, is zeroed.

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
  };
}

function repActor() {
  return { actorUserId: 'rep-1', actorRole: 'representative' };
}

describe('submitClerkCosts — chargeCapabilitiesFor gate (batch-9 Task 2)', () => {
  it('zeroes both the flat charge columns AND the clerk* payout snapshot for a NO_CHARGES flow (digital), leaving a leftover persisted printingCharges out of the payout', async () => {
    // The concrete leak the brief names: a Case-Files ticket with a
    // pre-existing nonzero printingCharges (legacy, or set before Task 1
    // flipped judicial_case_files.printing to false) must not resurrect that
    // leftover into clerkPrintingCharges just because the dto is empty.
    const { service, updateSpy } = makeTicketsService({
      intakeFlow: 'judicial_case_information', // digital flow -> NO_CHARGES
      printingCharges: 500, // legacy leftover
      deliveryCharges: 300,
      attestedCharges: 400,
      nonAttestedCharges: 200,
    });

    await service.submitClerkCosts(
      'ticket-1',
      {
        // Client explicitly tries to submit charges too — must still be
        // zeroed, not just the fallback-to-persisted path.
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

    // The payout is the point, not the columns.
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
    expect(payout.total).toBe(400); // clerkCost only — no phase-2 leak.
  });

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
});

describe('saveClerkCharges — printing/delivery force 0 (not undefined) for a NO_CHARGES flow (batch-9 Task 2)', () => {
  function makeSaveChargesService(ticketOverrides: Record<string, unknown>) {
    const ticket = {
      id: 'ticket-1',
      intakeFlow: 'judicial_case_information',
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
    return { service, updateSpy };
  }

  it('writes printingCharges: 0 and deliveryCharges: 0 — Prisma `undefined` would leave a leftover value unchanged', async () => {
    const { service, updateSpy } = makeSaveChargesService({});

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
});

describe('FinanceService.updateCharge — chargeCapabilitiesFor gate (batch-9 Task 2)', () => {
  function build(ticket: Record<string, unknown>) {
    const prisma = {
      ticket: {
        findUnique: jest.fn(async () => ticket),
        update: jest.fn(async ({ data }: any) => ({
          ...ticket,
          ...data,
          assignments: [{ id: 'a1' }],
        })),
      },
    };
    const auditLogsService = { create: jest.fn() };
    return {
      service: new FinanceService(prisma as never, auditLogsService as never),
      prisma,
    };
  }

  const USD_TICKET = {
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
    const { service, prisma } = build(USD_TICKET);

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
      ...USD_TICKET,
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
});
