import { jest } from '@jest/globals';
import { NON_JUDICIAL_BASE_RATES } from './pricing.service';
import { PricingService } from './pricing.service';

// Owner rates 2026-06-12: the three non-judicial copy services had NO pricing
// rules (created free, audit 1.4). Copy of FIR = Rs 2,000, Registry/Deed =
// Rs 3,500 (flat, region-agnostic). seed-pricing.ts injects them as rules
// with null courtLevel/region/yearBand/setType. These tests pin the rates and
// prove that rule shape resolves for a non-judicial payload.
function nonJudicialRule(flow: string, basePrice: number) {
  return {
    id: `r-${flow}`,
    isActive: true,
    isLegacy: true, // production default pricingMode is 'legacy'
    flow,
    courtLevel: null,
    caseStatus: null,
    region: null,
    yearBand: null,
    yearFrom: null,
    yearTo: null,
    setType: null,
    basePrice,
    availability: true,
    pdfSurchargeAmount: 300,
    deliveryGuyFee: 100,
    deliveryCharge: 0,
    clerkBaseCost: null,
    priority: 0,
  };
}

function buildService(rules: Record<string, unknown>[]) {
  const prisma = {
    pricingSettings: {
      upsert: jest.fn().mockResolvedValue({
        pricingMode: 'legacy',
        attestedPricePerSet: 0,
        nonAttestedPricePerSet: 0,
      }),
    },
    pricingRule: { findMany: jest.fn().mockResolvedValue(rules) },
    // Registry/Deed passes only a city name (no province) → region derivation
    // falls through to a GeoCity lookup. Returning null leaves region
    // undefined, which the region-agnostic (region: null) rule still matches.
    geoCity: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return new PricingService(prisma as never);
}

const seededRules = Object.entries(NON_JUDICIAL_BASE_RATES).map(
  ([flow, base]) => nonJudicialRule(flow, base),
);

describe('non-judicial base-fee pricing (owner rates 2026-06-12)', () => {
  it('pins the owner-provided flat rates', () => {
    expect(NON_JUDICIAL_BASE_RATES.non_judicial_copy_of_fir).toBe(2000);
    expect(NON_JUDICIAL_BASE_RATES.non_judicial_registry_deed).toBe(3500);
    expect(NON_JUDICIAL_BASE_RATES.non_judicial_criminal_record_search).toBe(
      2000,
    );
  });

  it('Copy of FIR resolves to Rs 2,000 (SPLIT → serviceCost = base)', async () => {
    const svc = buildService(seededRules);
    const r = await svc.resolve({
      flow: 'non_judicial_copy_of_fir',
      province: 'Sindh',
      city: 'Karachi',
    } as never);
    expect(r.matched).toBe(true);
    expect(r.available).toBe(true);
    expect(r.serviceCost).toBe(2000);
  });

  it('Registry/Deed resolves to Rs 3,500', async () => {
    const svc = buildService(seededRules);
    const r = await svc.resolve({
      flow: 'non_judicial_registry_deed',
      city: 'Lahore',
    } as never);
    expect(r.matched).toBe(true);
    expect(r.serviceCost).toBe(3500);
  });

  it('is region-agnostic — Punjab resolves the same flat rate', async () => {
    const svc = buildService(seededRules);
    const r = await svc.resolve({
      flow: 'non_judicial_copy_of_fir',
      province: 'Punjab',
      city: 'Lahore',
    } as never);
    expect(r.serviceCost).toBe(2000);
  });

  it('matches even when an FIR year derives a historical band (yearBand=null rule)', async () => {
    const svc = buildService(seededRules);
    const r = await svc.resolve({
      flow: 'non_judicial_copy_of_fir',
      caseYear: 2014,
      province: 'Sindh',
    } as never);
    // No Decided status → no age surcharge; base only.
    expect(r.matched).toBe(true);
    expect(r.serviceCost).toBe(2000);
  });

  it('Criminal Record Search resolves to Rs 2,000 (matches Copy of FIR)', async () => {
    const svc = buildService(seededRules);
    const r = await svc.resolve({
      flow: 'non_judicial_criminal_record_search',
      province: 'Punjab',
    } as never);
    expect(r.matched).toBe(true);
    expect(r.available).toBe(true);
    expect(r.serviceCost).toBe(2000);
  });

  it('a genuinely unpriced flow still fails loud (rulesExistForFlow=false)', async () => {
    const svc = buildService(seededRules);
    const r = await svc.resolve({
      flow: 'non_judicial_unknown_future_service',
      province: 'Punjab',
    } as never);
    expect(r.matched).toBe(false);
    expect(r.rulesExistForFlow).toBe(false);
  });
});
