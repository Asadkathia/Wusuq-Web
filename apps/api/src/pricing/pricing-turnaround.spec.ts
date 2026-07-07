import { jest } from '@jest/globals';
import { PricingService } from './pricing.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';

// C16: PricingRule.turnaroundLabel is a free-text field persisted via
// create/update and surfaced to consumers at checkout through resolve().
// This spec drives the real create() (verifying persistence) and then
// resolve() (verifying the matched rule's label — or null when absent —
// flows through to the resolver's result), using the same mocked-Prisma
// harness as pricing-resolve.spec.ts.
describe('PricingService — turnaroundLabel persistence + resolve', () => {
  const baseRuleFields = {
    isActive: true,
    isLegacy: false,
    flow: 'judicial_case_files',
    courtLevel: 'lower',
    caseStatus: null,
    region: 'Punjab',
    yearBand: 'current',
    yearFrom: null,
    yearTo: null,
    setType: null,
    basePrice: 5000,
    priority: 0,
    availability: true,
    pdfSurchargeAmount: 0,
    deliveryGuyFee: 0,
    deliveryCharge: 0,
    clerkBaseCost: null,
  };

  function buildService(rules: Record<string, unknown>[]) {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      pricingSettings: {
        upsert: jest.fn().mockResolvedValue({
          pricingMode: 'custom',
          attestedPricePerSet: 0,
          nonAttestedPricePerSet: 0,
        }),
      },
      pricingRule: {
        findMany: jest.fn().mockResolvedValue(rules),
        create: jest.fn().mockImplementation((args: unknown) => {
          const { data } = args as { data: Record<string, unknown> };
          const row = { id: 'r-new', ...data };
          created.push(row);
          return Promise.resolve(row);
        }),
      },
    };
    return { service: new PricingService(prisma as never), prisma, created };
  }

  it('create() persists the supplied turnaroundLabel onto the Prisma data payload', async () => {
    const { service, prisma } = buildService([]);
    const dto: CreatePricingRuleDto = {
      name: 'Lower Court Case Files',
      flow: 'judicial_case_files',
      courtLevel: 'lower',
      region: 'Punjab',
      basePrice: 5000,
      attestedPricePerSet: 0,
      nonAttestedPricePerSet: 0,
      deliveryCharge: 0,
      priority: 0,
      turnaroundLabel: '3–5 working days',
    };

    await service.create(dto);

    expect(prisma.pricingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          turnaroundLabel: '3–5 working days',
        }),
      }),
    );
  });

  it('create() persists null when no turnaroundLabel is supplied', async () => {
    const { service, prisma } = buildService([]);
    const dto: CreatePricingRuleDto = {
      name: 'Lower Court Case Files',
      flow: 'judicial_case_files',
      courtLevel: 'lower',
      region: 'Punjab',
      basePrice: 5000,
      attestedPricePerSet: 0,
      nonAttestedPricePerSet: 0,
      deliveryCharge: 0,
      priority: 0,
    };

    await service.create(dto);

    expect(prisma.pricingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ turnaroundLabel: null }),
      }),
    );
  });

  it('resolve() returns the matched rule turnaroundLabel', async () => {
    const rule = {
      ...baseRuleFields,
      id: 'r-labeled',
      turnaroundLabel: '3–5 working days',
    };
    const { service } = buildService([rule]);

    const result = await service.resolve({
      flow: 'judicial_case_files',
      courtLevel: 'lower',
      region: 'Punjab',
    } as never);

    expect(result.matched).toBe(true);
    expect(result.ruleId).toBe('r-labeled');
    expect(result.turnaroundLabel).toBe('3–5 working days');
  });

  it('resolve() returns turnaroundLabel: null for a rule without a label', async () => {
    const rule = {
      ...baseRuleFields,
      id: 'r-unlabeled',
      turnaroundLabel: null,
    };
    const { service } = buildService([rule]);

    const result = await service.resolve({
      flow: 'judicial_case_files',
      courtLevel: 'lower',
      region: 'Punjab',
    } as never);

    expect(result.matched).toBe(true);
    expect(result.ruleId).toBe('r-unlabeled');
    expect(result.turnaroundLabel).toBeNull();
  });

  it('resolve() returns turnaroundLabel: null when nothing matches', async () => {
    const { service } = buildService([]);

    const result = await service.resolve({
      flow: 'judicial_case_files',
      courtLevel: 'lower',
      region: 'Punjab',
    } as never);

    expect(result.matched).toBe(false);
    expect(result.turnaroundLabel).toBeNull();
  });
});
