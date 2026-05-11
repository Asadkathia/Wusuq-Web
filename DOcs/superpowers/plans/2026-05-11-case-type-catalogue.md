# Case-type catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wizard's hard-coded case-type arrays with a DB-backed catalogue seeded from one-off scrapes of 5 government sites (SCP, FCC, IHC, SHC, DSJ Lahore), with a hardcoded fallback snapshot covering the tiers/regions those scrapers don't reach. The wizard reads case types via a new `GET /case-types` endpoint with a specificity-fallback chain.

**Architecture:** New Prisma model `CourtCaseType` keyed on `(courtLevel, subCourt, district, region, highCourtCode, code)`. Five standalone Playwright scrapers emit committed JSON to `apps/api/data/case-types/`. One-shot snapshot dumps the current wizard hardcoded arrays as a fallback layer. Seed script ingests all JSON + snapshot into the DB. Wizard fetches via a new NestJS module instead of reading in-code constants.

**Tech Stack:** Prisma + Postgres (Neon), NestJS, Next.js, Playwright (for scrapers), TypeScript across all three.

---

## File structure

**API**
- Create: `apps/api/prisma/migrations/20260513000000_court_case_type_catalogue/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (add `CourtCaseType` model)
- Create: `apps/api/data/case-types/.gitkeep` (commit the directory so scraper outputs have a stable home)
- Create: `apps/api/scripts/scrape-case-types/shared.ts` (Playwright bootstrap + JSON writer + count-floor validator)
- Create: `apps/api/scripts/scrape-case-types/scrape-scp.ts`
- Create: `apps/api/scripts/scrape-case-types/scrape-fcc.ts`
- Create: `apps/api/scripts/scrape-case-types/scrape-ihc.ts`
- Create: `apps/api/scripts/scrape-case-types/scrape-shc.ts`
- Create: `apps/api/scripts/scrape-case-types/scrape-dsj-lahore.ts`
- Create: `apps/api/scripts/scrape-case-types/dump-hardcoded.ts` (one-shot snapshot of existing wizard constants)
- Create: `apps/api/scripts/seed-case-types.ts`
- Create: `apps/api/src/case-types/case-types.module.ts`
- Create: `apps/api/src/case-types/case-types.service.ts`
- Create: `apps/api/src/case-types/case-types.controller.ts`
- Create: `apps/api/src/case-types/case-types.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (register CaseTypesModule)
- Modify: `apps/api/package.json` (`playwright` already present as a transitive dep via the workspace; add it to apps/api as a direct dev dep)

**Web**
- Modify: `apps/web/components/intake-wizard.tsx` (delete `SERVICE_CASE_TYPES` + `SUBCOURT_CASE_TYPES`; add API-driven case-type loader; "Other" reveal logic)
- Modify: `apps/web/lib/intake-flows.ts` (add `case_type_other` field on Case Files / Case Information step 2 with `showWhen: { field: 'case_type', value: 'OTHER' }`)

**Shared data**
- Output JSON files at `apps/api/data/case-types/{scp,fcc,ihc,shc,dsj-lahore,hardcoded-snapshot}.json` — committed.

---

## Task 1: Add Prisma model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260513000000_court_case_type_catalogue/migration.sql`

- [ ] **Step 1: Add the `CourtCaseType` model to `schema.prisma`**

Append after the `PricingSettings` model (around line ~400; find a sensible spot near other catalogue-style models):

```prisma
// Per-court case-type catalogue. Seeded from one-off scrapes of 5 government
// sites (SCP, FCC, IHC, SHC, DSJ Lahore) plus a hardcoded fallback snapshot
// covering tiers/regions the PDF doesn't enumerate. The wizard's
// case-type dropdown is sourced from this table via GET /case-types.
model CourtCaseType {
  id            String   @id @default(cuid())
  courtLevel    String
  subCourt      String?
  district      String?
  region        String?
  highCourtCode String?
  code          String
  label         String
  source        String
  priority      Int      @default(0)
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())

  @@unique([courtLevel, subCourt, district, region, highCourtCode, code])
  @@index([courtLevel, subCourt])
}
```

- [ ] **Step 2: Create the migration directory + SQL**

```bash
mkdir -p apps/api/prisma/migrations/20260513000000_court_case_type_catalogue
cat > apps/api/prisma/migrations/20260513000000_court_case_type_catalogue/migration.sql <<'SQL'
-- CreateTable
CREATE TABLE "CourtCaseType" (
    "id" TEXT NOT NULL,
    "courtLevel" TEXT NOT NULL,
    "subCourt" TEXT,
    "district" TEXT,
    "region" TEXT,
    "highCourtCode" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtCaseType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourtCaseType_dimensions_unique"
  ON "CourtCaseType"("courtLevel", "subCourt", "district", "region", "highCourtCode", "code");

-- CreateIndex
CREATE INDEX "CourtCaseType_courtLevel_subCourt_idx"
  ON "CourtCaseType"("courtLevel", "subCourt");
SQL
```

- [ ] **Step 3: Apply the migration + regenerate the Prisma client**

```bash
cd apps/api && npx prisma migrate deploy
```

Expected: `Applying migration '20260513000000_court_case_type_catalogue'` and `All migrations have been successfully applied.`

```bash
cd apps/api && npx prisma generate
```

Expected: `Generated Prisma Client`.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: all three workspaces (`packages/shared`, `apps/api`, `apps/web`) pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260513000000_court_case_type_catalogue/
git commit -m "feat(api): add CourtCaseType catalogue model

Schema + migration for PDF #18/#19/#20/#21b case-type catalogue.
Dimensions: courtLevel, subCourt, district, region, highCourtCode, code.
Seed data and API arrive in subsequent commits."
```

---

## Task 2: Dump hardcoded fallback snapshot

**Files:**
- Create: `apps/api/scripts/scrape-case-types/dump-hardcoded.ts`
- Create: `apps/api/data/case-types/hardcoded-snapshot.json`

- [ ] **Step 1: Create the data directory**

```bash
mkdir -p apps/api/data/case-types
touch apps/api/data/case-types/.gitkeep
```

- [ ] **Step 2: Write the dump script**

`apps/api/scripts/scrape-case-types/dump-hardcoded.ts`:

```ts
/**
 * One-shot script: read the existing SERVICE_CASE_TYPES + SUBCOURT_CASE_TYPES
 * constants from apps/web/components/intake-wizard.tsx and write them to
 * apps/api/data/case-types/hardcoded-snapshot.json. Run once; commit the
 * output; then delete the constants from the wizard in Task 11.
 *
 * Run: pnpm tsx scripts/scrape-case-types/dump-hardcoded.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Inline copy of the wizard constants. These are intentionally duplicated
// here so the script can run without importing TSX files. After running
// once and committing the JSON output, this script is a historical artifact.
const SERVICE_CASE_TYPES: Record<string, string[]> = {
  svc_judicial_lower_court: [
    'Bail Application (S)', 'Criminal Appeal', 'Criminal Misc.', 'Criminal Revision',
    'Hadood Cases (Under Hadood Ordinance)', 'Harrassment', 'Illegal Dispossession Act',
    'Inquiry (S)', 'Money Laundering Act', 'Narcotics Cases (S)', 'Other Cases (S)',
    'Petitions u/s 22-A/22-B Cr.P.C', 'Sessions Cases (Murder)', 'Sessions Cases (Others)',
    'STA Cases', 'Superdari', 'Habeas Corpus', 'Execution Petition (S)',
    'Application for Succession', 'Civil Appeal', 'Civil Case of Summary Nature Involving Evidence',
    'Civil Misc.', 'Civil Revision', 'Civil Suit', 'Commercial Cases', 'Election Petition',
    'Execution Petition (C)', 'Family Cases', 'Guardianship Cases', 'Inquiry (C)',
    'Insolvency Cases', 'Insurance Cases', 'Labour Cases', 'Land Acquisition Cases',
    'Obejcton Petiton', 'Original Suit', 'Other Cases (C)', 'Pauper Cases', 'Rent Cases',
    'Small Clam & Minor Offence', 'Bail Application (M)', 'Ist Class Cases', 'Minor Offences',
    'Narcotics Cases (M)', 'Other Cases (M)', 'Section 30 Case',
  ],
  svc_judicial_special_court: [
    'Pre-Arrest Bail Petition', 'Post-Arrest Bail Petition', 'Trail File', 'Miscellaneous',
  ],
  svc_judicial_high_court: [
    'Writ Petition', 'Criminal Miscellaneous', 'Civil Revision', 'Regular First Appeal',
    'First Appeal Against Order', 'Criminal Appeal', 'Criminal Revision', 'Murder Reference',
    'Petition For Special Leave To Appeal', 'Diary Number', 'Intra Court Appeal',
    'Review Application', 'Civil Suit', 'Labour Appeal', 'Arbitration Petition',
    'Companies Original', 'Execution Petition', 'Human Rights Petition', 'Election Petition',
    'Suo Moto', 'Tax Reference', 'Regular Second Appeal', 'Second Appeal Against Order',
    'Transfer Application', 'Civil Original Suit', 'Execution First Appeal',
    'Petition For Leave To Appear And Defend', 'Execution Second Appeal', 'Tax Appeal',
    'Custom Reference', 'Civil Reference', 'Cm Independent', 'Wealth Tax Appeal',
    'Commercial Appeal', 'Jail Appeal', 'Capital Sentence Reference',
    'Federal Excise & Reference Application', 'Sales Tax Reference', 'Income Tax Reference',
    'Sales Tax Appeal', 'Income Tax Appeal', 'Custom Appeal', 'C.T.R', 'Objection Case',
    'Office Objection', 'Criminal Original', 'Succession Appeal', 'Objection Petition',
    'Cross Objection', 'Secp Appeal', 'Judicial Reference', 'Ogra Application',
    'Consumer Appeal', 'Judicial Service Appeal', 'Auqaf Appeal', 'Election Appeal',
    'Criminal Original Case', 'Civil Miscellaneous Appeals', 'Miscellaneous Petitions',
    'Enforcement Petition', 'Complaint', 'Pre-Arrest Bail Petition', 'Post-Arrest Bail Petition',
  ],
  svc_judicial_federal_shariat: [
    'C.Sh.A.', 'C.Sh.P.', 'C.Sh.R.P.', 'Crl.Sh.A.', 'Crl.Sh.P.', 'Crl.Sh.R.P.',
    'Crl.S.M.Sh.R.P.', 'J.Sh.P.', 'Sh.M.A.', 'Reference.',
  ],
  svc_judicial_supreme_court: [
    'C.A.', 'C.M.A.', 'C.M.Appeal.', 'C.P.', 'C.R.P.', 'C.Sh.A.', 'C.Sh.P.',
    'C.Sh.R.P.', 'Const.P.', 'Crl.A.', 'Crl.M.A.', 'Crl.M.Appeal.', 'Crl.O.P.',
    'Crl.P.', 'Crl.R.P.', 'Crl.S.M.R.P.', 'Crl.S.M.Sh.R.P.', 'Crl.Sh.A.', 'Crl.Sh.P.',
    'Crl.Sh.R.P.', 'D.S.A.', 'H.R.C.', 'H.R.M.A.', 'I.C.A.', 'J.P.', 'J.Sh.P.',
    'Reference.', 'S.M.C.', 'S.M.R.P.',
  ],
};

const SUBCOURT_CASE_TYPES: Record<string, Record<string, string[]>> = {
  svc_judicial_lower_court: {
    'Sessions Court': [
      'Bail Application (S)', 'Criminal Appeal', 'Criminal Misc.', 'Criminal Revision',
      'Hadood Cases (Under Hadood Ordinance)', 'Harrassment', 'Illegal Dispossession Act',
      'Inquiry (S)', 'Money Laundering Act', 'Narcotics Cases (S)', 'Other Cases (S)',
      'Petitions u/s 22-A/22-B Cr.P.C', 'Sessions Cases (Murder)', 'Sessions Cases (Others)',
      'STA Cases', 'Superdari', 'Habeas Corpus', 'Execution Petition (S)',
    ],
    'Civil Court': [
      'Civil Appeal', 'Civil Case of Summary Nature Involving Evidence',
      'Civil Misc.', 'Civil Revision', 'Civil Suit', 'Commercial Cases',
      'Election Petition', 'Execution Petition (C)', 'Inquiry (C)', 'Insolvency Cases',
      'Insurance Cases', 'Labour Cases', 'Land Acquisition Cases', 'Obejcton Petiton',
      'Original Suit', 'Other Cases (C)', 'Pauper Cases', 'Rent Cases',
      'Small Clam & Minor Offence',
    ],
    'Magisterial Court': [
      'Bail Application (M)', 'Ist Class Cases', 'Minor Offences',
      'Narcotics Cases (M)', 'Other Cases (M)', 'Section 30 Case',
    ],
    'Family Court': [
      'Family Cases', 'Guardianship Cases', 'Application for Succession',
    ],
  },
};

// Map service id → courtLevel string used in CourtCaseType.
const COURT_LEVEL_BY_SERVICE: Record<string, string> = {
  svc_judicial_lower_court: 'Lower Court',
  svc_judicial_special_court: 'Special Court',
  svc_judicial_high_court: 'High Court',
  svc_judicial_federal_shariat: 'Federal Shariat Court',
  svc_judicial_supreme_court: 'Supreme Court',
};

type FallbackRow = {
  courtLevel: string;
  subCourt: string | null;
  code: string;
  label: string;
};

const rows: FallbackRow[] = [];

for (const [serviceId, caseTypes] of Object.entries(SERVICE_CASE_TYPES)) {
  const courtLevel = COURT_LEVEL_BY_SERVICE[serviceId];
  if (!courtLevel) continue;
  const subCourtMap = SUBCOURT_CASE_TYPES[serviceId];
  if (subCourtMap) {
    for (const [subCourt, list] of Object.entries(subCourtMap)) {
      for (const label of list) {
        rows.push({ courtLevel, subCourt, code: label, label });
      }
    }
  } else {
    for (const label of caseTypes) {
      rows.push({ courtLevel, subCourt: null, code: label, label });
    }
  }
}

const outPath = join(__dirname, '..', '..', 'data', 'case-types', 'hardcoded-snapshot.json');
writeFileSync(outPath, JSON.stringify(rows, null, 2));
console.log(`Wrote ${rows.length} fallback rows → ${outPath}`);
```

- [ ] **Step 3: Run the script**

```bash
cd apps/api && pnpm tsx scripts/scrape-case-types/dump-hardcoded.ts
```

Expected: `Wrote N fallback rows → .../hardcoded-snapshot.json` where N ≈ 145 (45 lower-court rows split into sub-courts + 4 special + 60 high + 10 shariat + 30 supreme).

- [ ] **Step 4: Inspect the JSON**

```bash
head -20 apps/api/data/case-types/hardcoded-snapshot.json
```

Expected: a JSON array of `{ courtLevel, subCourt, code, label }` objects.

- [ ] **Step 5: Commit**

```bash
git add apps/api/data/case-types/.gitkeep apps/api/data/case-types/hardcoded-snapshot.json apps/api/scripts/scrape-case-types/dump-hardcoded.ts
git commit -m "feat(case-types): dump hardcoded wizard constants to snapshot JSON

Captures the existing SERVICE_CASE_TYPES + SUBCOURT_CASE_TYPES from
intake-wizard.tsx into a committed fallback file. This is the safety net
for tiers/regions the per-source scrapers don't cover."
```

---

## Task 3: Scraper shared utilities

**Files:**
- Create: `apps/api/scripts/scrape-case-types/shared.ts`

- [ ] **Step 1: Add `playwright` as an apps/api devDependency**

```bash
cd apps/api && pnpm add -D playwright
```

Expected: lock file updated, `playwright` added to apps/api/package.json `devDependencies`.

- [ ] **Step 2: Install browsers if needed**

```bash
cd apps/api && pnpm exec playwright install chromium
```

Expected: chromium downloaded and ready.

- [ ] **Step 3: Write `shared.ts`**

```ts
/**
 * Shared utilities for the case-type scrapers.
 *
 * Each scraper produces a JSON file at apps/api/data/case-types/<source>.json
 * containing rows of { courtLevel, subCourt?, district?, region?, highCourtCode?, code, label, source, priority? }.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

export type ScrapedRow = {
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

const DATA_DIR = join(__dirname, '..', '..', 'data', 'case-types');

export async function withBrowser<T>(fn: (browser: Browser, page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    return await fn(browser, page);
  } finally {
    await browser.close();
  }
}

/**
 * Refuses to overwrite the JSON file if the scraped row count is below the
 * supplied floor. Catches "site redesign broke our selectors" failure mode.
 */
export function writeOutput(filename: string, rows: ScrapedRow[], minRows: number): void {
  if (rows.length < minRows) {
    throw new Error(
      `Scraper produced ${rows.length} rows; floor is ${minRows}. ` +
        `Refusing to overwrite ${filename}. The source site may have changed.`,
    );
  }
  const outPath = join(DATA_DIR, filename);
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} rows → ${outPath}`);
}
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/scripts/scrape-case-types/shared.ts pnpm-lock.yaml
git commit -m "feat(case-types): scraper shared utilities + playwright dep

Adds Playwright + a small helper module the per-source scrapers will
build on (browser bootstrap, JSON writer with count-floor validator)."
```

---

## Task 4: SCP scraper (Supreme Court — PDF #18)

**Files:**
- Create: `apps/api/scripts/scrape-case-types/scrape-scp.ts`
- Create: `apps/api/data/case-types/scp.json`

- [ ] **Step 1: Write the SCP scraper**

```ts
/**
 * Scrape Supreme Court of Pakistan case types from
 * https://scp.gov.pk/OnlineCaseInformation
 *
 * The page renders a "Case Type" <select> with ~30 options. We capture each
 * option's text and use it as both `code` and `label` (SCP values are
 * already short canonical codes like "C.A.", "C.M.A.", etc.).
 *
 * Run: cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-scp.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://scp.gov.pk/OnlineCaseInformation';
const SOURCE = 'scp.gov.pk';
const COURT_LEVEL = 'Supreme Court';
const MIN_ROWS = 20;

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // SCP's case-type select id may vary; locate it by label heuristics.
    // The select has options whose text matches /^[A-Z][\w.]+\.?$/ (e.g. "C.A.").
    const options: { value: string; text: string }[] = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      // Pick the select with the most case-type-looking options.
      let best: { value: string; text: string }[] = [];
      for (const s of selects) {
        const opts = Array.from(s.options)
          .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))
          .filter((o) => o.text && o.text !== '-- Select --' && o.text.length < 80);
        if (opts.length > best.length) best = opts;
      }
      return best;
    });
    return options.map<ScrapedRow>((o, i) => ({
      courtLevel: COURT_LEVEL,
      code: o.text,
      label: o.text,
      source: SOURCE,
      priority: 1000 - i,
    }));
  });

  writeOutput('scp.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the scraper**

```bash
cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-scp.ts
```

Expected: `Wrote N rows → .../scp.json` with N ≥ 20.

If the count is below 20, the scraper aborts. In that case manually verify the page structure at `https://scp.gov.pk/OnlineCaseInformation` and adjust the option-picking heuristic in `page.evaluate`.

- [ ] **Step 3: Inspect the output**

```bash
jq 'length' apps/api/data/case-types/scp.json
head -30 apps/api/data/case-types/scp.json
```

Expected: a JSON array of ScrapedRow objects, length ≥ 20.

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/scrape-case-types/scrape-scp.ts apps/api/data/case-types/scp.json
git commit -m "feat(case-types): scrape Supreme Court case types from scp.gov.pk

PDF #18. Produces apps/api/data/case-types/scp.json with the SCP case-type
vocabulary (C.A., C.M.A., C.P., Crl.A., etc.). Count-floor validator
refuses to overwrite if the scrape returns < 20 rows."
```

---

## Task 5: FCC scraper (Federal Constitutional Court — PDF #19)

**Files:**
- Create: `apps/api/scripts/scrape-case-types/scrape-fcc.ts`
- Create: `apps/api/data/case-types/fcc.json`

- [ ] **Step 1: Write the FCC scraper**

```ts
/**
 * Scrape Federal Constitutional Court case types from
 * https://www.fccp.gov.pk/online-case-information
 *
 * Same pattern as SCP — a single <select> with the case-type vocabulary.
 *
 * Run: cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-fcc.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://www.fccp.gov.pk/online-case-information';
const SOURCE = 'fccp.gov.pk';
const COURT_LEVEL = 'Federal Constitutional Court';
const MIN_ROWS = 15;

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const options: { value: string; text: string }[] = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      let best: { value: string; text: string }[] = [];
      for (const s of selects) {
        const opts = Array.from(s.options)
          .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))
          .filter((o) => o.text && o.text !== '-- Select --' && o.text.length < 80);
        if (opts.length > best.length) best = opts;
      }
      return best;
    });
    return options.map<ScrapedRow>((o, i) => ({
      courtLevel: COURT_LEVEL,
      code: o.text,
      label: o.text,
      source: SOURCE,
      priority: 1000 - i,
    }));
  });

  writeOutput('fcc.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run + commit (same as Task 4)**

```bash
cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-fcc.ts
jq 'length' apps/api/data/case-types/fcc.json
git add apps/api/scripts/scrape-case-types/scrape-fcc.ts apps/api/data/case-types/fcc.json
git commit -m "feat(case-types): scrape FCC case types from fccp.gov.pk

PDF #19. Federal Constitutional Court case-type vocabulary."
```

---

## Task 6: IHC scraper (Islamabad High Court — PDF #21b)

**Files:**
- Create: `apps/api/scripts/scrape-case-types/scrape-ihc.ts`
- Create: `apps/api/data/case-types/ihc.json`

- [ ] **Step 1: Write the IHC scraper**

```ts
/**
 * Scrape Islamabad High Court case types from
 * https://mis.ihc.gov.pk/frmCseSrch
 *
 * Rows are emitted with highCourtCode='IHC' so the API can disambiguate from
 * other High Courts.
 *
 * Run: cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-ihc.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://mis.ihc.gov.pk/frmCseSrch';
const SOURCE = 'mis.ihc.gov.pk';
const COURT_LEVEL = 'High Court';
const HIGH_COURT_CODE = 'IHC';
const MIN_ROWS = 20;

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const options: { value: string; text: string }[] = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      let best: { value: string; text: string }[] = [];
      for (const s of selects) {
        const opts = Array.from(s.options)
          .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))
          .filter((o) => o.text && o.text !== '-- Select --' && o.text.length < 100);
        if (opts.length > best.length) best = opts;
      }
      return best;
    });
    return options.map<ScrapedRow>((o, i) => ({
      courtLevel: COURT_LEVEL,
      highCourtCode: HIGH_COURT_CODE,
      code: o.text,
      label: o.text,
      source: SOURCE,
      priority: 1000 - i,
    }));
  });

  writeOutput('ihc.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run + commit**

```bash
cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-ihc.ts
jq 'length' apps/api/data/case-types/ihc.json
git add apps/api/scripts/scrape-case-types/scrape-ihc.ts apps/api/data/case-types/ihc.json
git commit -m "feat(case-types): scrape Islamabad High Court case types

PDF #21b. mis.ihc.gov.pk case-type vocabulary, tagged highCourtCode='IHC'."
```

---

## Task 7: SHC scraper (Sindh High Court — PDF #21b)

**Files:**
- Create: `apps/api/scripts/scrape-case-types/scrape-shc.ts`
- Create: `apps/api/data/case-types/shc.json`

- [ ] **Step 1: Write the SHC scraper**

```ts
/**
 * Scrape Sindh High Court case types from
 * https://cases.shc.gov.pk/khi/web/index.php?r=cases%2Fsearch
 *
 * Rows tagged highCourtCode='SHC'.
 *
 * Run: cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-shc.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://cases.shc.gov.pk/khi/web/index.php?r=cases%2Fsearch';
const SOURCE = 'cases.shc.gov.pk';
const COURT_LEVEL = 'High Court';
const HIGH_COURT_CODE = 'SHC';
const MIN_ROWS = 20;

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const options: { value: string; text: string }[] = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      let best: { value: string; text: string }[] = [];
      for (const s of selects) {
        const opts = Array.from(s.options)
          .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))
          .filter((o) => o.text && o.text !== '-- Select --' && o.text.length < 100);
        if (opts.length > best.length) best = opts;
      }
      return best;
    });
    return options.map<ScrapedRow>((o, i) => ({
      courtLevel: COURT_LEVEL,
      highCourtCode: HIGH_COURT_CODE,
      code: o.text,
      label: o.text,
      source: SOURCE,
      priority: 1000 - i,
    }));
  });

  writeOutput('shc.json', rows, MIN_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run + commit**

```bash
cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-shc.ts
jq 'length' apps/api/data/case-types/shc.json
git add apps/api/scripts/scrape-case-types/scrape-shc.ts apps/api/data/case-types/shc.json
git commit -m "feat(case-types): scrape Sindh High Court case types

PDF #21b. cases.shc.gov.pk case-type vocabulary, tagged highCourtCode='SHC'."
```

---

## Task 8: DSJ Lahore scraper (Lower Court Punjab — PDF #20)

**Files:**
- Create: `apps/api/scripts/scrape-case-types/scrape-dsj-lahore.ts`
- Create: `apps/api/data/case-types/dsj-lahore.json`

- [ ] **Step 1: Write the DSJ Lahore scraper**

DSJ Lahore exposes a District selector + Court Name selector that filters the Case Type list. The scraper iterates the District selector's options, picks each in turn, then captures the Case Type list. Output rows carry both `district` and `region='Punjab'`.

```ts
/**
 * Scrape Lower Court case types (Punjab, per district) from
 * https://dsjlahore.punjab.gov.pk/
 *
 * The page exposes a District <select>. For each district we re-load the
 * Court Name + Case Category selects and capture the resulting case-type
 * vocabulary. Rows tagged district=<name>, region='Punjab'.
 *
 * Run: cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-dsj-lahore.ts
 */
import { withBrowser, writeOutput, type ScrapedRow } from './shared';

const URL = 'https://dsjlahore.punjab.gov.pk/';
const SOURCE = 'dsjlahore.punjab.gov.pk';
const COURT_LEVEL = 'Lower Court';
const REGION = 'Punjab';
const MIN_TOTAL_ROWS = 50; // Floor across ALL districts combined.

async function main() {
  const rows = await withBrowser(async (_, page) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // Pick the largest non-empty <select> on the page as the district selector.
    // Other selects (court name, case category) will be re-queried per district.
    const districts: string[] = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      let best: HTMLOptionElement[] = [];
      for (const s of selects) {
        const opts = Array.from(s.options).filter(
          (o) => o.textContent && o.textContent.trim() && !/select/i.test(o.textContent),
        );
        if (opts.length > best.length) best = opts;
      }
      return best.map((o) => o.textContent!.trim());
    });

    const allRows: ScrapedRow[] = [];

    for (const district of districts) {
      // Select the district by visible text. Page-evaluate so we can match
      // exactly without depending on a stable id.
      const selected = await page.evaluate((d) => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const s of selects) {
          const match = Array.from(s.options).find(
            (o) => (o.textContent ?? '').trim() === d,
          );
          if (match) {
            s.value = match.value;
            s.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, district);
      if (!selected) continue;
      // Wait for the case-type select to repopulate. The site uses
      // AJAX cascading; 1.5 seconds is generous.
      await page.waitForTimeout(1500);
      const caseTypes: string[] = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        // Find the select that has the LONGEST option list now — the case-type select.
        let best: string[] = [];
        for (const s of selects) {
          const opts = Array.from(s.options)
            .map((o) => (o.textContent ?? '').trim())
            .filter((t) => t && !/select/i.test(t));
          if (opts.length > best.length) best = opts;
        }
        return best;
      });

      for (let i = 0; i < caseTypes.length; i++) {
        const label = caseTypes[i];
        allRows.push({
          courtLevel: COURT_LEVEL,
          district,
          region: REGION,
          code: label,
          label,
          source: SOURCE,
          priority: 1000 - i,
        });
      }
    }

    return allRows;
  });

  writeOutput('dsj-lahore.json', rows, MIN_TOTAL_ROWS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the scraper**

```bash
cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-dsj-lahore.ts
```

Expected: `Wrote N rows → .../dsj-lahore.json`, N ≥ 50. May take 1-2 minutes (per-district loop with 1.5s wait each).

If the scraper fails or undercounts:
- Open `https://dsjlahore.punjab.gov.pk/` manually
- Identify the District + Case Type select element ids
- Refine `page.evaluate` to target by id instead of by "largest select" heuristic

- [ ] **Step 3: Inspect + commit**

```bash
jq 'length' apps/api/data/case-types/dsj-lahore.json
jq '[.[].district] | unique | length' apps/api/data/case-types/dsj-lahore.json
git add apps/api/scripts/scrape-case-types/scrape-dsj-lahore.ts apps/api/data/case-types/dsj-lahore.json
git commit -m "feat(case-types): scrape Lower Court (Punjab) case types from DSJ Lahore

PDF #20. Per-district case-type vocabulary across all Punjab districts
served by the DSJ Lahore portal."
```

---

## Task 9: Seed script

**Files:**
- Create: `apps/api/scripts/seed-case-types.ts`

- [ ] **Step 1: Write the seed**

```ts
/**
 * Seed the CourtCaseType table from the committed JSON files in
 * apps/api/data/case-types/. Idempotent: wipes the table and re-inserts.
 *
 * Run: cd apps/api && pnpm tsx scripts/seed-case-types.ts
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
    const [courtLevel, subCourt, region, highCourtCode] = cohort.split('|');
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
  await prisma.$transaction(async (tx) => {
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
      skipDuplicates: true, // Defense-in-depth against intra-file duplicates.
    });
    const count = await tx.courtCaseType.count();
    console.log(`Seeded ${count} CourtCaseType rows.`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run the seed**

```bash
cd apps/api && pnpm tsx scripts/seed-case-types.ts
```

Expected:
```
  scp.json: 30 rows
  fcc.json: 25 rows
  ihc.json: 60 rows
  shc.json: 40 rows
  dsj-lahore.json: 500 rows
  hardcoded-snapshot.json: 145 rows
  → 75 fallback rows after cohort de-dup
  + 12 "Other" rows
Seeded ~750 CourtCaseType rows.
```

(Counts approximate; actual depends on what the scrapers produce.)

- [ ] **Step 3: Sanity-check the DB**

```bash
cd apps/api && npx prisma studio
```

In Studio, open the `CourtCaseType` table. Spot-check:
- Filter `courtLevel = 'Supreme Court'` → ~30 rows
- Filter `courtLevel = 'High Court' AND highCourtCode = 'IHC'` → ~60 rows
- Filter `courtLevel = 'Lower Court' AND district = 'Lahore'` → some rows
- Filter `code = 'OTHER'` → one row per cohort

Close Studio.

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/seed-case-types.ts
git commit -m "feat(case-types): seed script ingests JSON sources + fallback + Other

Reads the 5 scraper outputs plus the hardcoded fallback snapshot, dedups
cohorts so scraped data wins, appends an 'Other' row per cohort. Wipes
and re-inserts in a transaction. Idempotent and safe to re-run."
```

---

## Task 10: API endpoint + service + tests

**Files:**
- Create: `apps/api/src/case-types/case-types.module.ts`
- Create: `apps/api/src/case-types/case-types.service.ts`
- Create: `apps/api/src/case-types/case-types.controller.ts`
- Create: `apps/api/src/case-types/case-types.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing spec**

`apps/api/src/case-types/case-types.service.spec.ts`:

```ts
import { CaseTypesService } from './case-types.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('CaseTypesService', () => {
  const mkPrisma = (rows: any[]) => ({
    courtCaseType: {
      findMany: jest.fn(async (args: any) => {
        return rows.filter((r) => {
          for (const [k, v] of Object.entries(args.where ?? {})) {
            if (v === null && r[k] != null) return false;
            if (v !== null && v !== undefined && r[k] !== v) return false;
          }
          return true;
        });
      }),
    },
  } as unknown as PrismaService);

  it('returns the most-specific cohort when all filters match', async () => {
    const rows = [
      { courtLevel: 'Lower Court', subCourt: 'Sessions Court', district: 'Lahore', region: 'Punjab', highCourtCode: null, code: 'X', label: 'X', source: 'dsj', priority: 0 },
      { courtLevel: 'Lower Court', subCourt: 'Sessions Court', district: null, region: null, highCourtCode: null, code: 'Y', label: 'Y', source: 'fallback', priority: 0 },
    ];
    const svc = new CaseTypesService(mkPrisma(rows));
    const out = await svc.findCaseTypes({ courtLevel: 'Lower Court', subCourt: 'Sessions Court', district: 'Lahore' });
    expect(out.map((r) => r.code)).toEqual(['X']);
  });

  it('falls back when district has no rows but subCourt does', async () => {
    const rows = [
      { courtLevel: 'Lower Court', subCourt: 'Family Court', district: null, region: null, highCourtCode: null, code: 'F', label: 'Family', source: 'fallback', priority: 0 },
    ];
    const svc = new CaseTypesService(mkPrisma(rows));
    const out = await svc.findCaseTypes({ courtLevel: 'Lower Court', subCourt: 'Family Court', district: 'Lahore' });
    expect(out.map((r) => r.code)).toEqual(['F']);
  });

  it('falls back to courtLevel when no rows match subCourt', async () => {
    const rows = [
      { courtLevel: 'High Court', subCourt: null, district: null, region: null, highCourtCode: null, code: 'WP', label: 'Writ Petition', source: 'fallback', priority: 0 },
    ];
    const svc = new CaseTypesService(mkPrisma(rows));
    const out = await svc.findCaseTypes({ courtLevel: 'High Court', highCourtCode: 'LHC' });
    expect(out.map((r) => r.code)).toEqual(['WP']);
  });

  it('orders by priority desc then label asc', async () => {
    const rows = [
      { courtLevel: 'Supreme Court', subCourt: null, district: null, region: null, highCourtCode: null, code: 'B', label: 'B', source: 'scp', priority: 1 },
      { courtLevel: 'Supreme Court', subCourt: null, district: null, region: null, highCourtCode: null, code: 'A', label: 'A', source: 'scp', priority: 1 },
      { courtLevel: 'Supreme Court', subCourt: null, district: null, region: null, highCourtCode: null, code: 'C', label: 'C', source: 'scp', priority: 5 },
    ];
    const svc = new CaseTypesService(mkPrisma(rows));
    const out = await svc.findCaseTypes({ courtLevel: 'Supreme Court' });
    expect(out.map((r) => r.code)).toEqual(['C', 'A', 'B']);
  });

  it('returns [] when nothing matches at any specificity', async () => {
    const svc = new CaseTypesService(mkPrisma([]));
    const out = await svc.findCaseTypes({ courtLevel: 'Federal Shariat Court' });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, watch it fail**

```bash
cd apps/api && pnpm test -- --testPathPattern=case-types
```

Expected: FAIL with "Cannot find module './case-types.service'".

- [ ] **Step 3: Implement the service**

`apps/api/src/case-types/case-types.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type FindCaseTypesArgs = {
  courtLevel: string;
  subCourt?: string;
  district?: string;
  region?: string;
  highCourtCode?: string;
};

export type CaseTypeRow = {
  code: string;
  label: string;
  source: string;
  priority: number;
};

@Injectable()
export class CaseTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Specificity fallback chain:
   *   1. (courtLevel, subCourt, district, highCourtCode)  ← most specific
   *   2. drop district
   *   3. drop subCourt
   *   4. drop highCourtCode  ← least specific
   * Returns the first non-empty cohort. Each row carries source so callers
   * can tell scraped vs hardcoded.
   */
  async findCaseTypes(args: FindCaseTypesArgs): Promise<CaseTypeRow[]> {
    const attempts: Array<Record<string, string | null>> = [
      {
        courtLevel: args.courtLevel,
        subCourt: args.subCourt ?? null,
        district: args.district ?? null,
        highCourtCode: args.highCourtCode ?? null,
      },
      {
        courtLevel: args.courtLevel,
        subCourt: args.subCourt ?? null,
        district: null,
        highCourtCode: args.highCourtCode ?? null,
      },
      {
        courtLevel: args.courtLevel,
        subCourt: null,
        district: null,
        highCourtCode: args.highCourtCode ?? null,
      },
      {
        courtLevel: args.courtLevel,
        subCourt: null,
        district: null,
        highCourtCode: null,
      },
    ];

    for (const where of attempts) {
      const rows = await this.prisma.courtCaseType.findMany({
        where: { ...where, isActive: true },
        orderBy: [{ priority: 'desc' }, { label: 'asc' }],
        select: { code: true, label: true, source: true, priority: true },
      });
      if (rows.length > 0) return rows;
    }
    return [];
  }
}
```

- [ ] **Step 4: Re-run the test, watch it pass**

```bash
cd apps/api && pnpm test -- --testPathPattern=case-types
```

Expected: 5/5 tests pass.

- [ ] **Step 5: Add the controller**

`apps/api/src/case-types/case-types.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { CaseTypesService } from './case-types.service';

@Controller('case-types')
export class CaseTypesController {
  constructor(private readonly svc: CaseTypesService) {}

  @Get()
  list(
    @Query('courtLevel') courtLevel: string,
    @Query('subCourt') subCourt?: string,
    @Query('district') district?: string,
    @Query('region') region?: string,
    @Query('highCourtCode') highCourtCode?: string,
  ) {
    return this.svc.findCaseTypes({
      courtLevel,
      subCourt,
      district,
      region,
      highCourtCode,
    });
  }
}
```

- [ ] **Step 6: Add the module**

`apps/api/src/case-types/case-types.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CaseTypesController } from './case-types.controller';
import { CaseTypesService } from './case-types.service';

@Module({
  imports: [PrismaModule],
  controllers: [CaseTypesController],
  providers: [CaseTypesService],
})
export class CaseTypesModule {}
```

- [ ] **Step 7: Register the module**

Modify `apps/api/src/app.module.ts` — add `CaseTypesModule` to the imports array (find the existing `imports: [ ... ]` block and append).

```ts
import { CaseTypesModule } from './case-types/case-types.module';
// ... existing imports

@Module({
  imports: [
    // ... existing modules
    CaseTypesModule,
  ],
  // ...
})
export class AppModule {}
```

- [ ] **Step 8: Mark the endpoint public**

The default global guard is `JwtAuthGuard`. Case-type lookups are non-sensitive metadata; allow authenticated consumers and staff to call them. Find how other consumer-callable endpoints in this repo are gated. If a `@Public()` decorator is used elsewhere (e.g. on `/auth/login`), don't add it here — the wizard authenticates as a consumer so it'll have a JWT. Verify by curl in Step 11.

- [ ] **Step 9: Restart API + typecheck**

```bash
pnpm typecheck
```

Expected: clean across all workspaces.

Restart the dev API (kill the running pid on port 4000 if you have one running, then `pnpm dev:api`).

- [ ] **Step 10: Curl smoke**

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"identifier":"testconsumer@wusuq.com","password":"password123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

echo "=== Supreme Court ==="
curl -s "http://localhost:4000/api/case-types?courtLevel=Supreme%20Court" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20

echo "=== Lower Court / Sessions / Lahore ==="
curl -s "http://localhost:4000/api/case-types?courtLevel=Lower%20Court&subCourt=Sessions%20Court&district=Lahore" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20

echo "=== High Court / IHC ==="
curl -s "http://localhost:4000/api/case-types?courtLevel=High%20Court&highCourtCode=IHC" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
```

Expected for each: a non-empty JSON array of `{ code, label, source, priority }`. Each cohort's last row should be `{ code: "OTHER", label: "Other", source: "manual" }`.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/case-types/ apps/api/src/app.module.ts
git commit -m "feat(api): GET /case-types endpoint with specificity-fallback chain

CaseTypesService.findCaseTypes implements the (subCourt, district,
highCourtCode) → drop-one-at-a-time fallback documented in the spec.
5 unit tests cover the cascade. Controller exposes GET /case-types
keyed on courtLevel + optional filters."
```

---

## Task 11: Wizard wire-up

**Files:**
- Modify: `apps/web/components/intake-wizard.tsx`
- Modify: `apps/web/lib/intake-flows.ts`

- [ ] **Step 1: Add the `case_type_other` field declaration**

In `apps/web/lib/intake-flows.ts`, locate `caseFilesSteps` step 2 and the `case_type` field within it. Right after the `case_type` field, append a new field:

```ts
{
  key: 'case_type_other',
  label: 'Specify case type',
  type: 'text',
  required: false,
  placeholder: 'Type the case type as it appears on your record',
  showWhen: { field: 'case_type', value: 'OTHER' },
},
```

Repeat the same insertion in `caseInformationSteps` step 2 if it has a `case_type` field. Also repeat in `caseSearchSteps` step 2 if there is one within the Case Details tab. (Search for `key: 'case_type'` across the file.)

- [ ] **Step 2: Delete the hardcoded constants from the wizard**

In `apps/web/components/intake-wizard.tsx`, remove `SERVICE_CASE_TYPES` and `SUBCOURT_CASE_TYPES` declarations entirely (~lines 30–110). Also remove the `caseTypesFor(serviceId, subCourt?)` helper since the API now does this.

- [ ] **Step 3: Replace the `selectedServiceCaseTypes` useMemo with an API-fetch effect**

In `intake-wizard.tsx`, find the existing `selectedServiceCaseTypes` `useMemo`. Replace with:

```ts
const [selectedServiceCaseTypes, setSelectedServiceCaseTypes] = useState<string[]>([]);

useEffect(() => {
  const courtLevel = draft.payload.select_court_type;
  if (!courtLevel) {
    setSelectedServiceCaseTypes([]);
    return;
  }
  let cancelled = false;
  const params = new URLSearchParams({ courtLevel });
  if (draft.payload.select_court) {
    params.set('subCourt', draft.payload.select_court);
  }
  if (draft.payload.select_court_city) {
    params.set('district', draft.payload.select_court_city);
  }
  // highCourtCode is informational; only set when we know the HC code.
  // For v1 we don't surface it in the wizard — the API falls back.
  apiClient
    .get<Array<{ code: string; label: string }>>(`/case-types?${params.toString()}`)
    .then((rows) => {
      if (cancelled) return;
      // Render the label; store the code in payload.
      setSelectedServiceCaseTypes(rows.map((r) => r.label));
    })
    .catch(() => {
      if (cancelled) return;
      setSelectedServiceCaseTypes([]);
    });
  return () => {
    cancelled = true;
  };
}, [draft.payload.select_court_type, draft.payload.select_court, draft.payload.select_court_city]);
```

(If `selectedServiceCaseTypes` is consumed downstream as labels-only, keep the mapping above. If it should be `{code, label}[]` to round-trip the code into payload, change the state type and consumers accordingly. Search for `selectedServiceCaseTypes` usages and adjust.)

- [ ] **Step 4: Make `case_type_other` required when `case_type === 'OTHER'`**

In the same file, find `validateField` and `validateCurrentStep`. Locate the existing pattern checking `case_status === 'Decided Case'` (used for set-type filtering). Add a parallel check: when `field.key === 'case_type_other'` and `payload.case_type === 'OTHER'`, require non-empty after trim. Use existing required-text error message.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Live smoke**

Web dev server: `pnpm dev:web` (on port 3000 or 3002, whichever is free). API on 4000.

1. Login as `testconsumer@wusuq.com` / `password123` via `/consumer/login/email`.
2. Open `/consumer/paralegal-services/judicial/case-files`. Pick Lahore → Lower Court → Sessions Court. Continue.
3. On Step 2, the Case Type dropdown should populate from the API (visible network call to `/api/case-types?courtLevel=Lower%20Court&subCourt=Sessions%20Court&district=Lahore`).
4. Scroll the dropdown to confirm "Other" is the last entry. Pick "Other".
5. A new "Specify case type" text input should reveal.
6. Try to Continue with it empty → validation error. Fill it, Continue → advances.
7. Go back to Step 1, switch to Family Court. Step 2 Case Type re-fetches and renders only family-relevant options (Family Cases, Guardianship Cases, Application for Succession, Other).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/intake-wizard.tsx apps/web/lib/intake-flows.ts
git commit -m "feat(wizard): read case types from API + 'Other' free-text fallback

Replaces SERVICE_CASE_TYPES + SUBCOURT_CASE_TYPES (deleted) with a
GET /case-types call keyed on (courtLevel, subCourt, district). The
specificity-fallback in the API handles sub-court filters and the
Punjab-vs-other district split. New 'Other' option reveals a text
input (case_type_other, required when case_type === 'OTHER').

Completes PDF #18, #19, #20 (incl. 'Other'), #21b."
```

---

## Spec coverage check

- PDF #18 Supreme Court: Task 4 (SCP scraper) → seeded in Task 9 → consumed via Task 10 endpoint, Task 11 wizard.
- PDF #19 FCC: Task 5 → Task 9 → Tasks 10/11.
- PDF #20 DSJ Lahore + "Other": Task 8 (per-district scraper) + Task 9 (Other rows appended per cohort) → Tasks 10/11.
- PDF #21b IHC + SHC: Tasks 6 + 7 → Task 9 → Tasks 10/11.
- Hardcoded fallback for tiers/regions not in scraper coverage: Task 2 dump + Task 9 cohort-aware merge.
- Wizard read path replaces hardcoded constants: Task 11.

All spec items have at least one task implementing them.
