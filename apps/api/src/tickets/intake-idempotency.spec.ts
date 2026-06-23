import { jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { TicketsService } from './tickets.service';

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

const POA_PAYLOAD = {
  select_service: 'Lower Court',
  select_court: 'Power of Attorney',
  select_court_city: 'Lahore',
  case_petition_no: '123',
  case_year: '2024',
  case_type: 'Civil',
  case_title: 'A vs B',
};

// Audit 1.9: createIntakeTicket had no idempotency key — a double-submit
// (network retry, double-click) created two priced tickets and the next
// verified top-up FIFO-settled BOTH. A client-supplied requestId now lands in
// the unique Ticket.intakeRequestId column; a P2002 on it returns the
// already-created ticket instead of erroring or duplicating.
describe('createIntakeTicket idempotency (audit 1.9)', () => {
  function buildHarness() {
    const created = {
      id: 'tkt-1',
      batchNo: 'TKT-1',
      intakeRequestId: 'req-abc',
    };
    const ticketCreate = jest.fn().mockResolvedValue(created);
    const prisma: Record<string, unknown> = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'c-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: 'PKR' }),
      },
      service: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'svc-1', category: 'judicial' }),
      },
      ticket: {
        create: ticketCreate,
        findUnique: jest.fn().mockResolvedValue(created),
      },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticketIntakeDraft: {
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    const pricingService = {
      resolve: jest.fn().mockResolvedValue({
        matched: true,
        available: true,
        rulesExistForFlow: true,
        basePrice: 2000,
        pdfSurcharge: 0,
        deliveryFee: 0,
        titleSurcharge: 0,
        ageSurcharge: 0,
        bundleSurcharge: 0,
        searchBothSurcharge: 0,
        cityCount: 1,
        clerkBaseCost: null,
        attestedCharge: 0,
        nonAttestedCharge: 0,
        deliveryCharge: 0,
        serviceCost: 2000,
        total: 2000,
      }),
    };
    const service = new TicketsService(
      prisma as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      pricingService as never,
      { resolveProvinceByCity: jest.fn() } as never,
      makeDispatcher() as never,
      { settleTicketsForUser: jest.fn() } as never,
    );
    return { service, prisma, ticketCreate };
  }

  const dto = {
    flow: 'judicial_power_of_attorney',
    consumerId: 'c-1',
    serviceId: 'svc-1',
    payload: POA_PAYLOAD,
    requestId: 'req-abc',
  };

  it('persists the client request id on the created ticket', async () => {
    const { service, ticketCreate } = buildHarness();

    await service.createIntakeTicket(dto as never, {
      actorUserId: 'c-1',
      actorEmail: 'c@x.com',
    });

    expect(ticketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ intakeRequestId: 'req-abc' }),
      }),
    );
  });

  it('returns the existing ticket when the same request id is replayed (P2002)', async () => {
    const { service, prisma, ticketCreate } = buildHarness();
    const existing = {
      id: 'tkt-existing',
      batchNo: 'TKT-9',
      consumerId: 'c-1',
    };
    ticketCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['intakeRequestId'] },
      }),
    );
    (prisma.ticket as { findUnique: jest.Mock }).findUnique.mockResolvedValue(
      existing,
    );

    const result = await service.createIntakeTicket(dto as never, {
      actorUserId: 'c-1',
      actorEmail: 'c@x.com',
    });

    expect(result).toMatchObject({ id: 'tkt-existing' });
    // Only one create was attempted; the replay returned the original row.
    expect(ticketCreate).toHaveBeenCalledTimes(1);
  });

  it('does NOT return another consumer\u2019s ticket on a key collision', async () => {
    const { service, prisma, ticketCreate } = buildHarness();
    ticketCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['intakeRequestId'] },
      }),
    );
    // The colliding ticket belongs to someone else — the replay path must
    // rethrow, never leak the foreign ticket.
    (prisma.ticket as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
      id: 'tkt-foreign',
      consumerId: 'someone-else',
    });

    await expect(
      service.createIntakeTicket(dto as never, {
        actorUserId: 'c-1',
        actorEmail: 'c@x.com',
      }),
    ).rejects.toThrow();
  });

  it('creates ticket and history row inside one transaction', async () => {
    const { service, prisma } = buildHarness();

    await service.createIntakeTicket(dto as never, {
      actorUserId: 'c-1',
      actorEmail: 'c@x.com',
    });

    expect(
      (prisma.$transaction as jest.Mock).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (prisma.ticketStatusHistory as { create: jest.Mock }).create,
    ).toHaveBeenCalled();
  });
});
