/**
 * Seed the CourtCaseType table from the committed JSON files in
 * apps/api/data/case-types/. Idempotent: wipes the table and re-inserts.
 *
 * Run: cd apps/api && pnpm exec ts-node scripts/seed-case-types.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ScrapedRow = {
  courtLevel: string;
  subCourt?: string | null;
  district?: string | null;
  region?: string | null;
  highCourtCode?: string | null;
  code: string;
  label: string;
  source: string;
  priority?: number;
};

const DATA_DIR = join(__dirname, '..', 'data', 'case-types');

const SOURCES = ['scp.json', 'fcc.json', 'ihc.json', 'shc.json', 'dsj-lahore.json'];

function loadJsonOrEmpty(filename: string): ScrapedRow[] {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function main() {
  // 1. Load all sources.
  const scraped: ScrapedRow[] = [];
  for (const src of SOURCES) {
    const rows = loadJsonOrEmpty(src);
    console.log(`  ${src}: ${rows.length} rows`);
    scraped.push(...rows);
  }
  const hardcoded = loadJsonOrEmpty('hardcoded-snapshot.json').map((row) => ({
    ...row,
    source: 'hardcoded_fallback',
  }));
  console.log(`  hardcoded-snapshot.json: ${hardcoded.length} rows`);

  // 2. Determine which (courtLevel, subCourt, region, highCourtCode) cohorts
  // the scrapers cover. Only fall back to the hardcoded snapshot for cohorts
  // the scrapers DON'T cover.
  const scrapedCohorts = new Set<string>();
  for (const r of scraped) {
    scrapedCohorts.add(
      `${r.courtLevel}|${r.subCourt ?? ''}|${r.region ?? ''}|${r.highCourtCode ?? ''}`,
    );
  }
  const fallbacks = hardcoded.filter((r) => {
    const key = `${r.courtLevel}|${r.subCourt ?? ''}|${r.region ?? ''}|${r.highCourtCode ?? ''}`;
    return !scrapedCohorts.has(key);
  });
  console.log(`  → ${fallbacks.length} fallback rows after cohort de-dup`);

  // 3. Append "Other" rows for every distinct cohort represented.
  const allRows = [...scraped, ...fallbacks];
  const cohorts = new Set<string>();
  for (const r of allRows) {
    cohorts.add(
      `${r.courtLevel}|${r.subCourt ?? ''}|${r.region ?? ''}|${r.highCourtCode ?? ''}`,
    );
  }
  const otherRows: ScrapedRow[] = [];
  for (const cohort of cohorts) {
    const parts = cohort.split('|');
    const courtLevel = parts[0] ?? '';
    const subCourt = parts[1] ?? '';
    const region = parts[2] ?? '';
    const highCourtCode = parts[3] ?? '';
    otherRows.push({
      courtLevel,
      subCourt: subCourt || null,
      district: null,
      region: region || null,
      highCourtCode: highCourtCode || null,
      code: 'OTHER',
      label: 'Other',
      source: 'manual',
      priority: -1,
    });
  }
  console.log(`  + ${otherRows.length} "Other" rows`);

  // 4. Wipe + insert in a transaction.
  await prisma.$transaction(
    async (tx) => {
      await tx.courtCaseType.deleteMany({});
    const final = [...allRows, ...otherRows];
    await tx.courtCaseType.createMany({
      data: final.map((r) => ({
        courtLevel: r.courtLevel,
        subCourt: r.subCourt ?? null,
        district: r.district ?? null,
        region: r.region ?? null,
        highCourtCode: r.highCourtCode ?? null,
        code: r.code,
        label: r.label,
        source: r.source,
        priority: r.priority ?? 0,
      })),
      skipDuplicates: true,
    });
      const count = await tx.courtCaseType.count();
      console.log(`Seeded ${count} CourtCaseType rows.`);
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
