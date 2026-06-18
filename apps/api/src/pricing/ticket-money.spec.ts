import { computeTicketTotal, round2 } from '@wusuq/shared';

const ZERO = {
  serviceCost: 0,
  deliveryCharges: 0,
  printingCharges: 0,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  additionalCharges: 0,
  additionalServiceCost: 0,
};

describe('computeTicketTotal', () => {
  it('sums charges with no discount/tax', () => {
    const r = computeTicketTotal({ charges: { ...ZERO, serviceCost: 3000 } });
    expect(r.chargesSubtotal).toBe(3000);
    expect(r.taxableBase).toBe(3000);
    expect(r.taxAmount).toBe(0);
    expect(r.totalAmount).toBe(3000);
  });

  it('applies staff discount and promo before tax', () => {
    const r = computeTicketTotal({
      charges: { ...ZERO, serviceCost: 10000 },
      discountPrice: 1000,
      promoDiscount: 1000,
      taxRate: 0.17,
    });
    expect(r.discountTotal).toBe(2000);
    expect(r.taxableBase).toBe(8000);
    expect(r.taxAmount).toBe(1360); // 8000 * 0.17
    expect(r.totalAmount).toBe(9360);
  });

  it('never lets discounts push the taxable base below zero', () => {
    const r = computeTicketTotal({
      charges: { ...ZERO, serviceCost: 500 },
      discountPrice: 9999,
      taxRate: 0.17,
    });
    expect(r.taxableBase).toBe(0);
    expect(r.taxAmount).toBe(0);
    expect(r.totalAmount).toBe(0);
  });

  it('rounds tax to 2 decimals', () => {
    const r = computeTicketTotal({
      charges: { ...ZERO, serviceCost: 333 },
      taxRate: 0.17,
    });
    expect(r.taxAmount).toBe(56.61); // round2(56.61)
    expect(round2(56.61)).toBe(56.61);
  });
});
