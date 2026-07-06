import { TicketsService } from './tickets.service';

describe('TicketsService.assembleFinalizeMoney', () => {
  it('taxes the full cumulative charges at finalize', () => {
    const m = TicketsService.assembleFinalizeMoney({
      serviceCost: 3000,
      additionalCharges: 0,
      additionalServiceCost: 0,
      discountPrice: 0,
      promoDiscount: 0,
      taxRate: 0.17,
      attested: 1000,
      nonAttested: 0,
      printing: 500,
      delivery: 800,
    });
    // subtotal 5300; tax base = serviceCost only (3000) → tax 510 → total 5810
    // (C1: delivery/printing/attested/non-attested are not taxed)
    expect(m.totalAmount).toBe(5810);
    expect(m.taxAmount).toBe(510);
  });

  it('subtracts discount + promo before tax', () => {
    const m = TicketsService.assembleFinalizeMoney({
      serviceCost: 3000,
      additionalCharges: 0,
      additionalServiceCost: 0,
      discountPrice: 300,
      promoDiscount: 0,
      taxRate: 0.17,
      attested: 0,
      nonAttested: 0,
      printing: 0,
      delivery: 0,
    });
    // taxable 2700 → tax 459 → total 3159
    expect(m.totalAmount).toBe(3159);
  });
});
