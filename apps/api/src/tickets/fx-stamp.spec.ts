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

/**
 * Builds a TicketsService with a mocked Prisma + pricing/currency and drives
 * `createIntakeTicket`, returning the object passed to `tx.ticket.create`.
 * Mirrors the harness in `intake-currency.spec.ts`.
 */
async function captureIntakeCreate(opts: {
  userCurrency: 'PKR' | 'USD';
  rate: number | null;
}) {
  const ticketCreate = jest
    .fn<(...a: any[]) => any>()
    .mockResolvedValue({ id: 'tkt-1', batchNo: 'TKT-1' });
  const prisma: Record<string, unknown> = {
    user: {
      findUnique: jest
        .fn<(...a: any[]) => any>()
        .mockResolvedValue({ id: 'c-1', currency: opts.userCurrency }),
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
  const currencyService = {
    getRateToPkr: jest.fn<(...a: any[]) => any>().mockResolvedValue(opts.rate),
  };
  const service = new TicketsService(
    prisma as never,
    { create: jest.fn<(...a: any[]) => any>().mockResolvedValue({}) } as never,
    pricingService as never,
    { resolveProvinceByCity: jest.fn() } as never,
    dispatcher as never,
    { settleTicketsForUser: jest.fn() } as never,
    undefined,
    undefined,
    currencyService as never,
  );

  await service.createIntakeTicket(
    {
      flow: 'judicial_case_files',
      consumerId: 'c-1',
      serviceId: 'svc-1',
      payload: CASE_FILES_PAYLOAD,
    } as never,
    { actorUserId: 'c-1', actorEmail: 'c@x.com' },
  );

  const data = (ticketCreate.mock.calls[0] as any)[0].data;
  return { data };
}

describe('fxRateToPkr stamping', () => {
  it('stamps the current rate on a USD ticket at intake', async () => {
    const { data } = await captureIntakeCreate({
      userCurrency: 'USD',
      rate: 285,
    });
    expect(Number(data.fxRateToPkr)).toBe(285);
  });

  it('leaves fxRateToPkr null on a PKR ticket', async () => {
    const { data } = await captureIntakeCreate({
      userCurrency: 'PKR',
      rate: 285,
    });
    expect(data.fxRateToPkr ?? null).toBeNull();
  });

  it('stamps null (does not block intake) when no rate exists', async () => {
    const { data } = await captureIntakeCreate({
      userCurrency: 'USD',
      rate: null,
    });
    expect(data.fxRateToPkr ?? null).toBeNull();
  });
});
