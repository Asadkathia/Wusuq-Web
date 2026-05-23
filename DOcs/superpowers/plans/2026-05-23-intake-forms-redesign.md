# Intake & Forms Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the special-court catalogue across all cities and apply five intake-form changes (judge name, Case Info pending-only, case date at top, attested-selection scoping).

**Architecture:** Two independent tracks that may run **in parallel** (they touch disjoint file sets). **Track A (Special Courts)** edits `apps/api/src/geo/*` + `apps/api/src/services/services.service.ts`. **Track B (Intake Forms)** edits `apps/web/lib/intake-flows.ts`, `packages/shared/src/index.ts`, and `apps/api/src/tickets/tickets.service.ts`. Within each track, tasks are **sequential** (they touch the same files). A final verification task runs after both tracks land.

**Tech Stack:** NestJS 11 + Prisma (api), Next.js 16 (web), TypeScript-only `@wusuq/shared`, Jest (api tests).

**Parallelization for execution:** Dispatch **one subagent for Track A** and **one for Track B** concurrently. Do **not** parallelize tasks *within* a track — B1→B2→B3→B4 edit the same two files and will clobber each other. After both tracks report done, run Task V (verification) once.

**Spec:** `DOcs/superpowers/specs/2026-05-23-intake-forms-redesign-design.md`

**Open review flags (confirm before/while executing):**
- `judge_name` is scoped to **judicial** flows only (Case Files + Case Info). If the user wants it on FIR/Registry/Criminal too, add it there as optional.
- Canonical special-court list = 36 entries (see Task A1). Editable.

---

## TRACK A — Special Courts (parallel-safe)

### Task A1: Canonical `SPECIAL_COURTS` constant + single source of truth

**Files:**
- Modify: `apps/api/src/geo/court-expansion.ts` (add constant)
- Modify: `apps/api/src/services/services.service.ts:544-581` (import the constant instead of an inline copy)

- [ ] **Step 1: Add the canonical constant to `court-expansion.ts`**

Add this export near the top of `apps/api/src/geo/court-expansion.ts` (after the `SubCourt` type, before `LOWER_COURT_SUBCOURTS`):

```typescript
/**
 * Canonical, complete special-court catalogue (single source of truth).
 *
 * 2026-05-23: special courts are now UNIFIED — every city exposes this exact
 * list (see DOcs/superpowers/specs/2026-05-23-intake-forms-redesign-design.md).
 * This replaces the old per-city SPECIAL_COURT_SUBCOURTS subset map and the
 * 5-court BASELINE_SPECIAL_COURTS fallback. Naming is singular to match
 * court-alias.ts. Both the geo seeder and the services catalogue import this.
 */
export const SPECIAL_COURTS: string[] = [
  'Accountability Court',
  'Anti-Corruption Court',
  'Anti-Terrorism Court',
  'Anti-Dumping Appellate Tribunal',
  'Appellate Tribunal Inland Revenue',
  'Banking Court',
  'Banking Muhtasib',
  'Board of Revenue',
  'Child Protection Court',
  'Commercial Court',
  'Competition Appellate Tribunal',
  'Consumer Court',
  'Customs Appellate Tribunal',
  'Drug Court',
  'Environmental Protection Tribunal',
  'Election Tribunal',
  'Federal Insurance Tribunal',
  'Federal Ombudsman',
  'Federal Service Tribunal',
  'Federal Tax Ombudsman',
  'Foreign Exchange Regulation Appellate Board',
  'Income Tax Appellate Tribunal',
  'Insurance Appellate Tribunal',
  'Intellectual Property Tribunal',
  'Labour Appellate Tribunal',
  'Labour Court',
  'Lahore Development Authority Tribunal',
  'National Industrial Relations Commission (NIRC)',
  'Pakistan Maritime Carriage Appellate Tribunal',
  'Provincial Ombudsman',
  'Provincial Service Tribunal',
  'Special Court (Central)',
  'Special Court (Control of Narcotic Substances)',
  'Special Court (Customs, Taxation & Anti-Smuggling)',
  'Special Court (Offences in Banks)',
  'Special Court (Removal of Encroachment)',
];
```

- [ ] **Step 2: Point the services catalogue at the constant**

In `apps/api/src/services/services.service.ts`, add the import near the other imports at the top:

```typescript
import { SPECIAL_COURTS } from '../geo/court-expansion';
```

Then replace the inline `courts: [ ...35 strings... ]` array of the `svc_judicial_special_court` entry (currently `services.service.ts:544-581`) with:

```typescript
    courts: [...SPECIAL_COURTS],
```

- [ ] **Step 3: Typecheck the api package**

Run: `cd apps/api && pnpm typecheck`
Expected: PASS (no missing-import or type errors).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/geo/court-expansion.ts apps/api/src/services/services.service.ts
git commit -m "refactor(geo): add canonical SPECIAL_COURTS list as single source of truth"
```

---

### Task A2: Seed the full special-court list on every city

**Files:**
- Modify: `apps/api/src/geo/geo.service.ts` (Special Court branch in `seedCourtsFromJson`, ~lines 542-561; add global all-cities loop after the JSON loop; update imports)
- Modify: `apps/api/src/geo/court-expansion.ts` (delete the retired `SPECIAL_COURT_SUBCOURTS` and `BASELINE_SPECIAL_COURTS` exports)

- [ ] **Step 1: Confirm no other references to the retired maps**

Run: `grep -rnE "SPECIAL_COURT_SUBCOURTS|BASELINE_SPECIAL_COURTS" apps/api/src --include="*.ts" | grep -v court-expansion.ts`
Expected: only `apps/api/src/geo/geo.service.ts` appears (the seeder). If anything else appears, update it in this task too.

- [ ] **Step 2: Skip Special Court in the per-city JSON loop**

In `apps/api/src/geo/geo.service.ts`, replace the `else if (courtType === 'Special Court') { ... }` block (currently lines 542-561, the BASELINE loop + the SPECIAL_COURT_SUBCOURTS subset loop) with this skip:

```typescript
              } else if (courtType === 'Special Court') {
                // 2026-05-23: special courts are unified across ALL cities, so
                // they're seated by the global loop after this JSON walk — not
                // per JSON entry. Skip here to avoid double work.
                continue;
              } else {
```

(Keep the existing `else { ... }` body that follows — only the `else if (courtType === 'Special Court')` block changes.)

- [ ] **Step 3: Add the global all-cities special-court loop**

In `apps/api/src/geo/geo.service.ts`, immediately AFTER the `LOWER_COURT_ONLY_TEHSILS` loop and BEFORE the `for (const [province, cities] of unresolved.entries())` warnings loop (currently ~line 586-587), insert:

```typescript
    // 2026-05-23 unified special courts: every GeoCity exposes the full
    // canonical catalogue. Seat all SPECIAL_COURTS on every city (idempotent).
    const allCities = await this.prisma.geoCity.findMany({
      select: { id: true },
    });
    for (const subName of SPECIAL_COURTS) {
      const court = await getOrCreateCourt('Special Court', subName);
      for (const c of allCities) {
        await upsertSeat(court.id, c.id, false);
      }
    }
```

- [ ] **Step 4: Update geo.service.ts imports**

In `apps/api/src/geo/geo.service.ts`, find the import from `./court-expansion` and replace `SPECIAL_COURT_SUBCOURTS` / `BASELINE_SPECIAL_COURTS` with `SPECIAL_COURTS`. The remaining used names (`LOWER_COURT_SUBCOURTS`, `LOWER_COURT_ONLY_TEHSILS`, etc.) stay. Example result:

```typescript
import {
  LOWER_COURT_SUBCOURTS,
  LOWER_COURT_ONLY_TEHSILS,
  SPECIAL_COURTS,
} from './court-expansion';
```

(Match the actual existing import list — only swap the two retired names for `SPECIAL_COURTS`; do not drop names that are still used elsewhere in the file.)

- [ ] **Step 5: Delete the retired maps from court-expansion.ts**

In `apps/api/src/geo/court-expansion.ts`, delete the entire `BASELINE_SPECIAL_COURTS` export (and its doc comment) and the entire `SPECIAL_COURT_SUBCOURTS` export (and its doc comment).

- [ ] **Step 6: Typecheck**

Run: `cd apps/api && pnpm typecheck`
Expected: PASS. (If it fails with "SPECIAL_COURT_SUBCOURTS is not exported", a reference was missed in Step 1 — fix it.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/geo/geo.service.ts apps/api/src/geo/court-expansion.ts
git commit -m "feat(geo): seat the full special-court catalogue on every city"
```

---

### Task A3: Re-seed geo and verify uniformity (manual run)

**Files:** none (operational).

- [ ] **Step 1: Re-run the geo seed**

Run: `cd apps/api && npx ts-node --esm scripts/seed-geo.ts`
Expected: completes without errors; logs created court/seat counts. (Idempotent — safe to re-run.)

- [ ] **Step 2: Verify a small city now lists the full catalogue**

Pick a small city's id and hit the courts endpoint (replace `<CITY_ID>` with a small city such as Sialkot or Abbottabad — find one via `GET /geo/cities`):

Run: `curl -s "http://localhost:4000/api/geo/cities/<CITY_ID>/courts" | grep -c '"name"'` after starting the api (`pnpm dev:api`).
Expected: the "Special Court" group contains all 36 entries from `SPECIAL_COURTS`, identical to a large city like Lahore.

- [ ] **Step 3: No commit** (operational verification only).

---

## TRACK B — Intake Forms (parallel-safe vs Track A; sequential within)

### Task B1: Add `judge_name` to Case Files + Case Info (lower-court mandatory)

**Files:**
- Modify: `apps/web/lib/intake-flows.ts` (Case Files Case-Details step ~after line 628; Case Info Case-Details step ~after line 788)
- Modify: `apps/api/src/tickets/tickets.service.ts` (`REQUIRED_FIELDS_BY_FLOW`, lines 45-66)
- Modify: `packages/shared/src/index.ts` (`REQUIRED_FIELDS_OPTIONAL_BY_TIER`, lines 182-198)
- Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write the failing backend tests**

Add to `apps/api/src/tickets/tickets.service.spec.ts` inside a new `describe('judge_name lower-court requirement', ...)` block. These call `validateFlowPayload` indirectly via `createIntakeTicket`; if the spec already has a `validateFlowPayload` test harness, mirror it. Minimal direct approach using the existing service instance pattern in that file:

```typescript
describe('judge_name lower-court requirement', () => {
  // Reuse whatever harness the file already uses to construct TicketsService.
  // The key assertions:
  it('requires judge_name for a LOWER-court Case Files submit', () => {
    const base = REQUIRED_FIELDS_BY_FLOW_TEST.judicial_case_files; // see note
    const required = requiredFieldsFor('judicial_case_files', base, 'lower');
    expect(required).toContain('judge_name');
  });

  it('does NOT require judge_name for a HIGH-court Case Files submit', () => {
    const base = REQUIRED_FIELDS_BY_FLOW_TEST.judicial_case_files;
    const required = requiredFieldsFor('judicial_case_files', base, 'high');
    expect(required).not.toContain('judge_name');
  });
});
```

Note: `REQUIRED_FIELDS_BY_FLOW` is module-private in `tickets.service.ts`. For the test, either (a) export it for testing, or (b) inline the expected base list in the test. Prefer (b) — inline the base list literal that includes `judge_name` so the test is self-contained:

```typescript
import { requiredFieldsFor } from '@wusuq/shared';

const CASE_FILES_BASE = [
  'select_service', 'select_court', 'select_court_city', 'case_petition_no',
  'case_year', 'case_type', 'case_status', 'case_title', 'sets', 'set_type',
  'delivery_mode', 'judge_name',
];

describe('judge_name lower-court requirement', () => {
  it('requires judge_name for LOWER tier', () => {
    expect(requiredFieldsFor('judicial_case_files', CASE_FILES_BASE, 'lower'))
      .toContain('judge_name');
  });
  it('drops judge_name for HIGH tier', () => {
    expect(requiredFieldsFor('judicial_case_files', CASE_FILES_BASE, 'high'))
      .not.toContain('judge_name');
  });
});
```

- [ ] **Step 2: Run the tests to verify they FAIL**

Run: `cd apps/api && pnpm test src/tickets/tickets.service.spec.ts`
Expected: the HIGH-tier test FAILS (judge_name not yet dropped for high in `REQUIRED_FIELDS_OPTIONAL_BY_TIER`).

- [ ] **Step 3: Add `judge_name` drops to shared per-tier map**

In `packages/shared/src/index.ts`, update `REQUIRED_FIELDS_OPTIONAL_BY_TIER.judicial_case_files` and `.judicial_case_information` so every NON-lower tier drops `judge_name` (lower keeps it required). Result:

```typescript
  judicial_case_files: {
    lower:   ['case_petition_no', 'case_year', 'case_type'],
    high:    ['case_year', 'case_type', 'judge_name'],
    special: ['case_petition_no', 'judge_name'],
    shariat: ['case_year', 'case_type', 'judge_name'],
    supreme: ['case_year', 'case_type', 'case_title', 'judge_name'],
    fcc:     ['case_year', 'case_type', 'case_title', 'judge_name'],
  },
  judicial_case_information: {
    lower:   ['case_petition_no', 'case_year', 'case_type'],
    high:    ['case_year', 'case_type', 'judge_name'],
    special: ['case_petition_no', 'judge_name'],
    shariat: ['case_year', 'case_type', 'judge_name'],
    supreme: ['case_year', 'case_type', 'judge_name'],
    fcc:     ['case_year', 'case_type', 'judge_name'],
  },
```

- [ ] **Step 4: Add `judge_name` to the backend base required lists**

In `apps/api/src/tickets/tickets.service.ts`, add `'judge_name'` to `REQUIRED_FIELDS_BY_FLOW.judicial_case_files` (after `'case_title'`) and to `REQUIRED_FIELDS_BY_FLOW.judicial_case_information` (after `'case_title'`):

```typescript
  judicial_case_files: [
    'select_service', 'select_court', 'select_court_city', 'case_petition_no',
    'case_year', 'case_type', 'case_status', 'case_title', 'judge_name',
    'sets', 'set_type', 'delivery_mode',
  ],
  judicial_case_information: [
    'select_service', 'select_court', 'select_court_city', 'case_petition_no',
    'case_year', 'case_type', 'case_title', 'judge_name',
  ],
```

- [ ] **Step 5: Rebuild shared, run tests to verify they PASS**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test src/tickets/tickets.service.spec.ts`
Expected: PASS (both judge_name tests green; existing tests still green).

- [ ] **Step 6: Add the `judge_name` field to the wizard (Case Files)**

In `apps/web/lib/intake-flows.ts`, in the Case Files "Case Details" step, add this field object immediately AFTER the `judge_designation` field (after line 628):

```typescript
      {
        key: 'judge_name',
        label: 'Judge Name',
        type: 'text',
        required: true,
        // 2026-05-23: judge_name mandatory for Lower Court only.
        requiredByCourtTier: { lower: true, high: false, special: false, shariat: false, supreme: false, fcc: false },
        hint: 'Name of the presiding judge — match the most recent order sheet.',
      },
```

- [ ] **Step 7: Add the `judge_name` field to the wizard (Case Info)**

In the Case Information "Case Details" step, add the SAME field object immediately AFTER the `judge_designation` field (after line 788):

```typescript
      {
        key: 'judge_name',
        label: 'Judge Name',
        type: 'text',
        required: true,
        requiredByCourtTier: { lower: true, high: false, special: false, shariat: false, supreme: false, fcc: false },
        hint: 'Name of the presiding judge — match the most recent order sheet.',
      },
```

- [ ] **Step 8: Typecheck web**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/intake-flows.ts apps/api/src/tickets/tickets.service.ts packages/shared/src/index.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(intake): add judge_name to Case Files & Case Info, mandatory for lower court"
```

---

### Task B2: Case Information → pending only (remove case-type picker)

**Files:**
- Modify: `apps/web/lib/intake-flows.ts` (Case Info Case-Details step, lines 717-737 — remove `case_type` + `case_type_other`)
- Modify: `apps/api/src/tickets/tickets.service.ts` (`REQUIRED_FIELDS_BY_FLOW.judicial_case_information` — drop `case_type`)
- Modify: `packages/shared/src/index.ts` (`REQUIRED_FIELDS_OPTIONAL_BY_TIER.judicial_case_information` — remove now-dead `case_type` drops)
- Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `tickets.service.spec.ts`:

```typescript
const CASE_INFO_BASE_AFTER = [
  'select_service', 'select_court', 'select_court_city', 'case_petition_no',
  'case_year', 'case_title', 'judge_name',
]; // note: NO case_type

describe('Case Information is pending-only (no case_type)', () => {
  it('does not require case_type at any tier', () => {
    for (const tier of ['lower','high','special','shariat','supreme','fcc'] as const) {
      expect(requiredFieldsFor('judicial_case_information', CASE_INFO_BASE_AFTER, tier))
        .not.toContain('case_type');
    }
  });
});
```

- [ ] **Step 2: Run to verify it PASSES already for the literal** (this test guards the base list shape; it passes once Step 3 removes case_type from the real base). Run it now to confirm the literal is consistent:

Run: `cd apps/api && pnpm test src/tickets/tickets.service.spec.ts`
Expected: PASS for this block (it tests the literal `CASE_INFO_BASE_AFTER`, which already omits case_type). This is a guard against re-adding case_type.

- [ ] **Step 3: Remove `case_type` from the backend base required list**

In `apps/api/src/tickets/tickets.service.ts`, `REQUIRED_FIELDS_BY_FLOW.judicial_case_information`: delete the `'case_type',` line. Result:

```typescript
  judicial_case_information: [
    'select_service', 'select_court', 'select_court_city', 'case_petition_no',
    'case_year', 'case_title', 'judge_name',
  ],
```

- [ ] **Step 4: Clean dead `case_type` drops in shared**

In `packages/shared/src/index.ts`, `REQUIRED_FIELDS_OPTIONAL_BY_TIER.judicial_case_information`: remove `'case_type'` from each tier array (it's now a no-op since case_type isn't in the base list). Keep the `case_petition_no` / `case_year` / `judge_name` drops. Result:

```typescript
  judicial_case_information: {
    lower:   ['case_petition_no', 'case_year'],
    high:    ['case_year', 'judge_name'],
    special: ['case_petition_no', 'judge_name'],
    shariat: ['case_year', 'judge_name'],
    supreme: ['case_year', 'judge_name'],
    fcc:     ['case_year', 'judge_name'],
  },
```

- [ ] **Step 5: Remove the `case_type` + `case_type_other` fields from the Case Info wizard**

In `apps/web/lib/intake-flows.ts`, Case Information "Case Details" step: delete the `case_type` field object (lines 717-728) AND the `case_type_other` field object (lines 730-737). The step now starts (after reorder in B3) with the remaining fields (`case_no`, `year`, `case_title`, `bench`, `judge_designation`, `judge_name`, `case_date`).

- [ ] **Step 6: Rebuild shared, typecheck, test**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm typecheck && pnpm test src/tickets/tickets.service.spec.ts && cd ../web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/intake-flows.ts apps/api/src/tickets/tickets.service.ts packages/shared/src/index.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(intake): Case Information is pending-only, drop case-type picker"
```

---

### Task B3: Case date at the top — all flows that have a date field

**Files:**
- Modify: `apps/web/lib/intake-flows.ts` (Case Files, Case Info, Case Search, Copy of FIR, Registry/Deed)

> Reorder only — move the existing `case_date` field object to be the **first**
> field of its case-details step. Do not change its `showWhen`/`type`/`hint`.
> Criminal Record Search has no date field — skip it.

- [ ] **Step 1: Case Files** — move the `case_date` field object (currently lines 636-641, `label: 'Previous Case Date'`) to be the FIRST entry in the Case Files "Case Details" step's `fields` array (before `case_status`). Keep `case_date_status` where it is.

- [ ] **Step 2: Case Information** — move the `case_date` field object (currently lines 790-794) to be the FIRST entry in the Case Info "Case Details" step's `fields` array (before `case_no`).

- [ ] **Step 3: Case Search** — move the `case_date` field object (currently lines 938-944, `showWhen` Pending/Unknown) to be the FIRST entry in the Case Search "Case Details" tab fields (before `case_status`). Preserve its `showWhen`.

- [ ] **Step 4: Power of Attorney** — move the `case_date` field object (currently line 1215) to be the FIRST entry of the PoA "Case Details" step's `fields` array. Preserve its `showWhen`.

- [ ] **Step 5: Copy of FIR** — move the `case_date` field object (currently line 1315, in the "Request Details" step) to the FIRST position of that step's `fields` array (before `fir_no` at line 1286). Move its paired `date_unknow` field (line 1322) to immediately follow `case_date` so the "date unknown" toggle stays adjacent.

- [ ] **Step 6: Registry/Deed** — move the `case_date` field object (currently line 1424, in the "Case Particulars" step) to the FIRST position of that step's `fields` array (before `doc_no` at line 1414). Move its paired `date_unknow` field (line 1430) to immediately follow `case_date`.

- [ ] **Step 7: Case Filing (dual-date — confirm intent)** — Case Filing has TWO date fields: a `case_date` (line 1101, "Previous Case Date", shown for Pending cases) and a second `case_date` (line 1112, "Date of Institution", shown for New cases). Move the **Pending-case `case_date` (1101)** to the FIRST position of the "Case Details" step, preserving its `showWhen`. Leave the New-case "Date of Institution" (1112) in place. ⚠️ If the user prefers the institution date at top for new filings, flag and adjust.

- [ ] **Step 8: Typecheck web**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/intake-flows.ts
git commit -m "feat(intake): move case date to the top of every flow's details step"
```

---

### Task B4: Attested/non-attested selection → Case Files only

**Files:**
- Modify: `apps/web/lib/intake-flows.ts` (remove `SET_TYPE_WITH_QUANTITIES` spread from Case Search line 970-972, FIR line 1384, Registry line 1453)
- Modify: `apps/api/src/tickets/tickets.service.ts` (drop `sets`/`set_type` from `judicial_case_search`, `non_judicial_copy_of_fir`, `non_judicial_registry_deed` base required lists)

- [ ] **Step 1: Remove set_type block from Case Search**

In `apps/web/lib/intake-flows.ts`, Case Search "Required Documents" step, delete the spread (lines 970-972):

```typescript
      ...SET_TYPE_WITH_QUANTITIES.map((f) =>
        f.key === 'set_type' ? { ...f, required: false } : f,
      ),
```

- [ ] **Step 2: Remove set_type block from Copy of FIR**

In the Copy of FIR "Required Documents & Others" step, delete the `...SET_TYPE_WITH_QUANTITIES,` spread (line 1384).

- [ ] **Step 3: Remove set_type block from Registry/Deed**

In the Registry/Deed "Required Documents & Others" step, delete the `...SET_TYPE_WITH_QUANTITIES,` spread (line 1453).

- [ ] **Step 4: Drop sets/set_type from backend required lists**

In `apps/api/src/tickets/tickets.service.ts` `REQUIRED_FIELDS_BY_FLOW`, remove `'sets'` and `'set_type'` from `judicial_case_search`, `non_judicial_copy_of_fir`, and `non_judicial_registry_deed`. Results:

```typescript
  judicial_case_search: [
    'select_service', 'select_court', 'select_court_city', 'case_petition_no',
    'case_year', 'case_type', 'case_status', 'case_title', 'delivery_mode',
  ],
  non_judicial_copy_of_fir: [
    'province', 'district_id', 'fir_no', 'year', 'offence', 'case_title',
    'city_type', 'delivery_mode',
  ],
  non_judicial_registry_deed: [
    'office_name', 'city', 'city_type', 'doc_no', 'year', 'case_title',
    'delivery_mode',
  ],
```

- [ ] **Step 5: Typecheck both packages**

Run: `cd apps/api && pnpm typecheck && cd ../web && pnpm typecheck`
Expected: PASS. (If `SET_TYPE_WITH_QUANTITIES` is now unused, leave it — Case Files still uses it at line 660.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/intake-flows.ts apps/api/src/tickets/tickets.service.ts
git commit -m "feat(intake): restrict attested/non-attested selection to Case Files only"
```

---

## Task V — Full verification (run AFTER both tracks complete)

**Files:** none (verification).

- [ ] **Step 1: Build shared, then lint + typecheck + tests across the repo**

Run: `pnpm --filter @wusuq/shared build && pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS. (Pre-existing `wallet.service.spec.ts` jest-mock typing errors are unrelated to this work — confirm no NEW failures appear in geo/tickets/intake areas.)

- [ ] **Step 2: Manual smoke (api + web running)**

- Case Information form shows **no** case-type picker; submitting works and records `case_status='Pending Case'`.
- Case Files & Case Info show a **Judge Name** field with a `*` for a Lower-Court selection; no `*` for High Court. Submitting a Lower-Court Case Files without judge name is rejected; High Court succeeds.
- The date field is the **first** field of the details step in Case Files, Case Info, Case Search, FIR, Registry.
- Case Search / FIR / Registry no longer show the attested/non-attested set-type picker; Case Files still does.
- A small city (e.g. Sialkot) lists the full 36-court special-court catalogue, identical to Lahore.

- [ ] **Step 3: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "test(intake): verification fixups for intake & forms redesign"
```

---

## Self-review notes (author)

- **Spec coverage:** §1 special courts → A1–A3; §2 judge_name → B1; §3 Case Info pending → B2; §4 case date top → B3; §5 attested scoping → B4. All five covered. Checkout/payment/clerk items are explicitly out of scope (later specs).
- **Lock-step invariant:** B1/B2/B4 each update the wizard, `REQUIRED_FIELDS_BY_FLOW`, and `REQUIRED_FIELDS_OPTIONAL_BY_TIER` together — satisfies the CLAUDE.md QA B6/B7 rule.
- **Parallelism:** Track A and Track B touch disjoint files → safe to run as two concurrent subagents. Within a track, tasks share files → must stay sequential.
