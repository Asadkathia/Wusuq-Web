import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
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

// H2 IDOR: createIntakeTicket used to trust dto.consumerId outright — a
// consumer-class caller could POST an intake with any consumerId and bill a
// ticket to another consumer. It must now bind to actor.sub for
// consumer-class actors (reject a foreign consumerId, coerce a missing one),
// while leaving staff/lawyer on-behalf intake unaffected.
describe('createIntakeTicket consumer binding (H2 IDOR)', () => {
  function buildHarness() {
    const created = {
      id: 'tkt-1',
      batchNo: 'TKT-1',
    };
    const ticketCreate = jest.fn().mockResolvedValue(created);
    const prisma: Record<string, unknown> = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ currency: 'PKR' }),
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

  const baseDto = {
    flow: 'judicial_power_of_attorney',
    serviceId: 'svc-1',
    payload: POA_PAYLOAD,
  };

  it('rejects a consumer-class actor whose sub does not match dto.consumerId', async () => {
    const { service, ticketCreate } = buildHarness();

    await expect(
      service.createIntakeTicket(
        { ...baseDto, consumerId: 'other-consumer' } as never,
        {
          actorUserId: 'me',
          actorEmail: 'me@x.com',
          actorRole: 'consumer',
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(ticketCreate).not.toHaveBeenCalled();
  });

  it('binds an omitted dto.consumerId to the consumer-class actor', async () => {
    const { service, prisma, ticketCreate } = buildHarness();

    await service.createIntakeTicket({ ...baseDto } as never, {
      actorUserId: 'me',
      actorEmail: 'me@x.com',
      actorRole: 'consumer',
    });

    expect(
      (prisma.user as { findUnique: jest.Mock }).findUnique,
    ).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'me' } }));
    expect(ticketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ consumerId: 'me' }),
      }),
    );
  });

  it('allows a staff actor to create an intake on behalf of an explicit foreign consumerId', async () => {
    const { service, prisma, ticketCreate } = buildHarness();

    await service.createIntakeTicket(
      { ...baseDto, consumerId: 'foreign-consumer' } as never,
      {
        actorUserId: 'staff-1',
        actorEmail: 'staff@x.com',
        actorRole: 'staff-admin',
      },
    );

    expect(
      (prisma.user as { findUnique: jest.Mock }).findUnique,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'foreign-consumer' } }),
    );
    expect(ticketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ consumerId: 'foreign-consumer' }),
      }),
    );
  });
});
