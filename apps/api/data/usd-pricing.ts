// USD all-inclusive flat rates (owner list 2026-06-14). Court-tier order:
// [Lower Court, Special Court, High Court, Supreme Court].
//
// These are the international rates: the cell price IS the full total (no
// surcharges, no tax, no promo, ONE_TIME). The pricing resolver short-circuits
// any currency='USD' rule to a flat total — see pricing.service.ts.
//
// Source images: "WhatsApp Image 2026-06-14 at 19.27.47.jpeg" (base rates) and
// "19.27.49.jpeg" (Case Record year bands). Transcribed in the design spec
// Appendix A: DOcs/superpowers/specs/2026-06-23-country-based-pricing-design.md
type Tier4 = [number, number, number, number];
const TIERS = [
  'Lower Court',
  'Special Court',
  'High Court',
  'Supreme Court',
] as const;

export type UsdPricingRow = {
  flow: string;
  courtLevel: string;
  region: 'Punjab' | 'other';
  yearBand: string | null;
  basePrice: number;
};

// Case Files (judicial_case_files) by yearBand. pending = "Case Files",
// current = "Case Record Current Year", y2025.. = decided-year ladder.
const CASE_FILES: Record<'Punjab' | 'other', Record<string, Tier4>> = {
  Punjab: {
    pending: [15, 25, 20, 20],
    current: [25, 35, 30, 30],
    y2025: [35, 45, 40, 40],
    y2024_2023: [50, 60, 50, 50],
    y2022_2020: [65, 70, 65, 65],
    y2019_2017: [80, 85, 80, 80],
    y2016_back: [95, 100, 95, 95],
  },
  other: {
    pending: [20, 30, 25, 25],
    current: [30, 40, 35, 35],
    y2025: [45, 55, 45, 45],
    y2024_2023: [60, 70, 60, 60],
    y2022_2020: [75, 80, 75, 75],
    y2019_2017: [90, 95, 90, 90],
    y2016_back: [105, 110, 105, 105],
  },
};

// Case Info (flat, yearBand=null) and Case Search (flat $20, yearBand=null).
const CASE_INFO: Record<'Punjab' | 'other', Tier4> = {
  Punjab: [7, 12, 10, 10],
  other: [12, 20, 15, 15],
};
const CASE_SEARCH: Record<'Punjab' | 'other', Tier4> = {
  Punjab: [20, 20, 20, 20],
  other: [20, 20, 20, 20],
};

export function buildUsdPricingRows(): UsdPricingRow[] {
  const rows: UsdPricingRow[] = [];
  for (const region of ['Punjab', 'other'] as const) {
    for (const [yearBand, tiers] of Object.entries(CASE_FILES[region])) {
      TIERS.forEach((courtLevel, i) =>
        rows.push({
          flow: 'judicial_case_files',
          courtLevel,
          region,
          yearBand,
          basePrice: tiers[i]!,
        }),
      );
    }
    TIERS.forEach((courtLevel, i) =>
      rows.push({
        flow: 'judicial_case_information',
        courtLevel,
        region,
        yearBand: null,
        basePrice: CASE_INFO[region][i]!,
      }),
    );
    TIERS.forEach((courtLevel, i) =>
      rows.push({
        flow: 'judicial_case_search',
        courtLevel,
        region,
        yearBand: null,
        basePrice: CASE_SEARCH[region][i]!,
      }),
    );
  }
  return rows;
}

// Ready-to-insert PricingRule rows (PrismaClient.pricingRule.createMany shape).
// isLegacy:true so they're visible in the live 'legacy' pricing mode (every
// real rule is isLegacy:true). USD rows match on yearBand, so yearFrom/yearTo
// stay null (the legacy yearFrom/yearTo fallback is never reached for them).
// Shared by seed-pricing.ts (full rebuild) and seed-usd-pricing.ts (USD-only).
export function buildUsdPricingRuleRows() {
  return buildUsdPricingRows().map((d) => ({
    name: `USD ${d.flow} ${d.region} ${d.courtLevel}${d.yearBand ? ' ' + d.yearBand : ''}`,
    flow: d.flow,
    courtLevel: d.courtLevel,
    caseStatus: null,
    region: d.region,
    yearBand: d.yearBand,
    yearFrom: null,
    yearTo: null,
    setType: null,
    currency: 'USD',
    basePrice: d.basePrice,
    availability: true,
    clerkBaseCost: null,
    pdfSurchargeAmount: 0,
    deliveryGuyFee: 0,
    isLegacy: true,
    isActive: true,
    priority: d.yearBand ? 5 : 0,
  }));
}

// Expected count: 2 regions × (7 bands + 1 info + 1 search) × 4 tiers = 72.
export const USD_PRICING_ROW_COUNT = 72;
