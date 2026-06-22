import { jest } from '@jest/globals';
import { requiredFieldsFor, COURT_TIERS } from '@wusuq/shared';
import { TicketsService } from './tickets.service';

function makeDispatcher() {
  return {
    ticketCreated: jest.fn().mockResolvedValue(undefined),
    ticketStatusChanged: jest.fn().mockResolvedValue(undefined),
    ticketDispatched: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
  };
}

// Audit 5.1: Case Search by CNIC could never submit — the wizard hides
// case_status unless search_method ∈ {details, both}, but the validator
// required it at every tier. It must be dropped for judicial_case_search at
// all six tiers (search is a free-form lookup by design).
describe('Case Search case_status is optional at every tier (audit 5.1)', () => {
  const BASE = [
    'select_service',
    'select_court',
    'select_court_city',
    'case_petition_no',
    'case_year',
    'case_type',
    'case_status',
    'case_title',
    'delivery_mode',
  ];

  it.each([...COURT_TIERS])('drops case_status at the %s tier', (tier) => {
    const req = requiredFieldsFor('judicial_case_search', BASE, tier);
    expect(req).not.toContain('case_status');
  });

  it('createIntakeTicket accepts a CNIC-mode payload without case_status', async () => {
    const prisma: Record<string, any> = {
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
        create: jest.fn().mockResolvedValue({ id: 'tkt-1', batchNo: 'T-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'tkt-1' }),
      },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticketIntakeDraft: { delete: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    );
    const pricingService = {
      resolve: jest.fn().mockResolvedValue({
        matched: true,
        available: true,
        rulesExistForFlow: true,
        basePrice: 2000,
        deliveryCharge: 0,
        clerkBaseCost: null,
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

    // CNIC-mode payload: no case_status, no case number/year/type/title.
    await expect(
      service.createIntakeTicket(
        {
          flow: 'judicial_case_search',
          consumerId: 'c-1',
          serviceId: 'svc-1',
          payload: {
            select_service: 'Judicial',
            select_court: 'Case Search',
            select_court_city: 'Lahore',
            select_court_type: 'Lower Court',
            search_method: 'cnic',
            cnic: '12345-1234567-1',
            delivery_mode: 'portal',
          },
        } as never,
        { actorUserId: 'c-1', actorEmail: 'c@x.com' },
      ),
    ).resolves.toMatchObject({ id: 'tkt-1' });
  });
});
