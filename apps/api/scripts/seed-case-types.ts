/**
 * Seed the CourtCaseType table from the committed JSON files in
 * apps/api/data/case-types/. Idempotent: wipes the table and re-inserts.
 *
 * Run: cd apps/api && pnpm exec ts-node scripts/seed-case-types.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { inferDsjSubCourts } from './scrape-case-types/dsj-subcourt-map';

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

const SOURCES = [
  'scp.json',
  'fcc.json',
  'ihc.json',
  'shc.json',
  'dsj-lahore.json',
  'lhc.json',
  'phc.json',
  'bhc.json',
];

function loadJsonOrEmpty(filename: string): ScrapedRow[] {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Expand DSJ Lahore rows with subcourt tags inferred from the case-type
 * label. The DSJ form ships a flat 83-entry vocabulary shared across all
 * districts and never categorizes by subcourt; we map labels to one or more
 * of (Sessions/Civil/Magisterial/Family) via `inferDsjSubCourts` so the
 * wizard's subcourt-specific picker has real choices instead of falling back
 * to the ~50-row hardcoded snapshot.
 *
 * Rows the mapping can't classify (e.g. "Labour Cases") are kept with
 * subCourt=null so they remain visible in the "all Lower Court" view.
 */
function expandDsjBySubCourt(rows: ScrapedRow[]): ScrapedRow[] {
  const out: ScrapedRow[] = [];
  for (const r of rows) {
    if (
      r.courtLevel === 'Lower Court' &&
      !r.subCourt &&
      r.source === 'dsjlahore.punjab.gov.pk'
    ) {
      const subs = inferDsjSubCourts(r.label);
      if (subs.length === 0) {
        out.push(r);
      } else {
        for (const sub of subs) {
          out.push({ ...r, subCourt: sub });
        }
      }
    } else {
      out.push(r);
    }
  }
  return out;
}

async function main() {
  // 1. Load all sources.
  const scrapedRaw: ScrapedRow[] = [];
  for (const src of SOURCES) {
    const rows = loadJsonOrEmpty(src);
    console.log(`  ${src}: ${rows.length} rows`);
    scrapedRaw.push(...rows);
  }
  const scraped = expandDsjBySubCourt(scrapedRaw);
  const expansionDelta = scraped.length - scrapedRaw.length;
  if (expansionDelta) {
    console.log(`  → DSJ subcourt expansion: +${expansionDelta} rows`);
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
