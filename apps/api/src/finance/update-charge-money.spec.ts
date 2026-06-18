import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';

function build(ticket: any) {
  const prisma = {
    ticket: {
      findUnique: jest.fn(async () => ticket),
      update: jest.fn(async ({ data }: any) => ({ ...ticket, ...data })),
    },
  };
  const auditLogsService = { create: jest.fn() };
  return { service: new FinanceService(prisma as never, auditLogsService as never), prisma };
}

const TICKET = {
  id: 't1',
  serviceCost: 5000,
  deliveryCharges: 0,
  printingCharges: 0,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  additionalCharges: 0,
  additionalServiceCost: 0,
  discountPrice: 0,
  promoDiscount: 0,
  taxRate: 0.17,
  amountPaid: 0,
};

describe('FinanceService.updateCharge money', () => {
  it('recomputes total with tax via the shared function', async () => {
    const { service } = build(TICKET);
    const r = await service.updateCharge('t1', { discountPrice: 1000 });
    // taxable 4000 → tax 680 → total 4680
    expect(r.totalAmount).toBe(4680);
  });

  it('allows a discount that pushes total below serviceCost', async () => {
    const { service } = build(TICKET);
    const r = await service.updateCharge('t1', { discountPrice: 4900 });
    // taxable 100 → tax 17 → total 117 (< serviceCost 5000) — allowed
    expect(r.totalAmount).toBe(117);
  });

  it('still rejects a total below amount already paid', async () => {
    const { service } = build({ ...TICKET, amountPaid: 3000, taxRate: 0 });
    await expect(
      service.updateCharge('t1', { discountPrice: 4000 }), // total 1000 < paid 3000
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
