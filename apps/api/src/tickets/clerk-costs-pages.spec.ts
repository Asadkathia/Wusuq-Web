import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

// Workstream D1, Task 2 (C11/C12): clerk-entered attested/non-attested
// charges as pages × rate (mirroring printingCharges), TCS receipt/tracking
// capture in the same submit, and redaction of the 4 new page columns from
// the consumer view.

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

describe('submitClerkCosts — attested/non-attested pages × rate (C11)', () => {
  it('computes attested/nonAttested charges from pages × rate', async () => {
    const { service, updateSpy } = makeTicketsService();
    await service.submitClerkCosts(
      'ticket-1',
      {
        attestedPages: 10,
        attestedCostPerPage: 50,
        nonAttestedPages: 4,
        nonAttestedCostPerPage: 30,
      } as never,
      repActor(),
    );
    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(Number(data.attestedCharges)).toBe(500);
    expect(Number(data.nonAttestedCharges)).toBe(120);
    expect(data.attestedPages).toBe(10);
    expect(data.attestedCostPerPage).toBe(50);
    expect(data.nonAttestedPages).toBe(4);
    expect(data.nonAttestedCostPerPage).toBe(30);
  });

  it('falls back to the persisted lump when page fields are absent', async () => {
    const { service, updateSpy } = makeTicketsService({
      attestedCharges: 700,
      nonAttestedCharges: 250,
    });
    await service.submitClerkCosts(
      'ticket-1',
      { deliveryCharges: 0 } as never,
      repActor(),
    );
    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(Number(data.attestedCharges)).toBe(700);
    expect(Number(data.nonAttestedCharges)).toBe(250);
  });

  it('an explicit lump charge wins over pages × rate', async () => {
    const { service, updateSpy } = makeTicketsService();
    await service.submitClerkCosts(
      'ticket-1',
      {
        attestedCharges: 999,
        attestedPages: 10,
        attestedCostPerPage: 50,
      } as never,
      repActor(),
    );
    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(Number(data.attestedCharges)).toBe(999);
  });

  it('persists dispatchProofUrl + trackingNo (C12)', async () => {
    const { service, updateSpy } = makeTicketsService();
    await service.submitClerkCosts(
      'ticket-1',
      {
        dispatchProofUrl: '/wallet/receipt/x.pdf',
        trackingNo: 'TCS-1',
      } as never,
      repActor(),
    );
    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data.dispatchProofUrl).toBe('/wallet/receipt/x.pdf');
    expect(data.trackingNo).toBe('TCS-1');
  });

  it('does not flip deliveryStatus when capturing the TCS proof (C12 — state machine unchanged)', async () => {
    const { service, updateSpy } = makeTicketsService();
    await service.submitClerkCosts(
      'ticket-1',
      {
        dispatchProofUrl: '/wallet/receipt/x.pdf',
        trackingNo: 'TCS-1',
      } as never,
      repActor(),
    );
    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;
    expect('deliveryStatus' in data).toBe(false);
  });
});

describe('redactTicketForConsumer strips the attested/non-attested page breakdown', () => {
  function consumerTicketPrisma(row: Record<string, unknown>) {
    return {
      ticket: { findUnique: jest.fn().mockResolvedValue(row) },
    };
  }

  it('a consumer-redacted ticket has none of the 4 page columns', async () => {
    const row = {
      id: 'ticket-1',
      consumerId: 'consumer-A',
      status: 'COMPLETED',
      archivedAt: null,
      attestedPages: 10,
      attestedCostPerPage: 50,
      nonAttestedPages: 4,
      nonAttestedCostPerPage: 30,
      noOfPages: 12,
      costPerPage: 5,
      documents: [],
      assignments: [],
      history: [],
    };
    const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    const service = new TicketsService(
      consumerTicketPrisma(row) as never,
      auditLogsService as never,
      { resolve: jest.fn() } as never,
      { resolveProvinceByCity: jest.fn() } as never,
      makeDispatcher() as never,
      {
        settleTicketsForUser: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
    const result = (await service.findOne('ticket-1', {
      role: 'consumer',
      userId: 'consumer-A',
    })) as Record<string, unknown>;

    expect(result).not.toHaveProperty('attestedPages');
    expect(result).not.toHaveProperty('attestedCostPerPage');
    expect(result).not.toHaveProperty('nonAttestedPages');
    expect(result).not.toHaveProperty('nonAttestedCostPerPage');
    // Existing printing-page-breakdown strip stays intact alongside these.
    expect(result).not.toHaveProperty('noOfPages');
    expect(result).not.toHaveProperty('costPerPage');
  });
});
