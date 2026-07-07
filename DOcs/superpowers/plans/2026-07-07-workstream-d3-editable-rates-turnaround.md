# Workstream D3 — Editable Rate Screen + Turnaround — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit the live pricing rates in place and add an editable turnaround label that consumers see at checkout.

**Architecture:** One nullable-column migration + a `turnaroundLabel` threaded through the pricing DTOs, service persistence, and the `resolve()` result; plus removing the board's legacy-mode edit-lock (with an `isLegacy` stamp on create) and a read-only turnaround line in the wizard checkout. No change to the resolver's rule-matching or the money model.

**Tech Stack:** NestJS/Prisma (`apps/api`), Next.js 16/React 19 (`apps/web`); Jest. Migration applied to Neon via `db execute` + `migrate resolve` (deploy step), NOT `migrate dev`.

**Spec:** `DOcs/superpowers/specs/2026-07-07-workstream-d3-editable-rates-turnaround-design.md`.

## Global Constraints

- **In-place editing:** remove the `{!isLegacyMode && …}` edit-lock so the live `isLegacy:true` rows are editable/addable/deletable/toggleable. Do NOT change the resolver's `isLegacy === (pricingMode==='legacy')` filter or the mode toggle.
- **Create stamps isLegacy:** a rule created from the board must send `isLegacy: isLegacyMode` (legacy mode → `isLegacy:true`, live). Editing preserves the existing `isLegacy`.
- **Turnaround:** `turnaroundLabel String?` (nullable, no default) on `PricingRule`; free-text; surfaced to consumers at checkout. `resolve()` returns `turnaroundLabel` (from the matched rule; `null` otherwise). No change to price math.
- **RBAC deferred (accepted risk):** do NOT add `@RequirePermissions` to `PricingController`.
- **Migration:** committed SQL only; run `prisma generate` after editing `schema.prisma`; do NOT run `migrate dev` (Neon).
- Run `pnpm typecheck` + `pnpm lint` (both apps) + relevant tests before each commit. Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Modify** `apps/api/prisma/schema.prisma` + **create** `apps/api/prisma/migrations/20260707010000_add_pricingrule_turnaround/migration.sql`.
- **Modify** `apps/api/src/pricing/dto/create-pricing-rule.dto.ts` + `update-pricing-rule.dto.ts`.
- **Modify** `apps/api/src/pricing/pricing.service.ts` — persist + return `turnaroundLabel`.
- **Modify** `apps/web/components/pricing-rules-board.tsx` — remove edit-lock, turnaround input, `isLegacy` stamp.
- **Modify** `apps/web/components/intake-wizard.tsx` — checkout turnaround line.
- Tests below.

Task 1 (schema) is foundation. Task 2 (backend DTO/service) is one agent. Tasks 3 (board) + 4 (wizard) are file-disjoint frontend → parallel after backend merges.

---

### Task 1: Schema — `turnaroundLabel` column

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`PricingRule`, near `priority`/`isActive`)
- Create: `apps/api/prisma/migrations/20260707010000_add_pricingrule_turnaround/migration.sql`

- [ ] **Step 1:** Add to `PricingRule`:

```prisma
  turnaroundLabel        String?
```

- [ ] **Step 2:** Migration SQL:

```sql
-- add_pricingrule_turnaround
ALTER TABLE "PricingRule" ADD COLUMN "turnaroundLabel" TEXT;
```

- [ ] **Step 3:** `cd apps/api && pnpm prisma:generate` (no error).
- [ ] **Step 4:** `cd apps/api && pnpm typecheck` (clean).
- [ ] **Step 5:** Commit — `feat(db): add turnaroundLabel to PricingRule (C16)`.

---

### Task 2: Backend — DTOs + persist + resolve returns turnaroundLabel

**Files:**
- Modify: `apps/api/src/pricing/dto/create-pricing-rule.dto.ts` + `update-pricing-rule.dto.ts`
- Modify: `apps/api/src/pricing/pricing.service.ts` (`create`, `update`, `resolve`)
- Test: `apps/api/src/pricing/pricing-turnaround.spec.ts` (new) — or extend an existing pricing spec

**Interfaces:**
- Produces: `resolve()` result includes `turnaroundLabel: string | null`.

- [ ] **Step 1:** Add `@IsOptional() @IsString() turnaroundLabel?: string;` to `CreatePricingRuleDto`. Confirm `UpdatePricingRuleDto` inherits it (it likely `PartialType(CreatePricingRuleDto)` — if so, no change needed; if it lists fields explicitly, add it there too — read the file).
- [ ] **Step 2:** Ensure `create`/`update` persist it. Read `pricing.service.ts` `create`/`update` — if they spread the dto into `data`, `turnaroundLabel` flows automatically; if they enumerate fields, add `turnaroundLabel: dto.turnaroundLabel`.
- [ ] **Step 3: Write the failing test** — create a rule with `turnaroundLabel: '3–5 working days'`, resolve a matching context, assert the resolve result's `turnaroundLabel === '3–5 working days'`; a rule with no label resolves `turnaroundLabel: null`. (Read an existing pricing spec for the harness + how to drive `resolve()`.)
- [ ] **Step 4: Run → FAIL** (`cd apps/api && pnpm test -- --testPathPatterns=pricing-turnaround`).
- [ ] **Step 5: Implement** — in `resolve()`, add `turnaroundLabel: best.turnaroundLabel ?? null` to the **matched** return (~694) and the **USD-flat** matched return (~527, from its matched rule); add `turnaroundLabel: null` to the no-match (~471) and unavailable (~496) returns for shape consistency. Update the resolve result's TS type/interface if one is declared.
- [ ] **Step 6: Run → PASS**, full API suite, `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 7: Commit** — `feat(pricing): persist + resolve turnaroundLabel (C16)`.

---

### Task 3: Board — in-place editing + turnaround input

**Files:**
- Modify: `apps/web/components/pricing-rules-board.tsx`

- [ ] **Step 1: Remove the legacy edit-lock** — find every `{!isLegacyMode && …}` (and any `disabled={isLegacyMode}` / `isLegacyMode ? … : …`) that hides or disables Add / Edit / Delete / Active-toggle affordances (~590, 746-750, 852-853, 878, 903, 972-983, 1003 per the trace) and make those controls available in legacy mode too. Keep the mode toggle + the `filter by isLegacyMode` (which rows are shown) unchanged — only the *edit affordances* get unlocked.
- [ ] **Step 2: Stamp isLegacy on create** — where the board POSTs a new rule (`POST /pricing-rules`), include `isLegacy: isLegacyMode` in the body so a create in legacy mode lands as a live `isLegacy:true` row. (Edit/PATCH must NOT send isLegacy — preserve the row's existing value.)
- [ ] **Step 3: Turnaround input** — add a **"Turnaround"** text input to the rule form (`RuleFormFields`) bound to `turnaroundLabel`, and surface it per row (a column or an inline field) editable like the other fields. Include `turnaroundLabel` in the create + update payloads and the form state.
- [ ] **Step 4: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`).
- [ ] **Step 5: Commit** — `feat(web): editable live rates in place + turnaround field on the rate board (C16)`.

---

### Task 4: Wizard checkout — turnaround line

**Files:**
- Modify: `apps/web/components/intake-wizard.tsx`

**Interfaces:**
- Consumes: `pricingResult.turnaroundLabel` (Task 2).

- [ ] **Step 1: Implement** — read the checkout price-breakdown render (~1815+). When `pricingResult?.turnaroundLabel` is present, render an **"Estimated turnaround: {label}"** line near the total (match the breakdown's existing line styling). Add `turnaroundLabel?: string | null` to the local `pricingResult` type if it's typed in this file. Read-only; no change to the submit body or the money math.
- [ ] **Step 2: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`).
- [ ] **Step 3: Commit** — `feat(web): show estimated turnaround at intake checkout (C16)`.

---

## Self-Review

**Spec coverage:** C16a (in-place editing) → Task 3 (Steps 1-2). C16b (turnaround) → Task 1 (column) + Task 2 (DTO/persist/resolve) + Task 3 Step 3 (board input) + Task 4 (checkout). RBAC deferred (no task, by decision). All mapped.

**Placeholder scan:** the "read the file to confirm PartialType / spread vs enumerate" notes (Task 2 Steps 1-2) are explicit verification steps against named code, not TODOs. The edit-lock line numbers are from the trace; Task 3 Step 1 says find *every* gate.

**Type consistency:** `turnaroundLabel` is the identical field name across schema (Task 1), DTOs (Task 2), resolve result (Task 2), board (Task 3), and wizard (Task 4). `isLegacy: isLegacyMode` stamp (Task 3) matches the schema's `isLegacy Boolean`.

## Parallelization (subagent-driven)
- **Wave 1:** Task 1 (schema) inline/alone — foundation.
- **Wave 2:** Task 2 (backend) — one agent.
- **Wave 3 (after backend merged):** Task 3 (board) + Task 4 (wizard) — file-disjoint, 2 parallel agents.

## Verification (end-to-end)
1. `cd apps/api && pnpm test && pnpm typecheck` + `cd apps/web && pnpm typecheck && pnpm lint` clean.
2. **DB (deploy step, note for owner):** apply via `prisma db execute --file .../migration.sql` then `prisma migrate resolve --applied 20260707010000_add_pricingrule_turnaround` (per CLAUDE.md; NOT `migrate dev`).
3. Manual: admin edits a live rate's base price + turnaround on `/settings/pricing` → next intake quote reflects the new price and the consumer checkout shows "Estimated turnaround: …"; adding a new legacy rule prices correctly (lands isLegacy:true).
