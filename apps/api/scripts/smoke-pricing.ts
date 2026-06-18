/**
 * Smoke test the resolver via direct DB access (bypasses HTTP layer).
 * Run: cd apps/api && npx tsx scripts/smoke-pricing.ts
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { PricingService } from '../src/pricing/pricing.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const svc = new PricingService(prisma);

  const cases: { label: string; body: any; expectAvailability?: boolean; expectTotal?: number }[] = [
    {
      label: 'Punjab + Lower + Case Files + Pending + Attested',
      body: { flow: 'judicial_case_files', courtLevel: 'Lower Court', region: 'Punjab', yearBand: 'pending', setType: 'attested' },
      expectAvailability: true,
      expectTotal: 500,
    },
    {
      label: 'Punjab + Supreme + Case Files + 2022-2020 + Both',
      body: { flow: 'judicial_case_files', courtLevel: 'Supreme Court', region: 'Punjab', yearBand: 'y2022_2020', setType: 'both' },
      expectAvailability: true,
      expectTotal: 24500,
    },
    {
      label: 'Other + High + Case Filing (no setType, current)',
      body: { flow: 'judicial_case_filing', courtLevel: 'High Court', region: 'other' },
      expectAvailability: true,
      expectTotal: 4000,
    },
    {
      label: "Punjab + Lower + Case Files + 2025 + Non-Attested (Can't Get)",
      body: { flow: 'judicial_case_files', courtLevel: 'Lower Court', region: 'Punjab', yearBand: 'y2025', setType: 'non_attested' },
      expectAvailability: false,
    },
    {
      label: 'Punjab + Lower + Case Files + Pending + Attested + PDF + TCS delivery',
      body: { flow: 'judicial_case_files', courtLevel: 'Lower Court', region: 'Punjab', yearBand: 'pending', setType: 'attested', wantPdf: true, deliveryMethod: 'tcs' },
      expectAvailability: true,
      expectTotal: 900,
    },
    {
      // 5-14-26 addendum: decided Case Files (year-banded) must now resolve
      // against svc_judicial_case_files rules (previously these rows lived on
      // svc_judicial_case_record). No setType — exercises the headline band
      // path, not the Sheet 2 set-type matrix.
      label: 'Punjab + Lower + Case Files + 2022-2020 (decided band, no setType)',
      body: { flow: 'judicial_case_files', courtLevel: 'Lower Court', region: 'Punjab', yearBand: 'y2022_2020' },
      expectAvailability: true,
    },
    {
      // Owner rates 2026-06-12: non-judicial copies are flat, region-agnostic.
      // No delivery method passed → total == base == serviceCost.
      label: 'Non-judicial Copy of FIR (flat Rs 2,000)',
      body: { flow: 'non_judicial_copy_of_fir', province: 'Punjab', city: 'Lahore' },
      expectAvailability: true,
      expectTotal: 2000,
    },
    {
      label: 'Non-judicial Registry/Deed (flat Rs 3,500)',
      body: { flow: 'non_judicial_registry_deed', province: 'Sindh', city: 'Karachi' },
      expectAvailability: true,
      expectTotal: 3500,
    },
    {
      label: 'Non-judicial Criminal Record Search (flat Rs 2,000)',
      body: { flow: 'non_judicial_criminal_record_search', province: 'Punjab', city: 'Lahore' },
      expectAvailability: true,
      expectTotal: 2000,
    },
  ];

  // Audit 6.3: this smoke test used to assert almost nothing on positive
  // cases and ALWAYS exit 0 — useless as a gate. Positive cases must match
  // AND be available; any FAIL exits 1.
  let failures = 0;
  for (const c of cases) {
    const r = await svc.resolve(c.body);
    const ok =
      (c.expectAvailability === false
        ? r.matched === true && r.available === false
        : r.matched === true && r.available === true) &&
      (c.expectTotal != null ? r.total === c.expectTotal : true);
    if (!ok) failures++;
    console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${c.label}`);
    console.log(JSON.stringify(r, null, 2));
  }

  await prisma.$disconnect();

  if (failures > 0) {
    console.error(`\n${failures} smoke case(s) FAILED.`);
    process.exit(1);
  }
  console.log(`\nAll ${cases.length} smoke cases passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
