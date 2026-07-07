# Workstream F — Intake & Catalogue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Differentiate Family-Court judge designation by case category, prefill the intake delivery address from the consumer's profile, and collapse single-select radio groups once chosen.

**Architecture:** All frontend, additive. B7's data half (retag) is already committed + needs a deploy-time re-seed. B7-judge + B9 touch `intake-wizard.tsx`; C13 touches `field-renderer.tsx` — file-disjoint, parallel.

**Tech Stack:** Next.js 16/React 19; Jest (web unit where pure).

**Spec:** `DOcs/superpowers/specs/2026-07-07-workstream-f-intake-catalogue-design.md`.

## Global Constraints

- **FE-only, additive.** No schema/DTO change. No money-math change.
- **B7-judge:** a `case_type`-keyed judge category checked BEFORE the existing `select_court` map — Family→`['Family Judge']`, Guardianship→`['Guardian Judge']`, else the existing both. Substring match (`/guardian/i`, `/family/i`) so it's robust to the exact code; fall back to the current `JUDGE_DESIGNATIONS_BY_SERVICE[select_court]` when no category matches.
- **B9:** seed `delivery_address.house` from the consumer's `User.address` ONLY when the field is empty; keep it editable; never clobber a user-entered value; city stays pinned to the case city.
- **C13:** reuse `CheckboxSingleField`'s collapse-to-chip + "Change" for the `radio` type; collapse is presentation-only (the value stays set so `showWhen`-dependent fields keep working); "Change" re-expands.
- React 19 set-state-in-effect → `startTransition`. `pnpm typecheck` + `pnpm lint` + `pnpm test` before each commit. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Already done (Task 1, committed)
- B7 **data retag**: `hardcoded-snapshot.json` "Application for Succession" → `subCourt: "Civil Court"`. Deploy step: re-run `apps/api/scripts/seed-case-types.ts` against the DB (documented; not run here).

---

### Task 2: B7 judge-by-category + B9 delivery-address prefill (`intake-wizard.tsx`)

**Files:**
- Modify: `apps/web/components/intake-wizard.tsx`
- Test: `apps/web/lib/*.test.ts` for any pure helper you extract (see below)

- [ ] **Step 1 (B7 judge):** read `judgeDesignationOptions` (`intake-wizard.tsx:646-655`) — currently keys on `draft.payload.select_court`. Add a case-type category check first, ideally as a small pure exported helper so it's unit-testable:

```ts
// e.g. in intake-wizard.tsx or a small lib
export function judgeDesignationsForCaseType(caseType?: string | null): string[] | null {
  const t = (caseType ?? '').toLowerCase();
  if (/guardian/.test(t)) return ['Guardian Judge'];
  if (/family/.test(t)) return ['Family Judge'];
  return null; // no category → caller falls back to the subCourt map
}
```
In `judgeDesignationOptions`: `const byType = judgeDesignationsForCaseType(draft.payload.case_type); if (byType) return byType;` before the existing `select_court` lookup. Add `draft.payload.case_type` to the memo deps.

- [ ] **Step 2 (B7 test):** unit-test `judgeDesignationsForCaseType`: 'Family Cases'→`['Family Judge']`, 'Guardianship Cases'→`['Guardian Judge']`, 'Application for Succession'/other→`null`, ''→`null`. (FAIL→PASS.)

- [ ] **Step 3 (B9 prefill):** read the wizard's user/currency fetch (`intake-wizard.tsx:415-425`, `/users/:id` → `serializeUser` which returns `address`, verified). For **consumer-authored intake with a delivery-address step**, fetch the intake consumer's profile `address` (reuse/extend the existing `/users/${cid}` fetch, or add one keyed on `draft.consumerId`/`currentUser.id`) and, when `draft.payload.delivery_address` is empty/unset, seed its `house` from `User.address` via the wizard's normal patch path (respect the structured-address shape `{house, block, mainArea, city?}`; leave block/mainArea empty; don't touch the pinned city). Guard with `startTransition` if setting state in an effect; only seed once; never overwrite a non-empty value. Gate on the flow actually having the `delivery_address` field (Case Files / Case Search TCS branch).

- [ ] **Step 4:** `cd apps/web && pnpm typecheck && pnpm lint` (clean); `pnpm test` (new judge test + existing green).
- [ ] **Step 5: Commit** — `feat(web): Family-Court judge by case type + prefill delivery address from profile (B7/B9)`.

---

### Task 3: C13 collapse radio to chosen option (`field-renderer.tsx`)

**Files:**
- Modify: `apps/web/components/intake-wizard/field-renderer.tsx`
- Test: `apps/web/lib/*.test.ts` if a pure decision helper is extracted (optional)

- [ ] **Step 1:** read `CheckboxSingleField` (`:15-105`, the collapse-to-chip + `forceOpen` + "Change" prior art) and the `radio` branch (`:343-402`). Give the `radio` type the same collapse behavior: when `value` is set and not `forceOpen`, render a chip (`labelFor(value)`) + a **"Change"** button (`setForceOpen(true)` re-expands); else render the option grid. Prefer generalizing `CheckboxSingleField` (or a shared inner component) over copy-paste, since both are single-select-with-buttons.
- [ ] **Step 2:** ensure the collapse is presentation-only — the field's `value` stays set so `showWhen`-gated fields (e.g. `case_status`, `delivery_mode`) still render; changing via "Change" + reselect fires the same `onChange`/`onBlur(key,newValue)` the radio uses today (preserve the synchronous-commit pattern from CLAUDE.md — click-style fields call `onBlur(field.key, newValue)`).
- [ ] **Step 3:** verify no other single-select holdout — check the `tab`-type field; if it's structurally identical and the owner's "all single-select groups" applies, give it the same collapse; otherwise note why not.
- [ ] **Step 4:** `cd apps/web && pnpm typecheck && pnpm lint` (clean); `pnpm test` green.
- [ ] **Step 5: Commit** — `feat(web): collapse single-select radio groups to the chosen option (C13)`.

---

## Self-Review

**Spec coverage:** B7 data → Task 1 (done). B7 judge → Task 2 Steps 1-2. B9 → Task 2 Step 3. C13 → Task 3. All mapped.

**Placeholder scan:** the "read the existing fetch / CheckboxSingleField first" notes are verification steps against named code. The judge helper has concrete code + tests.

**Type consistency:** `judgeDesignationsForCaseType(caseType) → string[] | null` defined + consumed in Task 2. C13 reuses the existing `forceOpen`/`labelFor` pattern.

## Parallelization
- Task 1 done. **Wave 1:** Task 2 (`intake-wizard.tsx`) ‖ Task 3 (`field-renderer.tsx`) — file-disjoint, 2 parallel agents.

## Verification (end-to-end)
1. `cd apps/web && pnpm typecheck && pnpm lint && pnpm test` clean.
2. **Deploy step:** re-run `apps/api/scripts/seed-case-types.ts` against the DB so the retag takes effect.
3. Manual: Family Court intake lists Family/Guardianship (no Succession); picking Guardianship → Guardian Judge only; a consumer with a saved address sees it prefilled (editable) in the TCS delivery step; picking a `case_status` radio collapses the others with a Change button.
