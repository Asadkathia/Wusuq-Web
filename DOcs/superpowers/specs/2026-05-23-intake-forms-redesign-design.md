# Intake & Forms Redesign — Design Spec

- **Date:** 2026-05-23
- **Status:** Approved (design)
- **Scope:** Spec 1 of 3 in the larger intake/payment/clerk program. This spec
  covers **intake forms + the special-court catalogue only**. Checkout/pricing
  line-item changes, the payment-module redesign, and clerk-workflow changes are
  explicitly deferred to Spec 2 (payment) and Spec 3 (clerk).

## Context

The consumer intake wizard (`apps/web/components/intake-wizard.tsx`, flow
definitions in `apps/web/lib/intake-flows.ts`) renders 8 flows. Required-field
rules are a two-sided contract: the wizard's `requiredByCourtTier` and the
backend's `REQUIRED_FIELDS_BY_FLOW` + `REQUIRED_FIELDS_OPTIONAL_BY_TIER`
(`packages/shared`) **must agree** or the validator rejects on submit while the
wizard lets the user proceed (CLAUDE.md QA B6/B7).

Five changes are in scope. Each is described below with current state, target
state, and the files touched.

---

## 1. Unify the special-court catalogue across all cities

### Problem

The wizard's court dropdown is populated by `GET /geo/cities/:id/courts`
(`apps/api/src/geo/geo.service.ts:94`), which reads seeded `CourtSeat` rows. The
geo seeder builds those rows from two **per-city** maps in
`apps/api/src/geo/court-expansion.ts`:

- `SPECIAL_COURT_SUBCOURTS` — a different subset of special courts per city
  (Lahore ≈ 30, many cities 0 specialized).
- `BASELINE_SPECIAL_COURTS` — only 5 courts seeded for every other city.

Result: small cities show 5 special courts, large cities show ~30 → the
inconsistency. There is also **list drift**: the services catalogue
(`apps/api/src/services/services.service.ts:544`) holds 35 special courts with
different spellings ("Labor Courts", plural) than the expansion map (~30,
"Labour Court", singular).

### Decision

- **Scope:** the complete special-court list is shown for **every city** (user
  decision 2026-05-23).
- **Single source of truth:** one canonical `SPECIAL_COURTS` constant.

### Target state

- Add a canonical `SPECIAL_COURTS: string[]` constant (the complete 36-entry
  list below, normalized to the existing **singular** naming convention so it
  matches `court-alias.ts` matching) in `court-expansion.ts`.
- `services.service.ts` `svc_judicial_special_court.courts` **imports** that
  same constant instead of keeping its own divergent copy.
- The geo seeder creates a `CourtSeat` for **every special court × every
  `GeoCity`** (not just cities with a Special Court entry in
  `pakistan-courts.json` — that JSON gap is exactly why the 5-court baseline
  existed). The per-city Special Court branch in the JSON loop is removed and
  replaced by a single global loop over all cities. Retire
  `SPECIAL_COURT_SUBCOURTS` and `BASELINE_SPECIAL_COURTS`.
- Re-run `seed-geo`. `geo.service.courts()` and the wizard need **no change** —
  they already render whatever `CourtSeat` rows exist.

> Perf note: this seats `36 × (all cities)` `CourtSeat` rows. The existing
> `upsertSeat` helper is idempotent but issues per-row queries; for the bulk
> path a `createMany({ skipDuplicates: true })` is an optional optimization.
> Correctness first — it's a seed script run rarely.

### Canonical `SPECIAL_COURTS` list (36)

> Note: the user recalled "42"; the actual complete catalogue today is 36. The
> requirement is *uniformity* (same complete list everywhere), not a specific
> count. Final list is editable during spec review.

1. Accountability Court
2. Anti-Corruption Court
3. Anti-Terrorism Court
4. Anti-Dumping Appellate Tribunal
5. Appellate Tribunal Inland Revenue
6. Banking Court
7. Banking Muhtasib
8. Board of Revenue
9. Child Protection Court
10. Commercial Court
11. Competition Appellate Tribunal
12. Consumer Court
13. Customs Appellate Tribunal
14. Drug Court
15. Environmental Protection Tribunal
16. Election Tribunal
17. Federal Insurance Tribunal
18. Federal Ombudsman
19. Federal Service Tribunal
20. Federal Tax Ombudsman
21. Foreign Exchange Regulation Appellate Board
22. Income Tax Appellate Tribunal
23. Insurance Appellate Tribunal
24. Intellectual Property Tribunal
25. Labour Appellate Tribunal
26. Labour Court
27. Lahore Development Authority Tribunal
28. National Industrial Relations Commission (NIRC)
29. Pakistan Maritime Carriage Appellate Tribunal
30. Provincial Ombudsman
31. Provincial Service Tribunal
32. Special Court (Central)
33. Special Court (Control of Narcotic Substances)
34. Special Court (Customs, Taxation & Anti-Smuggling)
35. Special Court (Offences in Banks)
36. Special Court (Removal of Encroachment)

### Rejected alternatives

- **(B) Resolver injection** — make `geo.service.courts()` always return the
  full list regardless of seeded rows. Breaks the "geo/`CourtSeat` is
  authoritative" model, loses city/principal-seat association, and creates a
  hidden second source of truth. Rejected.
- **(C) Service-catalogue-driven** — frontend reads the flat service `courts`
  array for special courts. Diverges architecture between court tiers and loses
  city association. Rejected.

### Risks

- Row growth: `cities × ~36`. Acceptable — the geo seed already creates
  thousands of police-station and case-type rows. Seeder is idempotent.
- `court-alias.ts` may map old/variant spellings; verify aliases still resolve
  after normalization (implementation step).

---

## 2. Add `judge_name` to all intake forms — mandatory for lower court only

### Current state

`judge_name` (the judge's actual name, free text) exists only in Case Search,
Case Filing, and Power of Attorney. A separate field `judge_designation` (title)
is already required-for-lower in Case Files & Case Info. **User decision:** they
want **`judge_name`** (the name), not the designation.

### Scope decision — judicial flows only (recommended)

The user said "all intake forms," but a **presiding judge does not exist** for
the non-judicial flows: Copy of FIR (police station), Registry/Deed (sub-
registrar office), and Criminal Record Search (police CNIC lookup). Adding a
"Judge Name" field there is semantically wrong and would confuse consumers.

**Recommendation:** add `judge_name` only to the **judicial** flows that lack it
— **Case Files** and **Case Information** (Case Search, Filing, PoA already have
it). This satisfies "mandatory for lower court only" cleanly, since only
judicial flows carry a court tier. ⚠️ **Confirm during review** — if you really
want it on the police/registry forms too, we add it as optional there.

### Target state (judicial-only)

- Add a free-text `judge_name` field to **Case Files** and **Case Information**.
- On the field: `requiredByCourtTier: { lower: true, high: false, special:
  false, shariat: false, supreme: false, fcc: false }` — drives the `*` and the
  per-step validator.
- **Lock-step backend contract:**
  - Add `judge_name` (canonical) to `REQUIRED_FIELDS_BY_FLOW` for
    `judicial_case_files` and `judicial_case_information` in
    `apps/api/src/tickets/tickets.service.ts`.
  - Add `judge_name` to `REQUIRED_FIELDS_OPTIONAL_BY_TIER[flow][tier]` for every
    **non-lower** tier (high/special/shariat/supreme/fcc) so the backend only
    requires it for lower court — mirroring the wizard.
- No `PAYLOAD_FIELD_ALIASES` change needed — `judge_name` is already canonical in
  the 3 existing flows.

---

## 3. Case Information → pending only

### Current state

Case Info pulls `case_type` from `/case-types` and auto-sets
`case_status='Pending Case'` on submit (`intake-wizard.tsx`).

### Target state

- **Remove** the `case_type` picker (and `case_type_other`) from the Case
  Information flow in `intake-flows.ts`.
- Keep the existing auto-set of `case_status='Pending Case'` on submit.
- Drop `case_type` from Case Information's `REQUIRED_FIELDS_BY_FLOW` list (and
  any tier overrides referencing it for that flow).

---

## 4. Case date at the top — all flows

### Current state

Case Info has the date field last; Case Files/Search have it mid-step and
conditional. Non-judicial flows have a date field too.

### Target state

- Reorder the date field (`case_date`, plus the FIR/registry date variants) to
  be the **first field** of the case-details step in **every** flow that has one
  — judicial **and** non-judicial (user decision 2026-05-23).
- Preserve all existing `showWhen`/conditional logic and the
  `case_date_status`→`case_date` relationship; only the position changes.

---

## 5. Attested / Non-attested selection → Case Files only

### Current state

The `set_type` + quantity block (`SET_TYPE_WITH_QUANTITIES`) appears in Case
Files, Case Search, Copy of FIR, and Registry/Deed.

### Target state

- **Remove** the `set_type` block from **Case Search, Copy of FIR, Registry/
  Deed**. Keep it only in **Case Files**.
- Drop `set_type` / `sets` from those flows' `REQUIRED_FIELDS_BY_FLOW` lists.
- Pricing stays safe: those flows resolve with `setType=null` (per CLAUDE.md
  pricing notes); Case Search already had no set-type rules and `set_type` was
  `required: false` there.

> The removal of attested/non-attested *charges* from the checkout counter is a
> **Spec 2 (payment)** concern. Spec 1 only removes the *selection UI* from the
> non-case-files flows.

---

## Cross-cutting invariants

- Every required-field change updates **both** sides in the same change:
  wizard `requiredByCourtTier` **and** shared `REQUIRED_FIELDS_OPTIONAL_BY_TIER`
  + `REQUIRED_FIELDS_BY_FLOW`. (CLAUDE.md QA B6/B7.)
- Rebuild `packages/shared` after editing it so API and web pick up changes.
- Use **canonical** field names in `REQUIRED_FIELDS_BY_FLOW`; rely on
  `PAYLOAD_FIELD_ALIASES` for any alias.

## Testing

- Unit: extend `requiredFieldsFor()` tests for `judge_name` per tier (required
  for `lower`, dropped for all other tiers).
- Unit/integration: wizard per-step validator marks `judge_name` with `*` for a
  lower-court selection and not for high/special/etc.
- Backend: a lower-court Case Files submit **without** `judge_name` is rejected;
  a high-court submit without it succeeds.
- Manual: re-seed geo locally; confirm a small city (e.g. Sialkot) now lists the
  full special-court catalogue identical to Lahore.
- Manual: Case Information shows no case-type picker and submits as Pending.
- Manual: date field is first in every flow's case-details step.
- Regression: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Out of scope (deferred)

- Checkout/pricing line-item removal (attested/non-attested/delivery) → Spec 2.
- Payment-module redesign (bank details, screenshot upload, admin approval,
  two-phase split per flow) → Spec 2.
- Clerk-workflow changes (detail trim, intake-type bug, doc categories,
  multi-assign, next-hearing) → Spec 3.
- "Remove delivering to Lahore in TCS field" → Spec 2 (delivery/checkout). Note:
  the exact Lahore-in-TCS control was not located during exploration; to be
  pinpointed in Spec 2.
