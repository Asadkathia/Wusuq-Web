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
  ];

  for (const c of cases) {
    const r = await svc.resolve(c.body);
    const ok =
      (c.expectAvailability === false ? r.available === false : true) &&
      (c.expectTotal != null ? r.total === c.expectTotal : true);
    console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${c.label}`);
    console.log(JSON.stringify(r, null, 2));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
