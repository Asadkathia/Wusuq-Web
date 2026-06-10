# Case Information — document bundle folded into base fee

**Date:** 2026-06-09
**Status:** Approved (brainstorm), pending implementation
**Scope:** `judicial_case_information` flow only. No other flow changes.

## Problem

Case Information currently prices as `base fee (seeded PricingRule) + document-bundle add-on`
(`CASE_INFO_BUNDLE_SURCHARGE`), surfaced in checkout as two lines — **Base fee** and
**Document bundle** — plus an inline per-option price hint on the bundle picker.

The owner wants the document bundle's price to **be** the base fee for Case Information:
one **Base fee** line equal to the selected bundle's region-keyed price, no separate
"Document bundle" charge, and no inline price on the option labels.

## New rates (base fee = selected bundle price)

Region = the selected city's province. "Other" = every province except Punjab.

| Bundle (`required_documentations`)        | Punjab | Other |
|-------------------------------------------|-------:|------:|
| Only Petition (`doc_only_petition`)              | 500 | 1,200 |
| Petition + Last Order (`doc_petition_plus_last_order`)     | 700 | 1,500 |
| Petition + Complete Order (`doc_petition_plus_complete_order`) | 800 | 1,500 |
| Only Last Order (`doc_only_last_order`)            | 350 |   750 |
| Only Complete Order Sheet (`doc_only_complete_order_sheet`) | 500 | 1,200 |

Changes vs. current `CASE_INFO_BUNDLE_SURCHARGE`: Punjab Only Last Order 750→**350**,
Punjab Only Complete Order Sheet 1,500→**500**, Other Only Petition 750→**1,200**.

## Design

Repurpose the existing region-keyed bundle table as the **base price**, not an add-on.
The region-derivation (via `cityId`) and `docBundle` plumbing already exist in the
resolver and in `buildPricingResolveInput`, so the change is focused.

### 1. `packages/shared/src/index.ts`
- Rename `CASE_INFO_BUNDLE_SURCHARGE` → `CASE_INFO_BUNDLE_BASE`,
  `caseInfoBundleSurcharge()` → `caseInfoBundleBase()` (same signature
  `(flow, region, docBundle) => number`; returns 0 for non-Case-Info flows / no bundle).
- Set the new values above.

### 2. `apps/api/src/pricing/pricing.service.ts`
- For Case Information with a bundle selected: `basePrice = caseInfoBundleBase(region, bundle)`,
  **replacing** the seeded base. When no bundle is selected yet, fall back to the seeded
  base as a placeholder.
- Drop the separate `bundleSurcharge` add-on (becomes `0`); it is no longer summed into
  `serviceCost` / `perCityBlock` for Case Information.
- Non-Case-Info flows unchanged (`caseInfoBundleBase` returns 0 → seeded base preserved,
  `bundleSurcharge` stays 0 as before).

### 3. `apps/web/components/intake-wizard.tsx`
- Remove the **"Document bundle"** checkout line (`bundleSurcharge` is 0 for Case Info).
- Remove the inline per-option price hint on the `required_documentations` picker; show
  clean labels via `docBundleLabel` only. Drop the now-unused `CASE_INFO_BUNDLE_*` import.

### 4. `CLAUDE.md`
- Update the "Case Information pricing" note: base fee equals the region-keyed bundle
  price; there is no separate bundle add-on or "Document bundle" line.

## Invariants preserved
- Quote == persisted charge: both the live preview and `createIntakeTicket` resolve through
  the same `buildPricingResolveInput` → `/pricing-rules/resolve`, so the base fee is
  identical. (No hand-extracted resolve fields.)
- Region correctness: resolver derives region from `payload.city_id`; the live preview
  already passes `city_id`, so Punjab vs. Other is correct without the client-side hint.
- Case Information stays digital ONE_TIME: no delivery fee/charge; PDF surcharge (if
  selected) still shows and is billed at intake.

## Out of scope
- Other doc items (#2 Case Year on decided, #3 hide Decided tab, #6 Case Search per-year,
  #7 Case Search date style). Tracked separately.
- Case Files pricing (keeps base + set-type/attestation model).

## Review follow-ups (from code review)

- **Finding 1 (fixed):** `required_documentations` was not enforced server-side for
  Case Information, so a bundle-less submission (direct API / stale draft) would fall back
  to the seeded *placeholder* base and mischarge. Added `required_documentations` to
  `REQUIRED_FIELDS_BY_FLOW.judicial_case_information` (no tier marks it optional → required
  for all tiers, matching the wizard). Patched the 4 Case Information `createIntakeTicket`
  unit-test payloads to include a bundle.
- **Finding 2 (noted, out of scope):** the admin pricing board's Case Information *base-fee*
  column is now a placeholder — the real per-bundle prices live in the shared
  `CASE_INFO_BUNDLE_BASE` constant (as they already did when they were an add-on), so rate
  changes require a code deploy of `@wusuq/shared`, not an admin edit. Reworking the board
  to surface/edit the bundle table is a separate task if desired.

## Verification
- Typecheck + build; existing pricing smoke tests (`scripts/smoke-pricing.ts`) still pass.
- Live Chrome pass on Case Information: a Punjab city (e.g. Bahawalpur) and a non-Punjab
  city (e.g. Abbottabad), cycling each bundle — confirm Base fee + Total match the table
  and no "Document bundle" line appears.
