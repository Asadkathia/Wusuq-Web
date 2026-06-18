/**
 * Seed the non-judicial physical-document copy base rates (Copy of FIR,
 * Registry/Deed, Criminal Record Search) into PricingRule.
 *
 * Run with: cd apps/api && npx tsx scripts/seed-non-judicial-pricing.ts
 *
 * WHY A SEPARATE SCRIPT (2026-06-12). These flat, region-agnostic rates live
 * in `NON_JUDICIAL_BASE_RATES` (@wusuq/shared), NOT in `pricing-sheet.xlsx` —
 * the xlsx grid is judicial court-tier shaped. `seed-pricing.ts` also injects
 * them during a FULL rebuild, but the committed `pricing-sheet.xlsx` no longer
 * matches that script's hard-coded cell coordinates (the live 300 judicial
 * rules were seeded from a different sheet version), so a full reseed safely
 * aborts on the count-floor guard rather than wiping good rules. This script
 * is the surgical, idempotent path: it touches ONLY the non-judicial flows,
 * leaving every judicial rule untouched. Re-runnable any time.
 *
 * Idempotent: deletes existing rows for the non-judicial flows, then
 * re-inserts the canonical set, in one transaction.
 */
import { PrismaClient } from '@prisma/client';
import {
  NON_JUDICIAL_BASE_RATES,
  buildNonJudicialPricingRows,
} from '@wusuq/shared';

const prisma = new PrismaClient();

async function main() {
  const flows = Object.keys(NON_JUDICIAL_BASE_RATES);
  // Single source for the row shape (shared with seed-pricing.ts's full
  // rebuild) so the surgical and full seeders can never write divergent rows.
  const rows = buildNonJudicialPricingRows();

  const before = await prisma.pricingRule.count({
    where: { flow: { in: flows } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.pricingRule.deleteMany({ where: { flow: { in: flows } } });
    await tx.pricingRule.createMany({ data: rows });
  });

  console.log(
    `Non-judicial pricing seeded: ${before} existing → ${rows.length} rules ` +
      `(${rows.map((r) => `${r.flow}=${r.basePrice}`).join(', ')}).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
