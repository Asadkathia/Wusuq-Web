import { jest } from '@jest/globals';
import { deriveYearBand } from '@wusuq/shared';
import { PricingService } from './pricing.service';

// Regression for the 2026-06 Pending Case Files overcharge: a Pending case with
// no explicit yearBand must resolve on the 'pending' band, NOT 'current'. The
// resolver used to derive the band from caseYear alone (which can never yield
// 'pending'), so Punjab Case Files were quoted Rs 3,300 (pending rule) but
// charged Rs 7,300 (current rule).
describe('PricingService.resolve — pending band derivation', () => {
  const pendingRule = {
    id: 'r-pending',
    isActive: true,
    isLegacy: false,
    flow: 'judicial_case_files',
    courtLevel: 'lower',
    caseStatus: null,
    region: 'Punjab',
    yearBand: 'pending',
    yearFrom: null,
    yearTo: null,
    setType: null,
    basePrice: 3000,
    priority: 0,
    availability: true,
    pdfSurchargeAmount: 0,
    deliveryGuyFee: 0,
    deliveryCharge: 0,
    clerkBaseCost: null,
  };
  const currentRule = {
    ...pendingRule,
    id: 'r-current',
    yearBand: 'current',
    basePrice: 7000,
  };

  function buildService() {
    const prisma = {
      pricingSettings: {
        upsert: jest.fn().mockResolvedValue({
          pricingMode: 'custom',
          attestedPricePerSet: 0,
          nonAttestedPricePerSet: 0,
        }),
      },
      pricingRule: {
        findMany: jest.fn().mockResolvedValue([pendingRule, currentRule]),
      },
    };
    return new PricingService(prisma as never);
  }

  it('derives the pending band from caseStatus even with a historical caseYear', () => {
    // Pending short-circuits before any year bucketing.
    expect(deriveYearBand('Pending Case', 2018)).toBe('pending');
    expect(deriveYearBand('Decided Case', 2018)).toBe('y2019_2017');
  });

  it('Pending Case Files resolves the pending rule (Rs 3,000), not current (Rs 7,000)', async () => {
    const service = buildService();
    const result = await service.resolve({
      flow: 'judicial_case_files',
      courtLevel: 'lower',
      caseStatus: 'Pending Case',
      caseYear: 2024, // a historical-band year — must be ignored for pending
      region: 'Punjab',
    } as never);

    expect(result.matched).toBe(true);
    expect(result.ruleId).toBe('r-pending');
    expect(result.serviceCost).toBe(3000);
  });

  it('Decided/current Case Files resolves the current rule (Rs 7,000)', async () => {
    const service = buildService();
    const result = await service.resolve({
      flow: 'judicial_case_files',
      courtLevel: 'lower',
      caseStatus: 'Decided Case',
      region: 'Punjab',
    } as never);

    expect(result.ruleId).toBe('r-current');
    expect(result.serviceCost).toBe(7000);
  });
});

// Delivery applies ONLY to physical-document services (Case Files). Other flows
// must never pick up a delivery fee/charge even when a physical delivery method
// is supplied and the matched rule carries a deliveryGuyFee (owner 2026-06).
describe('PricingService.resolve — delivery is Case-Files-only', () => {
  const ruleWithDelivery = {
    id: 'r-poa',
    isActive: true,
    isLegacy: false,
    flow: 'judicial_power_of_attorney',
    courtLevel: 'lower',
    caseStatus: null,
    region: 'Punjab',
    yearBand: 'current',
    yearFrom: null,
    yearTo: null,
    setType: null,
    basePrice: 2000,
    priority: 0,
    availability: true,
    pdfSurchargeAmount: 0,
    deliveryGuyFee: 100,
    deliveryCharge: 100,
    clerkBaseCost: null,
  };

  function buildService(flow: string, rule: Record<string, unknown>) {
    const prisma = {
      pricingSettings: {
        upsert: jest.fn().mockResolvedValue({
          pricingMode: 'custom',
          attestedPricePerSet: 0,
          nonAttestedPricePerSet: 0,
        }),
      },
      pricingRule: {
        findMany: jest.fn().mockResolvedValue([{ ...rule, flow }]),
      },
    };
    return new PricingService(prisma as never);
  }

  it('Power of Attorney with courier delivery → delivery charge is 0', async () => {
    const service = buildService(
      'judicial_power_of_attorney',
      ruleWithDelivery,
    );
    const result = await service.resolve({
      flow: 'judicial_power_of_attorney',
      courtLevel: 'lower',
      region: 'Punjab',
      deliveryMethod: 'courier',
    } as never);

    expect(result.deliveryFee).toBe(0);
    expect(result.deliveryCharge).toBe(0);
    expect(result.total).toBe(2000); // base only, no delivery
  });

  it('Case Files with courier delivery → delivery fee + charge apply', async () => {
    const service = buildService('judicial_case_files', ruleWithDelivery);
    const result = await service.resolve({
      flow: 'judicial_case_files',
      courtLevel: 'lower',
      region: 'Punjab',
      deliveryMethod: 'courier',
    } as never);

    expect(result.deliveryFee).toBe(100);
    expect(result.deliveryCharge).toBe(200); // static 100 + fee 100
  });
});
