import { jest } from '@jest/globals';
import { PricingService } from './pricing.service';

function stubPrisma(rules: any[]) {
  return {
    pricingRule: { findMany: jest.fn(() => Promise.resolve(rules)) },
  } as any;
}

// USD Case Files, Punjab Lower Court, 2024 band → $50. isLegacy:true so it is
// visible in the live 'legacy' pricing mode (all real rules are isLegacy:true).
const usdCaseFiles2024 = {
  id: 'usd1',
  flow: 'judicial_case_files',
  courtLevel: 'Lower Court',
  region: 'Punjab',
  yearBand: 'y2024_2023',
  setType: null,
  currency: 'USD',
  isLegacy: true,
  isActive: true,
  availability: true,
  priority: 5,
  basePrice: 50,
  pdfSurchargeAmount: 0,
  deliveryGuyFee: 0,
  deliveryCharge: 0,
  clerkBaseCost: null,
  caseStatus: null,
  yearFrom: 2023,
  yearTo: 2024,
};

function makeService(rules: any[]) {
  const svc = new PricingService(stubPrisma(rules));
  jest
    .spyOn(svc as any, 'getSettings')
    .mockResolvedValue({ pricingMode: 'legacy' });
  return svc;
}

describe('resolve() USD flat short-circuit', () => {
  it('returns the cell as an all-inclusive ONE_TIME total with zero surcharges', async () => {
    const svc = makeService([usdCaseFiles2024]);
    const r = await svc.resolve({
      flow: 'judicial_case_files',
      courtLevel: 'Lower Court',
      region: 'Punjab',
      caseStatus: 'Decided Case',
      caseYear: 2024,
      yearBand: 'y2024_2023',
      currency: 'USD',
    } as any);
    expect(r.matched).toBe(true);
    expect(r.available).toBe(true);
    expect(r.basePrice).toBe(50);
    expect(r.serviceCost).toBe(50);
    expect(r.total).toBe(50);
    expect(r.pdfSurcharge).toBe(0);
    expect(r.ageSurcharge).toBe(0);
    expect(r.deliveryCharge).toBe(0);
    expect(r.attestedCharge).toBe(0);
  });

  it('does not match a USD request against a PKR rule', async () => {
    const pkr = {
      ...usdCaseFiles2024,
      id: 'pkr1',
      currency: 'PKR',
      basePrice: 7300,
    };
    const svc = makeService([pkr]);
    const r = await svc.resolve({
      flow: 'judicial_case_files',
      courtLevel: 'Lower Court',
      region: 'Punjab',
      yearBand: 'y2024_2023',
      currency: 'USD',
    } as any);
    expect(r.matched).toBe(false);
  });

  it('still resolves PKR rules for a PKR (default) request', async () => {
    const pkr = {
      ...usdCaseFiles2024,
      id: 'pkr1',
      currency: 'PKR',
      basePrice: 7300,
    };
    const svc = makeService([pkr]);
    const r = await svc.resolve({
      flow: 'judicial_case_files',
      courtLevel: 'Lower Court',
      region: 'Punjab',
      yearBand: 'y2024_2023',
    } as any);
    expect(r.matched).toBe(true);
    expect(r.basePrice).toBe(7300);
  });
});
