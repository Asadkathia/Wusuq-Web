import { consumerInvoiceLineItems } from './consumer-invoice.pdf';

const base = {
  batchNo: 'TKT-1',
  status: 'COMPLETED',
  consumer: { name: 'A', email: 'a@x.com' },
  serviceCost: 500,
  additionalServiceCost: 0,
  deliveryCharges: 300,
  printingCharges: 50,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  additionalCharges: 0,
  discountPrice: 0,
  promoDiscount: 0,
  taxAmount: 85,
  taxRate: 0.17,
  totalAmount: 935,
  amountPaid: 0,
  currency: 'PKR' as const,
  remainderFinalizedAt: '2026-07-06',
};

describe('consumerInvoiceLineItems (C14)', () => {
  it('never includes clerk cost, includes tax', () => {
    const labels = consumerInvoiceLineItems(base).map((r) =>
      r.label.toLowerCase(),
    );
    expect(labels.some((l) => l.includes('clerk'))).toBe(false);
    expect(labels.some((l) => l.includes('tax'))).toBe(true);
    expect(labels).toEqual(
      expect.arrayContaining(['service', 'delivery', 'printing']),
    );
  });
  it('hides phase-2 lines until finalized', () => {
    const rows = consumerInvoiceLineItems({
      ...base,
      remainderFinalizedAt: null,
    });
    const labels = rows.map((r) => r.label.toLowerCase());
    expect(labels).toEqual(expect.arrayContaining(['service']));
    expect(
      labels.some((l) => l.includes('delivery') || l.includes('printing')),
    ).toBe(false);
  });
});
