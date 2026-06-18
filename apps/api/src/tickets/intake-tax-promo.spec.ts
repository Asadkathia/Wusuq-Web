import { TicketsService } from './tickets.service';

describe('TicketsService.assembleIntakeMoney', () => {
  it('digital ONE_TIME: tax on the full service cost, no discount', () => {
    const m = TicketsService.assembleIntakeMoney({
      flow: 'judicial_case_information',
      serviceCost: 5000,
      deliveryCharge: 0,
      taxRate: 0.17,
      promoDiscount: 0,
    });
    expect(m.charges.serviceCost).toBe(5000);
    expect(m.money.taxAmount).toBe(850);
    expect(m.money.totalAmount).toBe(5850);
  });

  it('SPLIT: bills only phase-1 base + tax on it at intake', () => {
    const m = TicketsService.assembleIntakeMoney({
      flow: 'judicial_case_files',
      serviceCost: 3000,
      deliveryCharge: 0,
      taxRate: 0.17,
      promoDiscount: 0,
    });
    expect(m.charges.deliveryCharges).toBe(0); // phase-2 for SPLIT
    expect(m.money.totalAmount).toBe(3510); // 3000 + 17%
  });

  it('applies promo before tax', () => {
    const m = TicketsService.assembleIntakeMoney({
      flow: 'judicial_case_information',
      serviceCost: 5000,
      deliveryCharge: 0,
      taxRate: 0.17,
      promoDiscount: 1000,
    });
    expect(m.money.taxableBase).toBe(4000);
    expect(m.money.totalAmount).toBe(4680);
  });
});
