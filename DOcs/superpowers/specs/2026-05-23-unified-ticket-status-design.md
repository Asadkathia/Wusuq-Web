# Unified Ticket Status — Design Spec

- **Date:** 2026-05-23
- **Status:** Approved (design)
- **Scope:** Spec 4. Collapse the two parallel ticket state fields (`status` +
  `paymentStatus`) into a **single unified `TicketStatus` lifecycle**, retire
  `TicketPaymentStatus`, encode payment gating in the state machine, add
  admin manual status override from the ticket listing.
- **Reworks:** Parts of Spec 2 (payment gating + `paymentStatus` usage). Builds
  on the merged Specs 1–3.

## Problem (verified)

Today a ticket carries **two parallel state fields**:
- `TicketStatus` (workflow): `PENDING → ASSIGNED → IN_PROGRESS → WAITING_APPROVAL → COMPLETED` (`tickets.service.ts:142` state machine; the type also lives in `@wusuq/shared` `TICKET_STATUSES`).
- `TicketPaymentStatus` (payment): `UNPAID / PARTIALLY_PAID / PAID`.

Payment is a *separate* field plus a *separate* gate (`assertPaymentSatisfied`
throws to block `→ASSIGNED`). There is no `UNPAID`/`PAID` workflow status and no
`DELIVERED`. The two fields drift; the lifecycle isn't unified.

## Target

One status field, one source of truth:
```
UNPAID → PAID → ASSIGNED → IN_PROGRESS → WAITING_APPROVAL → COMPLETED → DELIVERED
```

---

## 1. New `TicketStatus` enum + state machine

Prisma `TicketStatus` becomes:
```prisma
enum TicketStatus {
  UNPAID
  PAID
  ASSIGNED
  IN_PROGRESS
  WAITING_APPROVAL
  COMPLETED
  DELIVERED
}
```
`PENDING` is removed. `@wusuq/shared` `TICKET_STATUSES` is updated to match
(single source for the TS union; both API and web import it).

State machine (`STATUS_TRANSITIONS`):
```ts
UNPAID:           ['PAID'],
PAID:             ['ASSIGNED'],
ASSIGNED:         ['IN_PROGRESS'],
IN_PROGRESS:      ['WAITING_APPROVAL'],
WAITING_APPROVAL: ['COMPLETED', 'IN_PROGRESS'],
COMPLETED:        ['DELIVERED'],
DELIVERED:        [],
```

## 2. Retire `paymentStatus` — single source of truth

- Drop `Ticket.paymentStatus` column and the `TicketPaymentStatus` enum.
- Partial/remainder is derived from the existing `amountPaid` vs `totalAmount`
  decimals. No second payment representation.
- A helper `isFullyPaid(t) = Number(t.amountPaid) >= Number(t.totalAmount)` and
  `isBaseCovered(t) = Number(t.amountPaid) >= Number(t.serviceCost)` (in
  `@wusuq/shared`) centralises the money comparisons.

## 3. Payment milestones encoded in the machine

- **`UNPAID → PAID`**: performed automatically when a payment is approved and the
  **base is covered** (`amountPaid ≥ serviceCost`). This replaces the wallet
  auto-deduction's `paymentStatus` writes (Spec 2): `applyPaymentToTicket` /
  `clearPendingTickets` now flip `status` `UNPAID→PAID` when base coverage is
  first reached, and **leave `status` untouched** for tickets already past
  `PAID` (a remainder payment on a `COMPLETED` ticket only updates `amountPaid`).
- **`COMPLETED → DELIVERED`**: blocked unless `isFullyPaid` (full incl.
  remainder). ONE_TIME flows are already full at `PAID`; SPLIT flows require the
  finalized remainder paid first.
- **`assertPaymentSatisfied` is deleted.** The order enforces gating: an
  `UNPAID` ticket has no legal transition to `ASSIGNED`; `→DELIVERED` checks full
  payment. The `DISABLE_PAYMENT_GATING` env bypass is removed (no longer needed).

## 4. Admin manual status override (from the listing)

- New endpoint `PATCH /tickets/:id/status-override` (admin/finance role,
  `@RequirePermissions('tickets.write')`) accepting `{ status }`. It sets **any**
  `TicketStatus`, **bypassing** the state machine + payment gates (for
  corrections), records the change in `AuditLog` (`TICKET_STATUS_OVERRIDDEN`,
  with from/to + actor), and writes a `TicketStatusHistory` row.
- Normal forward transitions keep using the validated `updateStatus`
  (machine-enforced). The override is a distinct, clearly-named path.
- **Frontend:** each row in the portal ticket board (`ticket-board.tsx`) gets a
  **status dropdown** (admin/finance only). Selecting a status calls the
  override endpoint; the UI shows a confirm dialog for backwards/skip jumps
  (anything not a normal forward transition).

## 5. Migration

Prisma migration (needs DB; owner runs / outside sandbox):
1. Add `UNPAID`, `PAID`, `DELIVERED` to the `TicketStatus` enum.
2. **Data migrate** existing rows from `(status, paymentStatus)` →
   - `status='PENDING'` & `paymentStatus='UNPAID'` → `UNPAID`
   - `status='PENDING'` & `paymentStatus IN ('PAID','PARTIALLY_PAID')` → `PAID`
   - `ASSIGNED/IN_PROGRESS/WAITING_APPROVAL/COMPLETED` → unchanged
   - (No existing `DELIVERED`.)
3. Drop the `PENDING` enum value.
4. Drop `Ticket.paymentStatus` column and the `TicketPaymentStatus` enum.

(Multi-step: Postgres enum value removal requires the data migration to run
before the value is dropped. Prisma may need a hand-edited migration SQL.)

## 6. Touch points (where `paymentStatus`/`PENDING` must change)

**API**
- `tickets/tickets.service.ts` — state machine; creation `status='UNPAID'`
  (was PENDING+UNPAID); remove `assertPaymentSatisfied`; remove the
  `COMPLETED ⇒ paymentStatus=PAID` quirk; `finalizeRemainder` no longer sets
  `paymentStatus` (status stays COMPLETED; amounts updated); list/detail mappers
  drop `paymentStatus`; add `statusOverride`.
- `wallet/wallet.service.ts` — `applyPaymentToTicket`/`clearPendingTickets` flip
  `UNPAID→PAID` on base coverage instead of writing `paymentStatus`.
- `payments/payments.service.ts` — gateway webhook `paymentStatus=PAID` →
  status `UNPAID→PAID` (when base covered).
- `finance/finance.service.ts` + `finance.controller.ts` + `dto/finance-query.dto.ts`
  — replace `paymentStatus` filters/reads with status / amount-derived
  (e.g. "unpaid" = `status='UNPAID'`; "outstanding" = `amountPaid < totalAmount`).
- `dashboard/dashboard.service.ts` — payment counters from status/amounts.
- `notifications/notification-dispatcher.service.ts` — `paymentRemainderDue`
  guard uses amounts (already does) + status, not `paymentStatus`.
- `@wusuq/shared` — `TICKET_STATUSES` (add UNPAID/PAID/DELIVERED, drop PENDING);
  add `isFullyPaid` / `isBaseCovered` helpers.

**Web**
- `components/ticket-board.tsx` — status dropdown (override) + board filtering;
  payment displays from status/amounts.
- `components/finance-board.tsx`, `components/consumer-ticket-board.tsx`,
  `components/ticket-charges-board.tsx`, `app/(consumer)/consumer/tickets/[id]/pay/page.tsx`,
  `app/(consumer)/consumer/dashboard/page.tsx` — replace `paymentStatus` reads
  with `status` / `amountPaid` vs `totalAmount`.
- Portal board nav/pages: today 5 status pages (`pending`, `assigned`,
  `in-progress`, `waiting-approval`, `completed`). Replace `pending` with
  `unpaid` + `paid`, add `delivered`. (Or a single board with a status filter —
  see Open items.)

## 7. Testing

- Unit: `STATUS_TRANSITIONS` legal/illegal transitions; `UNPAID→PAID` only when
  base covered; `COMPLETED→DELIVERED` blocked until `isFullyPaid`; override sets
  any status + writes audit + history.
- Unit: wallet `applyPaymentToTicket` flips `UNPAID→PAID` on base coverage and
  doesn't regress status for already-advanced tickets.
- Unit: `isFullyPaid`/`isBaseCovered` helpers.
- Migration spot-check: existing tickets map to the right new status.
- Regression: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## 8. Open items

- **Board structure:** add `unpaid`/`paid`/`delivered` pages mirroring the
  existing per-status pages (lowest-risk, matches current pattern) vs. a single
  board with a status filter (cleaner long-term). Default to **per-status pages**
  to match the established pattern; revisit if nav grows unwieldy.
- **`createdBy` exemption:** today admin-created tickets skip gating. In the new
  model they simply start at `PAID` (or admin sets status), so the special-case
  exemption is replaced by status placement.
