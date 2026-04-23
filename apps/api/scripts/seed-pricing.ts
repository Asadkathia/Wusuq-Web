/**
 * Seed all legacy pricing rules.
 * Run with: cd apps/api && npx tsx scripts/seed-pricing.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type RuleInput = {
  name: string;
  flow: string;
  courtLevel: string;
  region: string;
  yearFrom: number | null;
  yearTo: number | null;
  basePrice: number;
  priority: number;
};

const COMMON = {
  isLegacy: true,
  isActive: true,
  attestedPricePerSet: 0,
  nonAttestedPricePerSet: 0,
  deliveryCharge: 0,
  setType: null as null,
  caseStatus: null as null,
};

const COURT_LEVELS = ['Lower Court', 'Special Court', 'High Court', 'Federal Shariat Court', 'Supreme Court'];

// ── Flow label mapping ────────────────────────────────────────────────────────
const FLOW_LABELS: Record<string, string> = {
  judicial_case_files: 'Case Files',
  judicial_case_information: 'Case Info',
  judicial_case_record: 'Case Record',
  judicial_case_search: 'Case Search',
  judicial_case_filing: 'Case Filing',
  judicial_power_of_attorney: 'POA Filing',
};

function ruleName(flow: string, courtLevel: string, region: string, yearBand?: string): string {
  const label = FLOW_LABELS[flow] ?? flow;
  const parts = [label, courtLevel, region];
  if (yearBand) parts.push(yearBand);
  return parts.join(' – ');
}

// ── FLAT RULES (no year range, priority = 0) ─────────────────────────────────

type FlatEntry = { flow: string; courtLevel: string; punjab: number; other: number };

const FLAT_ENTRIES: FlatEntry[] = [
  // judicial_case_files
  { flow: 'judicial_case_files', courtLevel: 'Lower Court',           punjab: 500,  other: 2000 },
  { flow: 'judicial_case_files', courtLevel: 'Special Court',         punjab: 3000, other: 4000 },
  { flow: 'judicial_case_files', courtLevel: 'High Court',            punjab: 1000, other: 2500 },
  { flow: 'judicial_case_files', courtLevel: 'Federal Shariat Court', punjab: 1000, other: 2500 },
  { flow: 'judicial_case_files', courtLevel: 'Supreme Court',         punjab: 3000, other: 4000 },
  // judicial_case_information
  { flow: 'judicial_case_information', courtLevel: 'Lower Court',           punjab: 350,  other: 750  },
  { flow: 'judicial_case_information', courtLevel: 'Special Court',         punjab: 900,  other: 1500 },
  { flow: 'judicial_case_information', courtLevel: 'High Court',            punjab: 700,  other: 1100 },
  { flow: 'judicial_case_information', courtLevel: 'Federal Shariat Court', punjab: 700,  other: 1100 },
  { flow: 'judicial_case_information', courtLevel: 'Supreme Court',         punjab: 1000, other: 1500 },
  // judicial_case_search
  { flow: 'judicial_case_search', courtLevel: 'Lower Court',           punjab: 2000, other: 2000 },
  { flow: 'judicial_case_search', courtLevel: 'Special Court',         punjab: 2000, other: 2000 },
  { flow: 'judicial_case_search', courtLevel: 'High Court',            punjab: 2000, other: 2000 },
  { flow: 'judicial_case_search', courtLevel: 'Federal Shariat Court', punjab: 2000, other: 2000 },
  { flow: 'judicial_case_search', courtLevel: 'Supreme Court',         punjab: 2000, other: 2000 },
  // judicial_case_filing
  { flow: 'judicial_case_filing', courtLevel: 'Lower Court',           punjab: 2500, other: 3000 },
  { flow: 'judicial_case_filing', courtLevel: 'Special Court',         punjab: 4000, other: 5000 },
  { flow: 'judicial_case_filing', courtLevel: 'High Court',            punjab: 3500, other: 4000 },
  { flow: 'judicial_case_filing', courtLevel: 'Federal Shariat Court', punjab: 3500, other: 4000 },
  { flow: 'judicial_case_filing', courtLevel: 'Supreme Court',         punjab: 5000, other: 6000 },
  // judicial_power_of_attorney
  { flow: 'judicial_power_of_attorney', courtLevel: 'Lower Court',           punjab: 1500, other: 2500 },
  { flow: 'judicial_power_of_attorney', courtLevel: 'Special Court',         punjab: 3000, other: 4000 },
  { flow: 'judicial_power_of_attorney', courtLevel: 'High Court',            punjab: 3500, other: 4500 },
  { flow: 'judicial_power_of_attorney', courtLevel: 'Federal Shariat Court', punjab: 3500, other: 4500 },
  { flow: 'judicial_power_of_attorney', courtLevel: 'Supreme Court',         punjab: 5000, other: 6000 },
];

const flatRules: RuleInput[] = [];
for (const e of FLAT_ENTRIES) {
  flatRules.push({
    name: ruleName(e.flow, e.courtLevel, 'Punjab'),
    flow: e.flow,
    courtLevel: e.courtLevel,
    region: 'Punjab',
    yearFrom: null,
    yearTo: null,
    basePrice: e.punjab,
    priority: 0,
  });
  flatRules.push({
    name: ruleName(e.flow, e.courtLevel, 'other'),
    flow: e.flow,
    courtLevel: e.courtLevel,
    region: 'other',
    yearFrom: null,
    yearTo: null,
    basePrice: e.other,
    priority: 0,
  });
}

// ── CASE RECORD RULES ────────────────────────────────────────────────────────

type RecordBand = {
  yearFrom: number | null;
  yearTo: number | null;
  label: string;
  priority: number;
  punjab: Record<string, number>;
  other: Record<string, number>;
};

const RECORD_BANDS: RecordBand[] = [
  {
    yearFrom: 2026, yearTo: null, label: '2026+', priority: 10,
    punjab: { 'Lower Court': 1500, 'Special Court': 4000, 'High Court': 2000, 'Federal Shariat Court': 2000, 'Supreme Court': 4000 },
    other:  { 'Lower Court': 2500, 'Special Court': 5000, 'High Court': 3500, 'Federal Shariat Court': 3500, 'Supreme Court': 5000 },
  },
  {
    yearFrom: 2025, yearTo: 2025, label: '2025', priority: 5,
    punjab: { 'Lower Court': 3000, 'Special Court': 5500, 'High Court': 3500, 'Federal Shariat Court': 3500, 'Supreme Court': 4500 },
    other:  { 'Lower Court': 4500, 'Special Court': 7000, 'High Court': 5000, 'Federal Shariat Court': 5000, 'Supreme Court': 6000 },
  },
  {
    yearFrom: 2023, yearTo: 2024, label: '2024-2023', priority: 5,
    punjab: { 'Lower Court': 5000, 'Special Court': 7000, 'High Court': 6000, 'Federal Shariat Court': 6000, 'Supreme Court': 7500 },
    other:  { 'Lower Court': 7500, 'Special Court': 9500, 'High Court': 8500, 'Federal Shariat Court': 8500, 'Supreme Court': 9000 },
  },
  {
    yearFrom: 2020, yearTo: 2022, label: '2022-2020', priority: 5,
    punjab: { 'Lower Court': 7500, 'Special Court': 9500, 'High Court': 8500, 'Federal Shariat Court': 8500, 'Supreme Court': 9500 },
    other:  { 'Lower Court': 9500, 'Special Court': 11500, 'High Court': 10500, 'Federal Shariat Court': 10500, 'Supreme Court': 11000 },
  },
  {
    yearFrom: 2017, yearTo: 2019, label: '2019-2017', priority: 5,
    punjab: { 'Lower Court': 9500, 'Special Court': 12000, 'High Court': 10500, 'Federal Shariat Court': 10500, 'Supreme Court': 11000 },
    other:  { 'Lower Court': 12000, 'Special Court': 14000, 'High Court': 13000, 'Federal Shariat Court': 13000, 'Supreme Court': 13500 },
  },
  {
    yearFrom: null, yearTo: 2016, label: '2016-backward', priority: 5,
    punjab: { 'Lower Court': 12000, 'Special Court': 15000, 'High Court': 12000, 'Federal Shariat Court': 12000, 'Supreme Court': 13000 },
    other:  { 'Lower Court': 15000, 'Special Court': 17000, 'High Court': 15000, 'Federal Shariat Court': 15000, 'Supreme Court': 15000 },
  },
];

const recordRules: RuleInput[] = [];
for (const band of RECORD_BANDS) {
  for (const court of COURT_LEVELS) {
    recordRules.push({
      name: ruleName('judicial_case_record', court, 'Punjab', band.label),
      flow: 'judicial_case_record',
      courtLevel: court,
      region: 'Punjab',
      yearFrom: band.yearFrom,
      yearTo: band.yearTo,
      basePrice: band.punjab[court]!,
      priority: band.priority,
    });
    recordRules.push({
      name: ruleName('judicial_case_record', court, 'other', band.label),
      flow: 'judicial_case_record',
      courtLevel: court,
      region: 'other',
      yearFrom: band.yearFrom,
      yearTo: band.yearTo,
      basePrice: band.other[court]!,
      priority: band.priority,
    });
  }
}

const ALL_RULES: RuleInput[] = [...flatRules, ...recordRules];

async function main() {
  console.log('Deleting existing legacy pricing rules...');
  const deleted = await prisma.pricingRule.deleteMany({ where: { isLegacy: true } });
  console.log(`Deleted ${deleted.count} legacy rules.`);

  console.log(`Inserting ${ALL_RULES.length} legacy rules...`);
  let inserted = 0;
  for (const rule of ALL_RULES) {
    await prisma.pricingRule.create({
      data: {
        name: rule.name,
        flow: rule.flow,
        courtLevel: rule.courtLevel,
        region: rule.region,
        yearFrom: rule.yearFrom,
        yearTo: rule.yearTo,
        basePrice: rule.basePrice,
        priority: rule.priority,
        ...COMMON,
      },
    });
    inserted++;
  }
  console.log(`Done. Inserted ${inserted} rules.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
