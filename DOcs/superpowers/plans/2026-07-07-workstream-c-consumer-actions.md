# Workstream C — Consumer Ticket Actions & Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the consumer ticket surface Regenerate + Download-invoice + Pay-later actions, and close two cross-consumer IDORs (documents rep-scoping; intake consumerId attribution).

**Architecture:** C7/C8 are frontend-only (the regenerate wizard, invoice endpoint, and pay-later logic already exist — we add buttons + a shared route/download helper). H1/H2 are small, self-contained API guards. No schema changes.

**Tech Stack:** Next.js 16/React 19 (`apps/web`), NestJS/Prisma (`apps/api`), TS shared; Jest (API + web unit), Playwright (e2e).

**Spec:** `DOcs/superpowers/specs/2026-07-07-workstream-c-consumer-actions-design.md`.

## Global Constraints

- **No backend change for C7/C8's happy path** — the consumer regenerate wizard, `GET /tickets/:id/invoice`, and pay-later already work; only buttons + a shared FE helper are added.
- **Consumer Regenerate route:** `/consumer/paralegal-services/${category}/${slug}?regenerateFromTicketId=${ticket.id}` where `category = intakeFlow.startsWith('judicial_') ? 'judicial' : 'non-judicial'`, `slug = flowKeyToSlug(intakeFlow)`. Hide Regenerate when `intakeFlow` is absent.
- **Invoice button** shows when `Number(ticket.totalAmount) > 0`; reuses `GET /tickets/:id/invoice` (never recompute).
- **H1:** a `representative` must be scoped to their assigned tickets' documents and must NOT be able to pass an arbitrary `?consumerId`. Staff unfiltered; consumer-class self-scoped (unchanged).
- **H2:** for consumer-class actors (`isConsumerRole`), `createIntakeTicket` must bind the ticket to `actor.sub` (reject or coerce a foreign `dto.consumerId`). Staff/lawyer on-behalf unaffected.
- **DRY:** extract `flowKeyToSlug`/category + the invoice-download into shared helpers rather than copy-pasting between `ticket-board.tsx` and `consumer-ticket-board.tsx`.
- Run `pnpm typecheck` + `pnpm lint` (both apps) and relevant tests before each commit. React 19 set-state-in-effect → `startTransition`. Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- **Create** `apps/web/lib/regenerate-route.ts` — `regenerateHref(ticket, base)` + re-export/wrap `flowKeyToSlug` + category.
- **Modify** `apps/web/components/consumer-ticket-board.tsx` — 3 actions on the card + Regenerate/Pay-later on detail; lift invoice download to a reusable fn.
- **Modify** `apps/api/src/documents/documents.controller.ts` + `documents.service.ts` — H1 rep scoping.
- **Modify** `apps/api/src/tickets/tickets.service.ts` (or controller) — H2 consumer attribution.
- Tests as below.

Tasks are file-disjoint for parallel waves: Task 1 (regenerate-route util), Task 3 (H1 documents), Task 4 (H2 intake) are independent; Task 2 (consumer-ticket-board wiring) consumes Task 1.

---

### Task 1: `regenerateHref` shared route helper (C8)

**Files:**
- Create: `apps/web/lib/regenerate-route.ts`
- Test: `apps/web/lib/regenerate-route.test.ts`

**Interfaces:**
- Consumes: `flowKeyToSlug` (from `@/lib/intake-flows` — confirm it's exported there; `ticket-board.tsx` imports it).
- Produces:
  ```ts
  // base: 'consumer' → /consumer/paralegal-services/…  ; 'portal' → /paralegal-services/…
  export function regenerateHref(
    ticket: { id: string; intakeFlow?: string | null },
    base: 'consumer' | 'portal',
  ): string | null;   // null when intakeFlow is absent
  ```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/regenerate-route.test.ts
import { regenerateHref } from './regenerate-route';

describe('regenerateHref', () => {
  it('builds the consumer judicial route', () => {
    expect(regenerateHref({ id: 't1', intakeFlow: 'judicial_case_files' }, 'consumer'))
      .toBe('/consumer/paralegal-services/judicial/case-files?regenerateFromTicketId=t1');
  });
  it('builds the consumer non-judicial route', () => {
    expect(regenerateHref({ id: 't2', intakeFlow: 'non_judicial_copy_of_fir' }, 'consumer'))
      .toBe('/consumer/paralegal-services/non-judicial/copy-of-fir?regenerateFromTicketId=t2');
  });
  it('builds the portal route', () => {
    expect(regenerateHref({ id: 't3', intakeFlow: 'judicial_case_files' }, 'portal'))
      .toBe('/paralegal-services/judicial/case-files?regenerateFromTicketId=t3');
  });
  it('returns null without an intakeFlow', () => {
    expect(regenerateHref({ id: 't4', intakeFlow: null }, 'consumer')).toBeNull();
  });
});
```

(First read `apps/web/lib/intake-flows.ts` to confirm `flowKeyToSlug`'s exact name/signature and what slug it produces for `judicial_case_files` / `non_judicial_copy_of_fir`; adjust the expected slugs in the test to match reality if they differ.)

- [ ] **Step 2: Run → FAIL** (`cd apps/web && pnpm test -- regenerate-route`).
- [ ] **Step 3: Implement**

```ts
// apps/web/lib/regenerate-route.ts
import { flowKeyToSlug } from '@/lib/intake-flows';

export function regenerateHref(
  ticket: { id: string; intakeFlow?: string | null },
  base: 'consumer' | 'portal',
): string | null {
  const flow = ticket.intakeFlow;
  if (!flow) return null;
  const slug = flowKeyToSlug(flow);
  if (!slug) return null;
  const category = flow.startsWith('judicial_') ? 'judicial' : 'non-judicial';
  const prefix = base === 'consumer' ? '/consumer/paralegal-services' : '/paralegal-services';
  return `${prefix}/${category}/${slug}?regenerateFromTicketId=${encodeURIComponent(ticket.id)}`;
}
```

- [ ] **Step 4: Run → PASS**, `cd apps/web && pnpm typecheck && pnpm lint`.
- [ ] **Step 5: Commit** — `feat(web): regenerateHref shared route helper (C8)`.

---

### Task 2: Consumer ticket actions — Regenerate + Invoice + Pay-later (C7/C8)

**Files:**
- Modify: `apps/web/components/consumer-ticket-board.tsx`
- Test: `apps/web/tests/e2e/consumer-ticket-actions.spec.ts` (mock-API)

**Interfaces:**
- Consumes: `regenerateHref` (Task 1); `GET /tickets/:id/invoice` (WS-B); the existing `downloadInvoice` logic in `ConsumerTicketDetail`.

- [ ] **Step 1: Lift the invoice download to a reusable function** — read `ConsumerTicketDetail`'s `downloadInvoice` (~630-659). Extract its body into a module-level `async function downloadTicketInvoice(ticketId: string, setBusy: (b: boolean) => void)` (same fetch of `/tickets/${ticketId}/invoice`, base64→blob→`<a download>`), and have `ConsumerTicketDetail` call it. This lets `TicketCard` reuse it without copy-paste.

- [ ] **Step 2: Add the three actions to `TicketCard`** — in the card's action area (where "Pay now" renders, ~505-529), add:
  - **Regenerate:** `const href = regenerateHref(ticket, 'consumer');` render a `<Link href={href}>Regenerate</Link>` (or `router.push`) only when `href && ticket.createdBy === 'CONSUMER'`.
  - **Download invoice:** a button `onClick={() => downloadTicketInvoice(ticket.id, setInvoiceBusy)}`, shown when `Number(ticket.totalAmount) > 0`; add a local `const [invoiceBusy, setInvoiceBusy] = useState(false)` and disable while busy.
  - **Pay later:** shown wherever the card's "Pay now" shows (same `showPayNow`/`showFinalPayment` gate); `onClick` toasts `` `${formatMoney(remaining, currency)} added to your wallet as due` `` (reuse the pay page's copy + `formatMoney`) — no navigation, no backend call. Keep "Pay now" linking to the pay page.

- [ ] **Step 3: Add Regenerate + Pay-later to `ConsumerTicketDetail`** — next to its existing "Pay now"/"Download invoice" buttons (~941-953 / ~860-870), add the same Regenerate (`regenerateHref(ticket,'consumer')`, gated on `createdBy`) and Pay-later (toast) actions.

- [ ] **Step 4: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`; respect set-state-in-effect — these are event handlers, so no effect concern).

- [ ] **Step 5: e2e** — `tests/e2e/consumer-ticket-actions.spec.ts` mirroring `tests/e2e/pricing-tax-promo.spec.ts`: seed a consumer session, mock `GET /tickets` (or the board's list endpoint) returning an UNPAID consumer-created ticket with `intakeFlow: 'judicial_case_files'`, `totalAmount: 500`. Assert the card shows **Regenerate** (href contains `regenerateFromTicketId`), **Download invoice** (mock `GET /tickets/*/invoice` → base64 PDF, assert the request fires on click), and **Pay later** (toast). `test.fixme` any deep-nav part that needs a live route (accepted gap like `payment-gating.spec.ts`); verify the spec loads via `npx playwright test <file> --list`.

- [ ] **Step 6: Commit** — `feat(web): consumer ticket card + detail get Regenerate, Download-invoice, Pay-later (C7/C8)`.

---

### Task 3: H1 — `/documents` representative scoping

**Files:**
- Modify: `apps/api/src/documents/documents.controller.ts` (`list`, `export`)
- Modify: `apps/api/src/documents/documents.service.ts` (`list`)
- Test: `apps/api/src/documents/documents.rep-scope.spec.ts`

**Interfaces:**
- Produces: `DocumentsService.list(query, opts?: { forConsumer?: boolean; forRepresentative?: boolean; representativeId?: string })` — when `forRepresentative`, scope the ticket-where to `assignments: { some: { representativeId } }` and ignore `query.consumerId`.

- [ ] **Step 1: Write the failing test** — a rep calling with `{ forRepresentative: true, representativeId: 'rep-1' }` and a client `consumerId: 'other'` yields only docs whose ticket has an assignment for `rep-1` (assert the prisma where-clause includes `assignments: { some: { representativeId: 'rep-1' } }` and does NOT include `consumerId: 'other'`). Follow the mock pattern from `documents.visibility.spec.ts` (already in the repo from WS-B).

```ts
// apps/api/src/documents/documents.rep-scope.spec.ts
import { DocumentsService } from './documents.service';
describe('DocumentsService rep scoping (H1)', () => {
  it('scopes a representative to their assigned tickets and ignores client consumerId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new DocumentsService({ ticketDocument: { findMany } } as never);
    await svc.list({ consumerId: 'other' } as never, { forRepresentative: true, representativeId: 'rep-1' });
    const where = findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('rep-1');
    expect(JSON.stringify(where)).not.toContain('other');
  });
});
```

(Read the real `DocumentsService.list` where-clause construction first — assert against its actual shape.)

- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — add `forRepresentative`/`representativeId` to the `opts` and, in `list`, when `forRepresentative`, build `ticket: { …existing status/visible gates…, assignments: { some: { representativeId } } }` and do NOT apply `query.consumerId`. In `documents.controller.ts` `list` + `export`, add `const forRepresentative = user?.role === 'representative';` and pass `{ forConsumer, forRepresentative, representativeId: user?.sub }`; when `forRepresentative`, do not read `query.consumerId`.
- [ ] **Step 4: Run → PASS**, full API suite, `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 5: Commit** — `fix(documents): scope representative list/export to assigned tickets; ignore client consumerId (H1 IDOR)`.

---

### Task 4: H2 — `createIntakeTicket` consumer attribution

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (`createIntakeTicket`) — or the controller call site
- Test: `apps/api/src/tickets/intake-consumer-binding.spec.ts`

**Interfaces:**
- Consumes: `isConsumerRole` from `@wusuq/shared`. `createIntakeTicket` must know the actor role — confirm the `actor` passed in carries `role` (or thread it from the controller). If the controller currently passes only `actorUserId`/`actorEmail`, extend it to pass `actorRole` and enforce there.

- [ ] **Step 1: Write the failing test** — a consumer-class actor whose `sub` ≠ `dto.consumerId` is rejected (or the persisted ticket's `consumerId` is coerced to the actor). A staff actor on-behalf keeps the explicit `dto.consumerId`. Use the inline harness pattern from the ticket specs; assert either the throw or the coerced value depending on the chosen enforcement (below).
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — at the top of `createIntakeTicket` (after loading actor role): if `isConsumerRole(actorRole)` and `dto.consumerId && dto.consumerId !== actorUserId` → throw `ForbiddenException('Cannot create a ticket for another consumer')`. Also, when `isConsumerRole(actorRole)`, force `dto.consumerId = actorUserId` (so an omitted consumerId still binds to self). Thread `actorRole` from the controller (`tickets.controller.ts` intake handlers) if not already available. Staff/lawyer keep passing an explicit consumerId (no `isConsumerRole` → unaffected).
- [ ] **Step 4: Run → PASS**, full API suite, `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 5: Commit** — `fix(tickets): bind consumer intake to actor.sub; reject foreign consumerId (H2 IDOR)`.

---

## Self-Review

**Spec coverage:** C7/C8 → Tasks 1-2; H1 → Task 3; H2 → Task 4. B8 deferred (spec decision 1). All in-scope items mapped.

**Placeholder scan:** every code step has real code; the "read the real signature/where-clause first" notes are explicit verification steps, not TODOs.

**Type consistency:** `regenerateHref(ticket, base)` defined in Task 1, used in Task 2. `downloadTicketInvoice(ticketId, setBusy)` defined + used in Task 2. `DocumentsService.list(query, opts)` extended in Task 3 consistent with WS-B's `{forConsumer}` shape. `isConsumerRole`/`actorRole` in Task 4.

## Parallelization (subagent-driven)
- **Wave 1 (file-disjoint):** Task 1 (regenerate-route util) · Task 3 (documents) · Task 4 (tickets intake). 3 parallel agents.
- **Wave 2:** Task 2 (consumer-ticket-board wiring) — consumes Task 1's helper; after Wave 1 merged.

## Verification (end-to-end)
1. `cd apps/api && pnpm test` + `cd apps/web && pnpm test` green.
2. `pnpm --filter @wusuq/shared build && (cd apps/api && pnpm typecheck) && (cd apps/web && pnpm typecheck && pnpm lint)` clean.
3. Manual: a consumer regenerates their own ticket (pre-filled wizard → new owned ticket), downloads its invoice from the card, sees Pay-later add a wallet due; a rep cannot read another consumer's documents; a consumer cannot POST an intake with a foreign consumerId.
