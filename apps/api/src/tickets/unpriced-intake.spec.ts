import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

function makeDispatcher() {
  return {
    ticketCreated: jest.fn().mockResolvedValue(undefined),
    ticketStatusChanged: jest.fn().mockResolvedValue(undefined),
    ticketDispatched: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
  };
}

const FIR_PAYLOAD = {
  province: 'Punjab',
  district_id: 'Lahore',
  fir_no: '123',
  year: '2024',
  offence: 'Theft',
  case_title: 'State vs X',
  city_type: 'City',
  delivery_mode: 'courier',
};

function buildHarness() {
  const ticketCreate = jest
    .fn()
    .mockResolvedValue({ id: 'tkt-1', batchNo: 'T-1' });
  const prisma: Record<string, any> = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'c-1' }) },
    service: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'svc-1', category: 'non-judicial' }),
    },
    ticket: {
      create: ticketCreate,
      findUnique: jest.fn().mockResolvedValue({ id: 'tkt-1' }),
    },
    ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    ticketIntakeDraft: { delete: jest.fn().mockResolvedValue({}) },
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  const pricingService = {
    // No rules seeded at all for this flow.
    resolve: jest.fn().mockResolvedValue({
      matched: false,
      rulesExistForFlow: false,
      basePrice: 0,
      deliveryCharge: 0,
      serviceCost: 0,
      total: 0,
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
  return { service, ticketCreate };
}

const dto = {
  flow: 'non_judicial_copy_of_fir',
  consumerId: 'c-1',
  serviceId: 'svc-1',
  payload: FIR_PAYLOAD,
};

// Audit 1.4: the three non-judicial services have no pricing rules and were
// silently created free of charge (a logger.warn was the only signal). A
// flow with NO rules must now fail loudly unless ops explicitly opts into
// free intake via ALLOW_UNPRICED_INTAKE=true.
describe('unpriced-flow intake fails loudly (audit 1.4)', () => {
  let prevAllow: string | undefined;
  beforeEach(() => {
    prevAllow = process.env.ALLOW_UNPRICED_INTAKE;
    delete process.env.ALLOW_UNPRICED_INTAKE;
  });
  afterEach(() => {
    if (prevAllow === undefined) delete process.env.ALLOW_UNPRICED_INTAKE;
    else process.env.ALLOW_UNPRICED_INTAKE = prevAllow;
  });

  it('rejects intake when the flow has no pricing rules at all', async () => {
    const { service, ticketCreate } = buildHarness();
    await expect(
      service.createIntakeTicket(dto as never, {
        actorUserId: 'c-1',
        actorEmail: 'c@x.com',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(ticketCreate).not.toHaveBeenCalled();
  });

  it('allows a free ticket when ALLOW_UNPRICED_INTAKE=true', async () => {
    process.env.ALLOW_UNPRICED_INTAKE = 'true';
    const { service, ticketCreate } = buildHarness();
    await expect(
      service.createIntakeTicket(dto as never, {
        actorUserId: 'c-1',
        actorEmail: 'c@x.com',
      }),
    ).resolves.toMatchObject({ id: 'tkt-1' });
    expect(ticketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalAmount: 0 }),
      }),
    );
  });
});
