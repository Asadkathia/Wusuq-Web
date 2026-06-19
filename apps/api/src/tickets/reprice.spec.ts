import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

function buildService(ticket: any, resolved: any) {
  const tx = {
    ticket: {
      // Used by the in-tx fresh read (fix 3) and by any other tx-scoped lookups
      findUnique: jest.fn(async () => ticket),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: { update: jest.fn(async () => ({})) },
    walletTransaction: { create: jest.fn(async () => ({})) },
    ticketStatusHistory: { create: jest.fn(async () => ({})) },
  };
  const prisma = {
    ticket: { findUnique: jest.fn(async () => ticket) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const auditLogsService = { create: jest.fn() };
  const pricingService = { resolve: jest.fn(async () => resolved) };
  const settingsService = { getTaxRate: jest.fn(async () => 0.17) };

  // Constructor: prisma, auditLogsService, pricingService, geoService,
  // dispatcher, walletService, settingsService, promosService
  const svc = new TicketsService(
    prisma as never,
    auditLogsService as never,
    pricingService as never,
    {} as never, // geoService
    {} as never, // dispatcher
    {} as never, // walletService
    settingsService as never,
  );
  return { svc, tx, prisma, pricingService, settingsService };
}

const RESOLVED = {
  matched: true,
  available: true,
  rulesExistForFlow: true,
  serviceCost: 7000,
  total: 7000,
  deliveryCharge: 0,
  basePrice: 7000,
  pdfSurcharge: 0,
  titleSurcharge: 0,
  ageSurcharge: 0,
  bundleSurcharge: 0,
  searchBothSurcharge: 0,
  cityCount: 1,
  clerkBaseCost: null,
  attestedCharge: 0,
  nonAttestedCharge: 0,
};

const BASE_TICKET = {
  id: 't1',
  status: 'PAID',
  consumerId: 'consumer-1',
  amountPaid: 0,
  intakeFlow: 'judicial_case_information',
  formPayload: { case_status: 'Pending Case' },
  serviceCost: 3300,
  deliveryCharges: 0,
  printingCharges: 0,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  additionalCharges: 0,
  additionalServiceCost: 0,
  discountPrice: 0,
  promoDiscount: 0,
};

const ACTOR = { actorUserId: 'admin-1', actorEmail: 'admin@example.com' };

describe('TicketsService.repricePreview', () => {
  it('re-resolves and returns the tax-inclusive money for a digital flow', async () => {
    const { svc } = buildService(BASE_TICKET, RESOLVED);
    const out = await svc.repricePreview('t1', { payload: { year: '2024' } });
    expect(out.charges.serviceCost).toBe(7000);
    expect(out.money.totalAmount).toBe(8190); // 7000 + 17%
  });
});

describe('TicketsService.repriceTicket (persist path)', () => {
  it('rejects a DELIVERED ticket without calling resolve', async () => {
    const deliveredTicket = { ...BASE_TICKET, status: 'DELIVERED' };
    const { svc, pricingService } = buildService(deliveredTicket, RESOLVED);
    jest.spyOn(svc, 'findOne').mockResolvedValue(deliveredTicket as any);
    await expect(svc.repriceTicket('t1', {}, ACTOR)).rejects.toThrow(
      BadRequestException,
    );
    expect(pricingService.resolve).not.toHaveBeenCalled();
  });

  it('rejects when resolve returns matched: false regardless of rulesExistForFlow', async () => {
    const unmatchedResolved = {
      ...RESOLVED,
      matched: false,
      rulesExistForFlow: false,
    };
    const { svc, prisma } = buildService(BASE_TICKET, unmatchedResolved);
    jest.spyOn(svc, 'findOne').mockResolvedValue(BASE_TICKET as any);
    await expect(svc.repriceTicket('t1', {}, ACTOR)).rejects.toThrow(
      BadRequestException,
    );
    // Transaction must NOT be entered — serviceCost 0 must never be persisted
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('credits surplus to wallet with user-lock-before-ticket order on downward reprice', async () => {
    // amountPaid (10000) > new total (~8190 after 17% tax on 7000)
    const ticket = { ...BASE_TICKET, amountPaid: 10000 };
    const callOrder: string[] = [];

    const { svc, tx } = buildService(ticket, RESOLVED);

    // Override tx mocks to track invocation order
    (tx.user.update as any) = jest.fn(async () => {
      callOrder.push('user.update');
      return {};
    });
    (tx.ticket.updateMany as any) = jest.fn(async () => {
      callOrder.push('ticket.updateMany');
      return { count: 1 };
    });

    jest.spyOn(svc, 'findOne').mockResolvedValue(ticket as any);
    await svc.repriceTicket('t1', {}, ACTOR);

    expect(callOrder[0]).toBe('user.update');
    expect(callOrder[1]).toBe('ticket.updateMany');
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ADMIN_ADJUSTMENT',
          status: 'VERIFIED',
          userId: 'consumer-1',
        }),
      }),
    );
  });

  it('does not include a status key in the ticket updateMany data', async () => {
    const { svc, tx } = buildService(BASE_TICKET, RESOLVED);
    jest.spyOn(svc, 'findOne').mockResolvedValue(BASE_TICKET as any);
    await svc.repriceTicket('t1', {}, ACTOR);

    const calls = (tx.ticket.updateMany as jest.MockedFunction<any>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const data = calls[0][0].data;
    expect(data).not.toHaveProperty('status');
  });
});
