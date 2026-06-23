import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

const USD_FLAT_RESOLVE = {
  matched: true,
  available: true,
  rulesExistForFlow: true,
  basePrice: 50,
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
  serviceCost: 50,
  total: 50,
};

const CASE_FILES_PAYLOAD = {
  select_service: 'Lower Court',
  select_court: 'Case Files',
  select_court_city: 'Lahore',
  case_petition_no: '123',
  case_year: '2024',
  case_type: 'Civil',
  case_status: 'Decided Case',
  case_title: 'A vs B',
  judge_name: 'J',
  sets: '1',
  set_type: 'attested',
  attested_qty: '1',
  delivery_mode: 'tcs',
};

function buildHarness(currency: 'PKR' | 'USD') {
  const ticketCreate = jest
    .fn<(...a: any[]) => any>()
    .mockResolvedValue({ id: 'tkt-1', batchNo: 'TKT-1' });
  const prisma: Record<string, unknown> = {
    user: {
      findUnique: jest
        .fn<(...a: any[]) => any>()
        .mockResolvedValue({ id: 'c-1' }),
      findUniqueOrThrow: jest
        .fn<(...a: any[]) => any>()
        .mockResolvedValue({ currency }),
    },
    service: {
      findUnique: jest
        .fn<(...a: any[]) => any>()
        .mockResolvedValue({ id: 'svc-1', category: 'judicial' }),
    },
    ticket: {
      create: ticketCreate,
      findUnique: jest.fn<(...a: any[]) => any>().mockResolvedValue(null),
    },
    ticketStatusHistory: {
      create: jest.fn<(...a: any[]) => any>().mockResolvedValue({}),
    },
    ticketIntakeDraft: {
      delete: jest.fn<(...a: any[]) => any>().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  const pricingService = {
    resolve: jest
      .fn<(...a: any[]) => any>()
      .mockResolvedValue(USD_FLAT_RESOLVE),
  };
  const dispatcher = {
    ticketCreated: jest.fn<(...a: any[]) => any>().mockResolvedValue(undefined),
  };
  const service = new TicketsService(
    prisma as never,
    { create: jest.fn<(...a: any[]) => any>().mockResolvedValue({}) } as never,
    pricingService as never,
    { resolveProvinceByCity: jest.fn() } as never,
    dispatcher as never,
    { settleTicketsForUser: jest.fn() } as never,
  );
  return { service, prisma, ticketCreate, pricingService };
}

const dtoFor = (extra: Record<string, unknown> = {}) => ({
  flow: 'judicial_case_files',
  consumerId: 'c-1',
  serviceId: 'svc-1',
  payload: CASE_FILES_PAYLOAD,
  ...extra,
});

describe('createIntakeTicket currency', () => {
  it('stamps Ticket.currency from the consumer and bills USD Case Files as ONE_TIME full total, tax 0', async () => {
    const { service, ticketCreate, pricingService } = buildHarness('USD');

    await service.createIntakeTicket(dtoFor() as never, {
      actorUserId: 'c-1',
      actorEmail: 'c@x.com',
    });

    // resolve was called with currency='USD' (3rd builder arg → input.currency)
    expect(pricingService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'USD' }),
    );
    // Case Files is SPLIT for PKR, but USD forces ONE_TIME → full total billed.
    expect(ticketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currency: 'USD',
          totalAmount: 50,
          taxAmount: 0,
        }),
      }),
    );
  });

  it('rejects a promo code for a USD ticket', async () => {
    const { service } = buildHarness('USD');
    await expect(
      service.createIntakeTicket(dtoFor({ promoCode: 'SAVE10' }) as never, {
        actorUserId: 'c-1',
        actorEmail: 'c@x.com',
      }),
    ).rejects.toThrow(/international \(USD\) orders/i);
  });
});
