# Workstream F — Intake & Catalogue — Design

**Date:** 2026-07-07
**Batch:** Owner walkthrough batch 2. Roadmap workstream **F** (after A✅ B✅ C✅ D✅ E✅). Grounded by the WS-F code trace.
**Status:** Approved (2026-07-07) — scope B7 + B9 + C13; B7 = data retag + judge-by-category. **Deferred:** C17/C20 (unified geo-UX — needs a UX direction) + C19 (step reorder — needs the owner's separate video).

## Scope

- **B7** — fix the Family Court case-type miscategorization/duplication **and** differentiate judge designation by case category.
- **B9** — prefill the intake delivery address from the consumer's onboarding profile (stop re-asking).
- **C13** — collapse single-select `radio` groups to the chosen option once picked (the one holdout; other single-selects already collapse).

## Grounding (from the WS-F trace)

- **B7 data:** `apps/api/data/case-types/hardcoded-snapshot.json` (~260-277) hand-tags `"Application for Succession"` as `subCourt: "Family Court"`, but the codebase's own DSJ classifier says it's Civil (`scrape-case-types/dsj-subcourt-map.ts:48`: succession → `Civil Court`). The seed's cohort-dedup key (`seed-case-types.ts:117,121`) is `courtLevel|subCourt|region|highCourtCode` — **omits `district`** — so for non-Punjab districts (DSJ covers only Punjab), `findCaseTypes` attempt-2 drops `district`→null and matches all 3 hardcoded Family rows at once, surfacing "Application for Succession" beside Family/Guardianship. Re-seed = deploy step (needs DB).
- **B7 judge:** `JUDGE_DESIGNATIONS_BY_SERVICE` (`intake-wizard.tsx:43-64`) is keyed on `select_court` (subCourt name) — so Family Cases and Guardianship Cases both show the same `['Family Judge','Guardian Judge']`. A `'Guardian Court'` key already sits unused (anticipated but never wired to case-type). `judgeDesignationOptions` lookup at `intake-wizard.tsx:646-655`.
- **B9:** onboarding persists `User.address` (flat `String?`) via `auth.completeProfile`. The delivery-address step (`intake-flows.ts:700-705`, Case Files + Case Search TCS branch) is a `structured_address` (`{house, block, mainArea, city?}`, city pinned to the case city). **No prefill today** — the wizard's only profile fetch is `/users/:id` for currency (`intake-wizard.tsx:419-423`); it never reads `address`. `parseDeliveryAddress` (`intake-flows.ts:146-148`) already degrades a legacy plain string gracefully.
- **C13:** `CheckboxSingleField` (`intake-wizard/field-renderer.tsx:15-105`) already implements collapse-to-chip + "Change" (comment marks it as the #13 prior art). City picker (`service-geo-blocks.tsx:268-296`) + court/service picker (`intake-wizard.tsx:2276-2293`) also collapse. The **`radio`** branch (`field-renderer.tsx:343-402`) does NOT — it always renders every option button.

## Design

### B7 — retag + judge-by-category
- **Data:** in `hardcoded-snapshot.json`, **retag the `"Application for Succession"` row from `subCourt: "Family Court"` → `"Civil Court"`** (align with the DSJ classifier). Keep Family Cases + Guardianship Cases under Family Court. Re-run `seed-case-types.ts` (deploy step — document it; the JSON edit is committed, the re-seed runs against the DB at deploy). Do NOT change the dedup key (owner chose data+judge, not the seed-key fix — the retag removes the visible symptom; the dedup-key latent issue is noted for later).
- **Judge-by-category (FE):** add a `case_type`-keyed judge lookup consulted BEFORE the `select_court` fallback in `judgeDesignationOptions`: **Family Cases → `['Family Judge']`, Guardianship Cases → `['Guardian Judge']`, Other/unmapped → both** (the existing `['Family Judge','Guardian Judge']`). Match on the case-type label (substring: `/guardian/i` → Guardian Judge, `/family/i` → Family Judge) so it's robust to the exact code. Falls back to the current subCourt map when no case-type category matches. Additive, FE-only.

### B9 — delivery-address prefill
- On wizard mount for **consumer-authored intake** with a delivery-address step, fetch the consumer's saved profile `address` (verify `serializeUser`/`/users/:id` returns `address`; the currency fetch at `:419-423` may already carry it — reuse that response if so, else add the field to the fetch). When `delivery_address` is empty, **seed `delivery_address.house`** from `User.address` (single flat string → the `house` part; leave `block`/`mainArea` for the user, matching `parseDeliveryAddress`'s legacy-string degradation). Keep the field **editable** (TCS needs granular parts onboarding's flat string may not carry). City stays pinned to the case city (unchanged). Don't clobber a value the user already typed.

### C13 — collapse radio to the chosen option
- Extend the collapse-to-chip pattern to the `radio` field type in `field-renderer.tsx`: when a value is set and not `forceOpen`, render a chip (`labelFor(value)`) + a **"Change"** button (re-expands the grid); else render the option grid — mirroring `CheckboxSingleField`. Prefer **generalizing/reusing** `CheckboxSingleField`'s logic rather than duplicating (both are single-select-with-buttons). Verify no other single-select holdout remains (e.g. `tab`-type) — apply the same if trivially identical; otherwise note it. The collapse must NOT affect `showWhen`-dependent fields (the value is still set; only presentation collapses) — the "Change" path must keep working for fields like `case_status`/`delivery_mode` that gate others.

## Files

- `apps/api/data/case-types/hardcoded-snapshot.json` — B7 retag.
- `apps/web/components/intake-wizard.tsx` — B7 judge-by-category lookup + B9 prefill.
- `apps/web/components/intake-wizard/field-renderer.tsx` — C13 radio collapse.
- Tests as below (mostly web unit / lib where pure).

## Testing

- **B7:** a unit/assert that the seeded snapshot no longer has "Application for Succession" under Family Court (a data test or a `seed-case-types` cohort test if one exists); the judge lookup returns `['Family Judge']` for a Family-Cases case type, `['Guardian Judge']` for Guardianship, both otherwise (pure-fn unit if the lookup is extracted).
- **B9:** the prefill seeds `delivery_address.house` from the profile address when empty and does NOT overwrite a user-entered value (pure-fn/unit if extractable, else e2e/manual).
- **C13:** the radio field collapses to a chip once a value is set and re-expands on "Change" (component behavior — node-env limits apply; cover the pure `labelFor`/collapse-decision if extractable, else manual/e2e).
- **Manual:** Family Court intake shows Family/Guardianship (no Succession); picking Guardianship shows Guardian Judge; a consumer with a saved address sees it prefilled in the TCS delivery step (editable); picking a `case_status` radio collapses the others with a Change button.

## Build order
- **Task 1:** B7 data retag (JSON) — inline/small (+ note the re-seed deploy step).
- **Wave 1 (parallel):** Task 2 = B7 judge + B9 prefill (`intake-wizard.tsx`) ‖ Task 3 = C13 radio collapse (`field-renderer.tsx`). File-disjoint.

## Out of scope (deferred)
- **C17 + C20** — unified geo-UX (4 duplicated cascades; needs a UX-direction decision). Its own workstream later.
- **C19** — reorder two intake steps (needs the owner's separate video / which flow+steps).
- The **seed dedup-key** fix (district) — noted latent issue; owner chose the data retag instead.
- Structured/multi-part address decomposition on `User` (B9 seeds the flat string into `house`; no schema change).
