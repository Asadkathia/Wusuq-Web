# Workstream D2 — Cost Override & Margin Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clarify the two-cost labels, make the admin cost-override snapshot `priceBreakdown`, and surface a staff-only "Wusuq earnings" margin line.

**Architecture:** Almost entirely additive on already-built machinery. One backend change (`finance.updateCharge` writes `priceBreakdown`), one shared pure helper (`computeWusuqMargin`), and label/margin-row additions on three admin UI surfaces. No schema change.

**Tech Stack:** NestJS/Prisma (`apps/api`), Next.js 16/React 19 (`apps/web`), TS shared; Jest (API + shared + web unit).

**Spec:** `DOcs/superpowers/specs/2026-07-07-workstream-d2-cost-override-margin-design.md`.

## Global Constraints

- **The two-cost model is already correct** in `computeTicketTotal` — C9 is labeling ONLY, no logic/DTO change. Field keys stay `additionalServiceCost` (taxed, folds into base) and `additionalCharges` (untaxed, separate line).
- **`updateCharge` must not change the totals** — it already computes `totalAmount`/`taxAmount` correctly; only ADD a `priceBreakdown` snapshot write (mirror `repriceTicket`), currency-safe (use the ticket's stored `currency`/`taxRate`). Keep the `total >= amountPaid` guard; no USD hard-block.
- **"Wusuq earnings" = `round2(totalAmount − clerkEarnings)`**, computed via the shared `computeWusuqMargin`; rendered **admin/staff-only** (ticket-detail-panel + Review & Complete dialog), **NEVER** in `ConsumerTicketDetail`. Clerk earnings via the single source `computeClerkEarnings`.
- Run `pnpm --filter @wusuq/shared build` after editing shared; `pnpm typecheck` + `pnpm lint` (both apps) + relevant tests before each commit. Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Modify** `packages/shared/src/index.ts` — add `computeWusuqMargin` (C15).
- **Modify** `apps/api/src/finance/finance.service.ts` — `updateCharge` writes `priceBreakdown` (C10).
- **Modify** `apps/web/components/ticket-charges-board.tsx` — C9 labels/hints.
- **Modify** `apps/web/components/ticket-board.tsx` — C9 labels on Review & Complete + C15 margin row.
- **Modify** `apps/web/components/ticket-detail-panel.tsx` — C15 margin row.
- Tests below.

Tasks 1 (shared helper) and 2 (API `updateCharge`) are file-disjoint and independent. Tasks 3–5 are UI; Task 4/5 consume Task 1's helper. Parallel waves noted at the end.

---

### Task 1: `computeWusuqMargin` shared helper (C15)

**Files:**
- Modify: `packages/shared/src/index.ts` (add beside `computeClerkEarnings`)
- Test: `packages/shared/src/wusuq-margin.spec.ts` (or extend an existing shared spec — check where `computeClerkEarnings` is tested and colocate)

**Interfaces:**
- Produces: `export function computeWusuqMargin(totalAmount: number, clerkEarnings: number): number;` — returns `round2(totalAmount − clerkEarnings)`.

- [ ] **Step 1: Write the failing test** (first find how `round2` and `computeClerkEarnings` are imported/tested in the shared package and match that style):

```ts
// packages/shared/src/wusuq-margin.spec.ts
import { computeWusuqMargin } from './index';

describe('computeWusuqMargin', () => {
  it('is total minus clerk earnings', () => {
    expect(computeWusuqMargin(1000, 300)).toBe(700);
  });
  it('rounds to 2 decimals', () => {
    expect(computeWusuqMargin(100.005, 0)).toBe(100.01);
  });
  it('can be negative when clerk earnings exceed total', () => {
    expect(computeWusuqMargin(200, 500)).toBe(-300);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`cd packages/shared && pnpm test -- wusuq-margin` — or the repo's shared test command; if shared has no jest runner, add the test under whichever runner already covers `computeClerkEarnings` and adjust the path).
- [ ] **Step 3: Implement**

```ts
// packages/shared/src/index.ts — beside computeClerkEarnings
export function computeWusuqMargin(
  totalAmount: number,
  clerkEarnings: number,
): number {
  return round2(totalAmount - clerkEarnings);
}
```

- [ ] **Step 4: Run → PASS**; `pnpm --filter @wusuq/shared build`.
- [ ] **Step 5: Commit** — `feat(shared): computeWusuqMargin (total − clerk earnings) (C15)`.

---

### Task 2: `updateCharge` writes `priceBreakdown` (C10)

**Files:**
- Modify: `apps/api/src/finance/finance.service.ts` (`updateCharge`, ~214-294)
- Test: `apps/api/src/finance/finance.charge-breakdown.spec.ts` (new) — or extend the existing finance spec if one covers `updateCharge`

**Interfaces:**
- Consumes: the existing `computeTicketTotal` result already computed in `updateCharge`; the `priceBreakdown` JSON shape written by `repriceTicket`/`finalizeRemainderCore`.

- [ ] **Step 1: Read the reference.** Open `repriceTicket` (and/or `finalizeRemainderCore`) in `tickets.service.ts` and copy the exact `priceBreakdown` JSON shape it persists (fields + nesting). Confirm whether there's a shared builder function; if so, reuse it — otherwise replicate the shape locally in finance.
- [ ] **Step 2: Write the failing test** — construct `FinanceService` with a prisma mock (mirror an existing finance/tickets spec's harness); call `updateCharge(ticketId, { serviceCost: 800 }, actor)`; assert the `prisma.ticket.update` (or `$transaction`) payload includes a `priceBreakdown` whose recorded total equals the recomputed `totalAmount`. (Read the real `updateCharge` to see whether it writes via `ticket.update` or a transaction, and assert against that call.)

```ts
// sketch — adapt to the real updateCharge persistence call
it('writes a priceBreakdown snapshot on override', async () => {
  const { service, updateSpy } = makeFinance(ticketWith({ serviceCost: 500, totalAmount: 500 }));
  await service.updateCharge('t1', { serviceCost: 800 }, { actorUserId: 'a', actorEmail: 'a@x' });
  const data = updateSpy.mock.calls.at(-1)[0].data;
  expect(data.priceBreakdown).toBeTruthy();
  expect(Number(data.totalAmount)).toBeGreaterThanOrEqual(800);
});
```

- [ ] **Step 3: Run → FAIL**.
- [ ] **Step 4: Implement** — in `updateCharge`, after the totals are computed, assemble the `priceBreakdown` snapshot (same shape as `repriceTicket`) from the resulting columns + applied discount/tax and include it in the persisted `data`. Use the ticket's stored `currency`/`taxRate` (no USD special-casing). Do not alter the totals math or the `total >= amountPaid` guard.
- [ ] **Step 5: Run → PASS**, full API suite (`cd apps/api && pnpm test`), `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 6: Commit** — `fix(finance): updateCharge snapshots priceBreakdown like reprice (C10)`.

---

### Task 3: C9 labels on the cost-override board

**Files:**
- Modify: `apps/web/components/ticket-charges-board.tsx`

- [ ] **Step 1: Implement** — read the field labels for `additionalServiceCost` and `additionalCharges` (the trace found "Addl. Service Cost" at ~line 172). Rename/clarify to **"Additional Service Cost"** with a hint "Added to the taxable service base" and **"Additional Cost"** with a hint "Separate line; not taxed" (use the file's existing hint/help pattern, or a small `<span className="text-xs text-slate-500">` under the label if none). No key/logic change.
- [ ] **Step 2: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`).
- [ ] **Step 3: Commit** — `feat(web): clarify taxed vs untaxed additional-cost labels on the override board (C9)`.

---

### Task 4: C9 labels + C15 margin on the Review & Complete dialog

**Files:**
- Modify: `apps/web/components/ticket-board.tsx`

**Interfaces:**
- Consumes: `computeWusuqMargin` (Task 1); the dialog's existing clerk-earnings figure (`computeFinalizeClerkEarnings`/`computeClerkEarnings`) + the live finalize-derived total.

- [ ] **Step 1: C9 labels** — on the Review & Complete charge inputs, apply the same "Additional Service Cost" (taxed) / "Additional Cost" (untaxed) labels + hints as Task 3, if those fields render here. (If only `additionalCharges` renders in this dialog, label just that one.)
- [ ] **Step 2: C15 margin row** — near the existing clerk-earnings summary (~1843-1860), add a **"Wusuq earnings"** row: `computeWusuqMargin(total, clerkEarnings)` where `total` is the dialog's live finalize-derived total and `clerkEarnings` the value already computed there. Format with the file's existing money formatter. Import `computeWusuqMargin` from `@wusuq/shared`.
- [ ] **Step 3: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`).
- [ ] **Step 4: Commit** — `feat(web): Wusuq earnings line + taxed/untaxed labels on Review & Complete (C9/C15)`.

---

### Task 5: C15 margin on the ticket-detail panel

**Files:**
- Modify: `apps/web/components/ticket-detail-panel.tsx`

**Interfaces:**
- Consumes: `computeWusuqMargin` (Task 1); the panel's existing `clerkEarnings` (~354) + `customerTotal`/`total` (~370).

- [ ] **Step 1: Implement** — in the Charges Breakdown card, beside the existing clerk-earnings/total rows, add a **"Wusuq earnings"** row = `computeWusuqMargin(customerTotal, clerkEarnings)` (use the exact total variable already in scope). Import `computeWusuqMargin` from `@wusuq/shared`. This panel is internal-only (admin + clerk), never the consumer view — do not touch `consumer-ticket-board.tsx`.
- [ ] **Step 2: Guard test** — add a web unit/render test (matching the repo's web test style) asserting `ConsumerTicketDetail` does NOT render the text "Wusuq earnings" (a simple string-absence check on the rendered consumer component, or a lib-level guard if rendering isn't set up — mirror how other web unit tests assert consumer redaction). If the web runner can't render this component (node-env), instead add a comment-anchored assertion in the shared/e2e layer; do not force a jsdom dependency.
- [ ] **Step 3: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`).
- [ ] **Step 4: Commit** — `feat(web): Wusuq earnings line on the admin ticket-detail panel (C15)`.

---

## Self-Review

**Spec coverage:** C9 → Tasks 3 + 4 (labels on both admin surfaces). C10 → Task 2 (priceBreakdown write). C15 → Task 1 (helper) + Tasks 4 + 5 (render) + Task 5 (consumer-absence guard). All mapped.

**Placeholder scan:** the two "read the real shape/labels first" notes (Task 2 Step 1, Task 3 Step 1) are explicit verification steps against named existing code, not TODOs. Task 2's test sketch says "adapt to the real persistence call" — the implementer must read `updateCharge`'s actual write; acceptable as it's a verification instruction, and the assertion intent (priceBreakdown present + total) is concrete.

**Type consistency:** `computeWusuqMargin(totalAmount, clerkEarnings): number` defined in Task 1, consumed identically in Tasks 4 + 5. `priceBreakdown` shape sourced from `repriceTicket` (Task 2 Step 1).

## Parallelization (subagent-driven)
- **Wave 1 (file-disjoint):** Task 1 (shared) · Task 2 (finance) · Task 3 (charges-board). 3 parallel agents.
- **Wave 2:** Task 4 (ticket-board) · Task 5 (ticket-detail-panel) — both consume Task 1's helper; file-disjoint from each other, so parallel after Wave 1's shared build is merged.

## Verification (end-to-end)
1. `pnpm --filter @wusuq/shared build && (cd apps/api && pnpm test && pnpm typecheck) && (cd apps/web && pnpm test && pnpm typecheck && pnpm lint)` clean.
2. Manual: admin overrides Service Cost on `/manage-cost/ticket-charges` → invoice + total reflect it, `priceBreakdown` refreshed; "Wusuq earnings" shows on admin ticket detail + Review & Complete, absent from the consumer ticket detail; taxed/untaxed labels read clearly.
