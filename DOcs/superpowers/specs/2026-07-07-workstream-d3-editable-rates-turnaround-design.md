# Workstream D3 — Editable Rate Screen + Turnaround — Design

**Date:** 2026-07-07
**Batch:** Owner walkthrough batch 2. Roadmap workstream **D**, final sub-chunk **D3** (D2 ✅ → D1 ✅ → D3). Grounded by the WS-D code trace + confirmation reads.
**Status:** Approved (design confirmed 2026-07-07: edit live rates in place; `turnaroundLabel` free-text shown to consumers; PricingController RBAC guard stays deferred as an accepted risk).

## Scope (C16)

Make the live pricing rate card **editable in place**, and add an editable **turnaround/"time"** label that consumers see at checkout.

## Grounding

- `PricingRule` (`schema.prisma`) has `basePrice`, `attestedPricePerSet`, `nonAttestedPricePerSet`, `deliveryCharge`, `isLegacy Boolean @default(false)`, `isActive`, `priority`, the 6-dim unique key — **no turnaround field**.
- `PricingSettings.pricingMode` defaults `'legacy'`; the resolver filters candidate rules by `settings.pricingMode === 'legacy' ? r.isLegacy === true : r.isLegacy === false` (`pricing.service.ts:232-234`). The live ~390-row rate card is `isLegacy:true`.
- Board `pricing-rules-board.tsx`: `isLegacyMode = settings.pricingMode === 'legacy'` (~407); add/edit/delete/toggle affordances are gated behind `{!isLegacyMode && …}` (~590 etc.) — so the live rows are read-only today. New rows POST with `isLegacy` defaulting false (`pricing.service.ts:101` reads `dto.isLegacy ?? false`).
- `resolve()` returns an object with `base`/`serviceCost`/`total`/`matched`/`availability` at 4 return sites (no-match ~471, unavailable ~496, USD-flat ~527, matched ~694). The wizard reads this as `pricingResult` and renders a checkout breakdown (`intake-wizard.tsx` ~1815+).
- `CreatePricingRuleDto`/`UpdatePricingRuleDto` carry the rule fields; `isLegacy` is accepted on create.
- Migration reality (CLAUDE.md): apply new migrations to Neon via `prisma db execute` + `migrate resolve --applied` (NOT `migrate dev`).

## Design

### C16a — edit live rates in place
- Remove the `isLegacyMode` **edit lock** on `pricing-rules-board.tsx` so an admin can **edit / add / toggle-active / delete** rows while in legacy mode (the affordances currently hidden by `{!isLegacyMode && …}`). Edits use the existing `PATCH /pricing-rules/:id`; the resolver reads `isLegacy:true` rows in legacy mode, so an edit to a live row takes effect immediately.
- **Correctness — new rows must land in the active set:** when the board creates a rule, stamp `isLegacy: isLegacyMode` (so a create in legacy mode → `isLegacy:true`, live; a create in custom mode → `isLegacy:false`). Editing an existing row preserves its `isLegacy` (PATCH doesn't change it). This prevents the "added a rule but it doesn't price anything" trap.
- Keep the mode toggle + custom mode working exactly as today (no regression to the legacy/custom split or the resolver filter).

### C16b — turnaround label
- Schema: add `turnaroundLabel String?` to `PricingRule` (nullable, no default). New migration dir `apps/api/prisma/migrations/20260707010000_add_pricingrule_turnaround/migration.sql` (`ALTER TABLE "PricingRule" ADD COLUMN "turnaroundLabel" TEXT;`). Update `schema.prisma`; `prisma generate`. Neon apply = deploy step.
- DTOs: `CreatePricingRuleDto` + `UpdatePricingRuleDto` gain `@IsOptional() @IsString() turnaroundLabel?: string`. `create`/`update` in `pricing.service.ts` persist it (they already spread the dto — verify it's included).
- Resolver: add `turnaroundLabel: best.turnaroundLabel ?? null` to the **matched** `resolve()` return (~694); `null` in the no-match/unavailable/USD-flat returns for shape consistency. (USD flat can also carry it from the matched USD rule if present — include `best.turnaroundLabel ?? null` there too.)
- Board: add a **"Turnaround"** text input to the rule form (`RuleFormFields`) + show it as a column/field per row, editable inline like the other fields.
- Wizard checkout: in the price breakdown (`intake-wizard.tsx`), when `pricingResult.turnaroundLabel` is present, render an **"Estimated turnaround: {label}"** line next to the total. Read-only display; no submit-body change.

### RBAC — deferred (accepted risk)
No `@RequirePermissions` added to `PricingController`. **Accepted risk (owner, 2026-07-07):** the `POST/PATCH/DELETE /pricing-rules` endpoints remain reachable by any authenticated user (incl. consumers) via direct API calls; only the portal route hides the UI. Making the screen writable raises the exposure (a consumer could rewrite the live price list); the owner has chosen to defer the guard. Tracked for a later hardening pass.

## Files

- `apps/api/prisma/schema.prisma` + new migration SQL — `turnaroundLabel`.
- `apps/api/src/pricing/dto/create-pricing-rule.dto.ts` + `update-pricing-rule.dto.ts` — turnaroundLabel field.
- `apps/api/src/pricing/pricing.service.ts` — persist turnaroundLabel (create/update) + return it from `resolve()` (matched + null elsewhere).
- `apps/web/components/pricing-rules-board.tsx` — remove legacy edit-lock; turnaround input; stamp `isLegacy: isLegacyMode` on create.
- `apps/web/components/intake-wizard.tsx` — checkout "Estimated turnaround" line.
- Tests below.

## Testing

- **API unit:** create + update a `PricingRule` round-trips `turnaroundLabel`; `resolve()` for a matched rule includes `turnaroundLabel` (and `null` when absent). (Reuse the existing pricing spec harness.)
- **Web:** the board renders the turnaround input + the edit/add controls in legacy mode (no `isLegacyMode` lock); a create in legacy mode sends `isLegacy:true`. The wizard checkout shows the turnaround line when present. (Node-env unit where feasible; e2e/`test.fixme` for deep flows as usual.)
- **Manual:** admin edits a live rate's base price + turnaround on `/settings/pricing` → the change takes effect on the next intake quote and the consumer checkout shows the turnaround; adding a new legacy rule prices correctly.

## Out of scope
- **Clone legacy→custom** (not chosen — in-place editing selected).
- **PricingController RBAC guard** (deferred — accepted risk).
- A broader visual redesign of the rate board beyond enabling editing + the turnaround field ("simpler" interpreted as "the live rates are now actually editable").
- Showing turnaround on the service-picker tiles (checkout only, where price shows) — can extend later if the owner wants it earlier in the flow.
- Re-seeding turnaround values into the ~390 rows (owner edits them on the board; seeds leave the column null).
