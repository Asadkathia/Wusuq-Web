import { jest } from '@jest/globals';
import { PricingService, SEARCH_BOTH_SURCHARGE } from './pricing.service';

// Regression for audit 1.2: Case Search's city multiplier and search-both
// surcharge used to live ONLY in `total`, not in `serviceCost`. Every
// component-sum recompute of totalAmount (assign, finance.updateCharge) and
// the PAID gate (isBaseCovered) read serviceCost, so a 3-city "both" search
// quoted at Rs 9,000 was silently rewritten to Rs 3,000 on assignment.
// For ONE_TIME (digital) flows serviceCost must equal the full intake-billed
// amount, i.e. serviceCost === total.
describe('PricingService.resolve — ONE_TIME serviceCost identity (audit 1.2)', () => {
  const searchRule = {
    id: 'r-search',
    isActive: true,
    isLegacy: false,
    flow: 'judicial_case_search',
    courtLevel: 'lower',
    caseStatus: null,
    region: 'Punjab',
    yearBand: 'current',
    yearFrom: null,
    yearTo: null,
    setType: null,
    basePrice: 999, // ignored — Case Search uses the per-year base
    priority: 0,
    availability: true,
    pdfSurchargeAmount: 0,
    deliveryGuyFee: 0,
    deliveryCharge: 0,
    clerkBaseCost: null,
  };

  function buildService(rules: Record<string, unknown>[]) {
    const prisma = {
      pricingSettings: {
        upsert: jest.fn().mockResolvedValue({
          pricingMode: 'custom',
          attestedPricePerSet: 0,
          nonAttestedPricePerSet: 0,
        }),
      },
      pricingRule: { findMany: jest.fn().mockResolvedValue(rules) },
    };
    return new PricingService(prisma as never);
  }

  it('multi-city both-method Case Search: serviceCost === total (full multiplied amount)', async () => {
    const service = buildService([searchRule]);
    const result = await service.resolve({
      flow: 'judicial_case_search',
      courtLevel: 'lower',
      region: 'Punjab',
      cityCount: 3,
      searchMethod: 'both',
      // no caseYear → 1-year minimum per-city base of Rs 2,000
    } as never);

    expect(result.matched).toBe(true);
    // per-city block = 2,000 base + 1,000 search-both = 3,000; ×3 cities
    expect(result.total).toBe((2000 + SEARCH_BOTH_SURCHARGE) * 3);
    expect(result.serviceCost).toBe(result.total);
  });

  it('single-city single-method Case Search keeps serviceCost === total', async () => {
    const service = buildService([searchRule]);
    const result = await service.resolve({
      flow: 'judicial_case_search',
      courtLevel: 'lower',
      region: 'Punjab',
    } as never);

    expect(result.serviceCost).toBe(2000);
    expect(result.serviceCost).toBe(result.total);
  });

  it('SPLIT flows keep the un-multiplied phase-1 serviceCost (delivery deferred)', async () => {
    const filesRule = {
      ...searchRule,
      id: 'r-files',
      flow: 'judicial_case_files',
      basePrice: 3000,
      deliveryCharge: 500,
    };
    const service = buildService([filesRule]);
    const result = await service.resolve({
      flow: 'judicial_case_files',
      courtLevel: 'lower',
      caseStatus: 'Pending Case',
      region: 'Punjab',
      deliveryMethod: 'delivery_guy',
    } as never);

    // Physical flow: total carries the static delivery charge, serviceCost
    // stays the phase-1 base (delivery is billed in the phase-2 remainder).
    expect(result.serviceCost).toBe(3000);
    expect(result.total).toBe(3000 + 500);
  });
});
