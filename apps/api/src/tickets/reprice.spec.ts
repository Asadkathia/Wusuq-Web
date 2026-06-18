import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

function buildService(ticket: any, resolved: any) {
  const tx = {
    ticket: {
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
    {} as never,   // geoService
    {} as never,   // dispatcher
    {} as never,   // walletService
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

describe('TicketsService.repricePreview', () => {
  it('re-resolves and returns the tax-inclusive money for a digital flow', async () => {
    const ticket = {
      id: 't1',
      status: 'PAID',
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
    const { svc } = buildService(ticket, RESOLVED);
    const out = await svc.repricePreview('t1', { payload: { year: '2024' } });
    expect(out.charges.serviceCost).toBe(7000);
    expect(out.money.totalAmount).toBe(8190); // 7000 + 17%
  });
});
