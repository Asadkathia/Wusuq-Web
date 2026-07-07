/**
 * No-DB verification of the `seed-pricing.ts` xlsx parser.
 *
 * Run with: cd apps/api && npx tsx scripts/verify-pricing-parse.ts
 *
 * Exercises `buildJudicialRuleRows()` against the current
 * `data/pricing-sheet.xlsx` and asserts:
 *  (a) every parse block contributed drafts (enforced inline by
 *      `expectContribution` inside `buildJudicialRuleRows` — a 0-contribution
 *      block process.exit(1)s before we even get here);
 *  (b) the total unique-row count clears the seed's own MIN_TOTAL_DRAFTS
 *      floor (also enforced inline);
 *  (c) a handful of KNOWN cells from the current xlsx resolve to the right
 *      drafts, catching a coordinate that's merely off-by-a-row/col rather
 *      than fully broken (which (a)/(b) alone wouldn't catch).
 *
 * Does NOT touch Postgres — never calls PrismaClient / seed-pricing's main().
 */
import { buildJudicialRuleRows, type PricingRuleRow } from './seed-pricing';

type Expectation = {
  label: string;
  flow: string;
  courtLevel: string;
  region: 'Punjab' | 'other';
  yearBand: string;
  setType: 'attested' | 'non_attested' | 'both' | null;
  basePrice: number;
  clerkBaseCost: number | null;
};

// Values transcribed directly from apps/api/data/pricing-sheet.xlsx
// ("Wusuq Service Rates & Clerk Rat" sheet) — see the task's known-cell list
// plus a couple of extra assertions on the specific blocks that were broken
// (case-record bands, case-search bands), not just the headline table (which
// happened to still be correct pre-fix for these particular tiers).
const EXPECTATIONS: Expectation[] = [
  {
    label: 'Punjab CASE FILES High Court (headline, pending band)',
    flow: 'judicial_case_files',
    courtLevel: 'High Court',
    region: 'Punjab',
    yearBand: 'pending',
    setType: null,
    basePrice: 1000,
    clerkBaseCost: 700,
  },
  {
    label: 'Punjab CASE INFORMATION High Court (headline)',
    flow: 'judicial_case_information',
    courtLevel: 'High Court',
    region: 'Punjab',
    yearBand: 'current',
    setType: null,
    basePrice: 700,
    clerkBaseCost: 400,
  },
  {
    label: 'Punjab CASE INFORMATION Lower Court (headline)',
    flow: 'judicial_case_information',
    courtLevel: 'Lower Court',
    region: 'Punjab',
    yearBand: 'current',
    setType: null,
    basePrice: 350,
    clerkBaseCost: 200,
  },
  {
    label: 'Punjab CASE FILES Lower Court (headline, pending band)',
    flow: 'judicial_case_files',
    courtLevel: 'Lower Court',
    region: 'Punjab',
    yearBand: 'pending',
    setType: null,
    basePrice: 500,
    clerkBaseCost: 400,
  },
  // The two blocks that were actually broken (0-draft abort) pre-fix:
  {
    label: 'Punjab CASE RECORD band → judicial_case_files, High Court, 2025',
    flow: 'judicial_case_files',
    courtLevel: 'High Court',
    region: 'Punjab',
    yearBand: 'y2025',
    setType: null,
    basePrice: 3500,
    clerkBaseCost: 700,
  },
  {
    label: 'Other CASE RECORD band → judicial_case_files, High Court, 2025',
    flow: 'judicial_case_files',
    courtLevel: 'High Court',
    region: 'other',
    yearBand: 'y2025',
    setType: null,
    basePrice: 5000,
    clerkBaseCost: 1000,
  },
  {
    label: "Punjab CASE SEARCH band → High Court, '2023-2022' mapped to y2024_2023",
    flow: 'judicial_case_search',
    courtLevel: 'High Court',
    region: 'Punjab',
    yearBand: 'y2024_2023',
    setType: null,
    basePrice: 2500,
    clerkBaseCost: 500,
  },
  {
    label: "Other CASE SEARCH band → High Court, '2019' mapped to y2019_2017",
    flow: 'judicial_case_search',
    courtLevel: 'High Court',
    region: 'other',
    yearBand: 'y2019_2017',
    setType: null,
    basePrice: 4000,
    clerkBaseCost: 500,
  },
  // Sheet 2 / Sheet 5 set-type matrix (was already correctly aligned; assert
  // it stays that way after the refactor).
  {
    label: 'Punjab set-type matrix: Lower Court, pending, attested',
    flow: 'judicial_case_files',
    courtLevel: 'Lower Court',
    region: 'Punjab',
    yearBand: 'pending',
    setType: 'attested',
    basePrice: 500,
    clerkBaseCost: 500,
  },
  {
    label: 'Other set-type matrix: Lower Court, pending, both',
    flow: 'judicial_case_files',
    courtLevel: 'Lower Court',
    region: 'other',
    yearBand: 'pending',
    setType: 'both',
    basePrice: 3000,
    clerkBaseCost: null, // Sheet5 has no Other-than-Punjab clerk block
  },
];

function findRow(rows: PricingRuleRow[], e: Expectation): PricingRuleRow | undefined {
  return rows.find(
    (r) =>
      r.flow === e.flow &&
      r.courtLevel === e.courtLevel &&
      r.region === e.region &&
      r.yearBand === e.yearBand &&
      r.setType === e.setType,
  );
}

function main() {
  console.log('Running buildJudicialRuleRows() against the current pricing-sheet.xlsx…\n');
  const { rows, totalDrafts, uniqueCount } = buildJudicialRuleRows();
  console.log(`\nTotal raw drafts: ${totalDrafts}, unique rows: ${uniqueCount}\n`);

  let failures = 0;
  for (const e of EXPECTATIONS) {
    const row = findRow(rows, e);
    if (!row) {
      console.error(`FAIL  ${e.label}: no matching row found`);
      failures++;
      continue;
    }
    const priceOk = row.basePrice === e.basePrice;
    const clerkOk = row.clerkBaseCost === e.clerkBaseCost;
    if (priceOk && clerkOk) {
      console.log(`PASS  ${e.label}: basePrice=${row.basePrice}, clerkBaseCost=${row.clerkBaseCost}`);
    } else {
      console.error(
        `FAIL  ${e.label}: expected basePrice=${e.basePrice}/clerkBaseCost=${e.clerkBaseCost}, ` +
          `got basePrice=${row.basePrice}/clerkBaseCost=${row.clerkBaseCost}`,
      );
      failures++;
    }
  }

  console.log(`\n${EXPECTATIONS.length - failures}/${EXPECTATIONS.length} known-cell assertions passed.`);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) FAILED — parser coordinates are still wrong.`);
    process.exit(1);
  }
  console.log('\nAll checks passed. seed-pricing.ts would NOT abort on this xlsx.');
}

main();
