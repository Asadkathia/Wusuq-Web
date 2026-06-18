import { jest } from '@jest/globals';
import { PromosService } from './promos.service';

const BASE = {
  id: 'promo-1',
  code: 'SAVE10',
  type: 'PERCENT',
  value: 10,
  maxDiscount: 2000,
  startsAt: null,
  endsAt: null,
  totalUsageLimit: null,
  perUserLimit: 1,
  serviceScope: [],
  active: true,
};

function build(promo: any, redemptionCounts = { total: 0, user: 0 }) {
  const prisma = {
    promoCode: {
      findUnique: jest.fn(async () => promo),
    },
    promoRedemption: {
      count: jest.fn(async ({ where }: any) =>
        where.userId ? redemptionCounts.user : redemptionCounts.total,
      ),
    },
  };
  return new PromosService(prisma as never);
}

describe('PromosService.validate', () => {
  it('returns the capped percentage discount', async () => {
    const svc = build(BASE);
    const r = await svc.validate({ code: 'save10', userId: 'u1', flow: 'judicial_case_files', subtotal: 100000 });
    expect(r.valid).toBe(true);
    expect(r.discount).toBe(2000); // 10% of 100000 = 10000, capped at 2000
    expect(r.promoCodeId).toBe('promo-1');
  });

  it('returns a fixed discount not exceeding the subtotal', async () => {
    const svc = build({ ...BASE, type: 'FIXED', value: 5000, maxDiscount: null });
    const r = await svc.validate({ code: 'SAVE10', userId: 'u1', flow: 'x', subtotal: 3000 });
    expect(r.discount).toBe(3000);
  });

  it('rejects an unknown code', async () => {
    const svc = build(null);
    const r = await svc.validate({ code: 'NOPE', userId: 'u1', flow: 'x', subtotal: 1000 });
    expect(r.valid).toBe(false);
    expect(r.discount).toBe(0);
  });

  it('rejects an inactive code', async () => {
    const svc = build({ ...BASE, active: false });
    const r = await svc.validate({ code: 'SAVE10', userId: 'u1', flow: 'x', subtotal: 1000 });
    expect(r.valid).toBe(false);
  });

  it('rejects a code outside its service scope', async () => {
    const svc = build({ ...BASE, serviceScope: ['judicial_case_search'] });
    const r = await svc.validate({ code: 'SAVE10', userId: 'u1', flow: 'judicial_case_files', subtotal: 1000 });
    expect(r.valid).toBe(false);
  });

  it('rejects when the per-user limit is reached', async () => {
    const svc = build(BASE, { total: 5, user: 1 }); // perUserLimit = 1
    const r = await svc.validate({ code: 'SAVE10', userId: 'u1', flow: 'x', subtotal: 1000 });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/limit/i);
  });
});
