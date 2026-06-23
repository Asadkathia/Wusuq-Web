/**
 * USD pricing smoke test — worked examples from the owner list (2026-06-14).
 * Run with: cd apps/api && npx tsx scripts/smoke-usd-pricing.ts
 * Exits 1 on any FAIL.
 */
import { PrismaClient } from '@prisma/client';
import { PricingService } from '../src/pricing/pricing.service';

const prisma = new PrismaClient();

const CASES = [
  {
    label: 'Punjab Lower Case Files 2024 -> $50',
    input: {
      flow: 'judicial_case_files',
      courtLevel: 'Lower Court',
      region: 'Punjab',
      caseStatus: 'Decided Case',
      caseYear: 2024,
      yearBand: 'y2024_2023',
      currency: 'USD',
    },
    expect: 50,
  },
  {
    label: 'other Special Case Info -> $20',
    input: {
      flow: 'judicial_case_information',
      courtLevel: 'Special Court',
      region: 'other',
      currency: 'USD',
    },
    expect: 20,
  },
  {
    label: 'Punjab High Case Search -> $20',
    input: {
      flow: 'judicial_case_search',
      courtLevel: 'High Court',
      region: 'Punjab',
      currency: 'USD',
    },
    expect: 20,
  },
  {
    label: 'Punjab Lower Case Files pending -> $15',
    input: {
      flow: 'judicial_case_files',
      courtLevel: 'Lower Court',
      region: 'Punjab',
      caseStatus: 'Pending Case',
      yearBand: 'pending',
      currency: 'USD',
    },
    expect: 15,
  },
  {
    label: 'other Supreme Case Files 2016-back -> $105',
    input: {
      flow: 'judicial_case_files',
      courtLevel: 'Supreme Court',
      region: 'other',
      caseStatus: 'Decided Case',
      caseYear: 2010,
      yearBand: 'y2016_back',
      currency: 'USD',
    },
    expect: 105,
  },
];

async function main() {
  const svc = new PricingService(prisma as never);
  let fail = 0;
  for (const c of CASES) {
    const r = await svc.resolve(c.input as never);
    const ok = r.matched && r.available !== false && r.total === c.expect;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${c.label} (matched=${r.matched} total=${r.total})`,
    );
    if (!ok) fail++;
  }
  if (fail) {
    console.error(`${fail} USD smoke case(s) failed.`);
    process.exit(1);
  }
  console.log('All USD smoke cases passed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
