# Case-type catalogue — design

Status: approved 2026-05-11.
Scope: PDF feedback items #18 (Supreme Court), #19 (Federal Constitutional Court), #20 (Lower Court — DSJ Lahore + "Other"), #21b (Islamabad HC + Sindh HC).

## Problem

Today the consumer wizard's case-type lists live as hard-coded arrays in `apps/web/components/intake-wizard.tsx` (`SERVICE_CASE_TYPES`, `SUBCOURT_CASE_TYPES`). The PDF asks for them to be sourced from five authoritative government sites so the lists match what the courts actually accept. Two-source-of-truth is the trap to avoid: scraped data must end up as a single, queryable, DB-backed catalogue that the wizard reads from at runtime.

## Approach

One-off scrape → committed JSON → DB seed → API endpoint. No live cron, no per-request proxy, no runtime dependency on government infrastructure. Re-run scrapers quarterly (or when a court redesigns their portal).

## Data model

New Prisma model:

```prisma
model CourtCaseType {
  id            String   @id @default(cuid())
  courtLevel    String   // 'Lower Court' | 'Special Court' | 'High Court' | 'Federal Shariat Court' | 'Supreme Court' | 'Federal Constitutional Court'
  subCourt      String?  // For Lower Court: 'Sessions Court' | 'Civil Court' | 'Magisterial Court' | 'Family Court'
  district      String?  // For per-district Lower Court (DSJ Lahore is district-keyed)
  region        String?  // 'Punjab' | 'other'
  highCourtCode String?  // 'IHC' | 'SHC' | 'LHC' | 'PHC' | 'BHC' — when courtLevel='High Court'
  code          String   // canonical short, e.g. 'C.A.'
  label         String   // display, e.g. 'Civil Appeal'
  source        String   // 'scp.gov.pk' | 'fccp.gov.pk' | 'dsjlahore.punjab.gov.pk' | 'mis.ihc.gov.pk' | 'cases.shc.gov.pk' | 'hardcoded_fallback'
  priority      Int      @default(0)
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())

  @@unique([courtLevel, subCourt, district, region, highCourtCode, code])
  @@index([courtLevel, subCourt])
}
```

**Dimension rationale:**

- `courtLevel` — primary key, matches `Service.courtLevel` strings used everywhere else in the app.
- `subCourt` — preserves the Family Court / Sessions / Civil / Magisterial filter shipped in PDF #21a.
- `district` — DSJ Lahore exposes per-district variations of the Lower Court list; non-Lower rows leave this null.
- `region` — `Punjab` vs `other`, mirroring `PricingRule.region`. Lets non-Punjab Lower Court use a generic fallback when no district-specific data exists.
- `highCourtCode` — distinguishes IHC vs SHC vs LHC etc. All are `courtLevel='High Court'` but have different case-type vocabularies.
- `source` — operational metadata; lets future audits target `hardcoded_fallback` rows that should eventually be replaced with scraped data.

Migration: `20260513000000_court_case_type_catalogue`.

## Scrapers

`apps/api/scripts/scrape-case-types/` directory:

```
apps/api/scripts/scrape-case-types/
├── scrape-scp.ts           # scp.gov.pk/OnlineCaseInformation
├── scrape-fcc.ts           # fccp.gov.pk/online-case-information
├── scrape-ihc.ts           # mis.ihc.gov.pk/frmCseSrch
├── scrape-shc.ts           # cases.shc.gov.pk/khi/web/index.php?r=cases%2Fsearch
├── scrape-dsj-lahore.ts    # dsjlahore.punjab.gov.pk (per-district loop)
└── shared.ts               # Playwright bootstrap + JSON writer + count-floor validator
```

Each scraper launches Playwright (npm package, already a transitive dev dep), navigates to the case-info page, expands the case-type select, extracts `(value, text)` pairs, and writes `apps/api/data/case-types/<source>.json`.

`scrape-dsj-lahore.ts` iterates Punjab districts. The DSJ portal has a district selector that filters the case-type list; the scraper emits per-district rows.

Run manually:

```
cd apps/api && pnpm tsx scripts/scrape-case-types/scrape-scp.ts
```

CI does not run scrapers.

**Fragility budget:** each scraper has a `validate(rows)` step. If the row count drops below a per-source sanity floor (SCP < 20, FCC < 15, IHC < 20, SHC < 20, DSJ Lahore < 5 per district), the script errors out and refuses to overwrite the JSON file. This catches "site redesign broke our selectors" without silently nuking real data.

## Seed + fallback

`apps/api/scripts/seed-case-types.ts`:

1. `prisma.courtCaseType.deleteMany({})` (idempotent).
2. Load each of the 5 JSON files from `apps/api/data/case-types/`. Skip files that don't exist (useful for dev environments where only some scrapers have been run).
3. Load the hardcoded fallback snapshot (see below). For each `(courtLevel, subCourt, region, highCourtCode)` cohort the scrapers didn't already populate, insert the fallback rows with `source='hardcoded_fallback'`.
4. For every distinct cohort represented in the table, append a final row `code='OTHER', label='Other'` so every dropdown has the free-text escape hatch the PDF asks for (#20).

**Hardcoded fallback snapshot:** a one-shot script `apps/api/scripts/scrape-case-types/dump-hardcoded.ts` reads `SERVICE_CASE_TYPES` + `SUBCOURT_CASE_TYPES` from the current wizard source and writes `apps/api/data/case-types/hardcoded-snapshot.json`. After this snapshot is committed, the constants in `intake-wizard.tsx` are deleted. The snapshot file becomes the single source for the fallback rows.

## API

```
GET /case-types?courtLevel=<tier>&subCourt=<x>&district=<y>&highCourtCode=<z>
```

Handler:

1. Try the most-specific match first: `(courtLevel, subCourt, district, highCourtCode)`.
2. If empty, drop `district`, retry.
3. If empty, drop `subCourt`, retry.
4. If empty, drop `highCourtCode`, retry.
5. Returns `[{ code, label, source }]` ordered by `priority DESC, label ASC`.

Response always includes the `"Other"` row at the end when applicable.

## Wizard wire-up

In `apps/web/components/intake-wizard.tsx`:

- Delete `SERVICE_CASE_TYPES` and `SUBCOURT_CASE_TYPES`.
- Replace `selectedServiceCaseTypes` `useMemo` with a `useEffect` that calls the new endpoint whenever `(courtLevel, subCourt, district, highCourtCode)` change. Memoize results in a small in-component cache keyed by the query string.
- When the consumer picks `code === 'OTHER'`, reveal a follow-up text input `case_type_other`. Validation: required (non-empty after trim) when `case_type === 'OTHER'`.
- Payload stores both `case_type` (canonical code) and `case_type_other` (string, only when `case_type === 'OTHER'`).

## Backwards compatibility

Existing tickets carry their old display-string `case_type` values. They are not migrated; the wizard's read path renders `payload.case_type` as-is when the value doesn't match any code in the API response (so old "Bail Application (S)"-style strings still display on ticket detail pages). New tickets store canonical codes.

## Out of scope (explicit non-goals)

- Scrapers for LHC, PHC, BHC, FSC, Special Courts, and Lower Courts outside Punjab. These remain on the hardcoded fallback list.
- Admin UI to edit `CourtCaseType` rows. Edits via CLI / SQL until a future admin panel.
- Migrating historical ticket `case_type` strings to canonical codes.
- Automated scraper scheduling. Manual quarterly run.

## Risks

- **Government sites change without notice.** Mitigated by the per-scraper count floor + manual quarterly run + the hardcoded fallback always present as the last resort.
- **District names from DSJ Lahore may not exactly match our `GeoDistrict` rows.** The scraper normalizes (trim, title-case); seed records a `source_district` field if we need to reconcile later. (Out of scope for v1 — Punjab districts have consistent names across govt sources.)
- **"Other" with free text widens the data surface.** Staff workflow tools need to be aware that `case_type === 'OTHER'` means "look at `case_type_other`". Documented in the spec; staff portal updates land separately.
