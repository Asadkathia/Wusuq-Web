import { computeTicketTotal } from '@wusuq/shared';

const base = {
  charges: {
    serviceCost: 500,
    deliveryCharges: 300,
    printingCharges: 50,
    attestedCharges: 0,
    nonAttestedCharges: 0,
    additionalCharges: 0,
    additionalServiceCost: 0,
  },
  discountPrice: 0,
  promoDiscount: 0,
  taxRate: 0.17,
};

describe('computeTicketTotal — tax on base only (C1)', () => {
  it('taxes serviceCost only, keeps other charges untaxed in the total', () => {
    const r = computeTicketTotal(base);
    expect(r.chargesSubtotal).toBe(850);
    expect(r.taxAmount).toBe(85); // 500 * 0.17, NOT 850 * 0.17
    expect(r.totalAmount).toBe(935); // 850 + 85
  });

  it('includes additionalServiceCost in the taxable base', () => {
    const r = computeTicketTotal({
      ...base,
      charges: { ...base.charges, additionalServiceCost: 200 },
    });
    expect(r.taxAmount).toBe(round2((500 + 200) * 0.17)); // 119
    expect(r.totalAmount).toBe(round2(1050 - 0 + 119)); // 850+200 = 1050 subtotal + 119 tax
  });

  it('discount reduces the taxable base and floors at 0', () => {
    const r = computeTicketTotal({ ...base, discountPrice: 600 }); // discount > serviceBase(500)
    expect(r.taxableBase).toBe(0);
    expect(r.taxAmount).toBe(0);
    expect(r.totalAmount).toBe(250); // max(0, 850 - 600) + 0
  });

  it('USD-style zero rate yields no tax', () => {
    const r = computeTicketTotal({ ...base, taxRate: 0 });
    expect(r.taxAmount).toBe(0);
    expect(r.totalAmount).toBe(850);
  });
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
