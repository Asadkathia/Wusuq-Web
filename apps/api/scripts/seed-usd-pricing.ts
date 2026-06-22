/**
 * Seed the USD all-inclusive flat pricing rules (owner list 2026-06-14).
 *
 * Run with: cd apps/api && npx tsx scripts/seed-usd-pricing.ts
 *
 * USD-ONLY and non-destructive to PKR rules: it wipes and re-inserts only
 * `currency='USD'` rows inside one transaction, leaving every PKR rule intact.
 * (seed-pricing.ts also includes these rows for a full rebuild, but it depends
 * on the xlsx parse; this script is the safe way to (re)seed USD on its own.)
 */
import { PrismaClient } from '@prisma/client';
import {
  buildUsdPricingRuleRows,
  USD_PRICING_ROW_COUNT,
} from '../data/usd-pricing';

const prisma = new PrismaClient();

async function main() {
  const rows = buildUsdPricingRuleRows();
  if (rows.length !== USD_PRICING_ROW_COUNT) {
    console.error(
      `USD rows = ${rows.length}, expected ${USD_PRICING_ROW_COUNT}. Aborting.`,
    );
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    await tx.pricingRule.deleteMany({ where: { currency: 'USD' } });
    await tx.pricingRule.createMany({ data: rows });
  });

  console.log(`Seeded ${rows.length} USD pricing rules (USD-only wipe + insert).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
