import { jest } from '@jest/globals';
import { FinanceService } from './finance.service';

function build(ticket: any) {
  const prisma = {
    ticket: {
      findUnique: jest.fn(async () => ticket),
      update: jest.fn(async ({ data }: any) => ({ ...ticket, ...data })),
    },
  };
  const auditLogsService = { create: jest.fn() };
  return {
    service: new FinanceService(prisma as never, auditLogsService as never),
    prisma,
  };
}

const TICKET = {
  id: 't1',
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
  currency: 'PKR',
};

describe('FinanceService.updateCharge priceBreakdown snapshot (C10)', () => {
  it('writes a priceBreakdown snapshot on override', async () => {
    const { service, prisma } = build(TICKET);
    await service.updateCharge(
      't1',
      { serviceCost: 800 },
      {
        actorUserId: 'a',
        actorEmail: 'a@x',
      },
    );

    const data = (prisma.ticket.update.mock.calls.at(-1) as any)[0].data;
    expect(data.priceBreakdown).toBeTruthy();
    expect(data.priceBreakdown.resolver.serviceCost).toBe(800);
    expect(data.priceBreakdown.applied.totalAmount).toBe(
      Number(data.totalAmount),
    );
    expect(Number(data.totalAmount)).toBeGreaterThanOrEqual(800);
  });

  it('reflects an explicit dto.amount override in the snapshot total', async () => {
    const { service, prisma } = build({ ...TICKET, taxRate: 0 });
    await service.updateCharge('t1', { amount: 9999 });

    const data = (prisma.ticket.update.mock.calls.at(-1) as any)[0].data;
    expect(data.priceBreakdown.applied.totalAmount).toBe(9999);
    expect(Number(data.totalAmount)).toBe(9999);
  });

  it('stamps the ticket-stored taxRate into the snapshot (no USD special-casing)', async () => {
    const { service, prisma } = build({
      ...TICKET,
      taxRate: 0.17,
      currency: 'USD',
    });
    await service.updateCharge('t1', { serviceCost: 1000 });

    const data = (prisma.ticket.update.mock.calls.at(-1) as any)[0].data;
    expect(data.priceBreakdown.taxRate).toBe(0.17);
  });
});
