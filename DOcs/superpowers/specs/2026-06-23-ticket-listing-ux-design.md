# Admin/Clerk Ticket-Listing UX

**Date:** 2026-06-23
**Status:** Approved (design)
**Scope:** `apps/web/components/ticket-board.tsx` (the portal board used by every
per-status admin/clerk page) + one small `apps/api` addition. The consumer
board (`consumer-ticket-board.tsx`), the assign modal, per-status page routing,
and the ticket state machine are **out of scope / untouched**.

## Problem

The portal ticket board is rendered once per status page (Unpaid, Paid,
Assigned, In progress, Waiting approval, Completed, Delivered); each page passes
a `status` prop that gates the row actions. Two issues:

1. **Misleading Assign action.** The Assign button renders when
   `status === 'UNPAID' || status === 'PAID'` (`ticket-board.tsx:1005`), but the
   backend only allows `PAID → ASSIGNED` (`assign()` rejects any other
   `from` status). So on the **Unpaid** page every row shows an Assign button
   that always fails server-side. (Confirmed by the owner: "the assign button
   shows up next to them, however only the paid tickets get assigned because
   unpaid tickets cannot be assigned.")
2. **Thin rows / no time signal.** Rows show Batch No, Consumer, Service
   (service · city · caseType), Status, and hover-revealed actions — but no
   time, no payment state, and no assignee. The list is also ordered
   `createdAt desc`, which isn't surfaced anywhere.

## Goals

- Assign only offered where it can succeed; unpaid rows clearly read as
  "awaiting payment."
- Latest-**updated** ticket first, with that recency visible per row.
- Surface, compactly, the four details the owner asked for: last-updated time,
  payment/amount, assigned representative, and time-in-current-status.
- Keep it a small, in-place enrichment of the existing table — not a redesign.

## Non-goals (YAGNI)

- No card redesign, no new table columns, no horizontal-scroll widening.
- No change to the assign modal, the hover-reveal action behavior, the
  per-status page routing, the consumer board, or the ticket state machine.

## Design

### 1. Assign gating + "Awaiting payment"

In `ticket-board.tsx`, the admin (non-clerk) action block:

- Change the Assign condition from `status === 'UNPAID' || status === 'PAID'`
  to **`status === 'PAID'`** — Assign appears only where the transition is
  valid.
- On the **Unpaid** board (`status === 'UNPAID'`), render a muted
  **"Awaiting payment"** chip in place of Assign (in the actions area), so the
  row makes the gate obvious rather than offering a dead button.

Admins still move `UNPAID → PAID` through the existing status-override dropdown
and the finance/wallet flow — unchanged.

### 2. Row enrichment (folded into existing cells)

All additions are small, muted sub-lines/chips inside the **existing** columns
(no new columns). Shown on **admin + clerk** boards only — the consumer board is
a separate component and is untouched, and the API already returns these fields
to staff callers.

- **Batch No cell:** `batchNo` + a muted **"updated {relative}"** line beneath
  it (e.g. "updated 2h ago"); `title` attribute carries the exact
  locale timestamp.
- **Consumer cell:** consumer name + **"→ {representative name}"** beneath it
  when `assignedRepresentative` is present.
- **Service Details cell:** existing `service` / `city · caseType`, plus:
  - a **payment line**: `Rs {total} · Rs {due} due` where
    `due = max(0, totalAmount − amountPaid)`; render **"Paid in full"** when
    `due ≤ 0` and a total exists, and **"Free"** when `totalAmount` is 0/absent.
  - a compact **time-in-status** suffix derived from `statusSince` (see §3),
    e.g. "· 3d" — rendered subtly **amber** when the ticket has sat in its
    current status for **more than 7 days** (a light staleness cue).
- **Status / Actions cells:** unchanged, except the Unpaid "Awaiting payment"
  chip above.

Amounts are formatted with the existing `Rs {n.toLocaleString()}` convention
already used elsewhere in the board.

### 3. Backend support (`apps/api/src/tickets/tickets.service.ts`, `findAll`)

- **Already implemented:** order by `[{ updatedAt: 'desc' }, { createdAt: 'desc' }]`
  and return `updatedAt` on each list item. (`Ticket.updatedAt` is Prisma
  `@updatedAt`; every status change / assignment / charge edit / reprice updates
  the ticket row, so it tracks last back-office activity.)
- **New:** include the single most-recent `TicketStatusHistory` row
  (`orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true }`) and
  return it as **`statusSince`** — the timestamp the ticket entered its current
  status (the last transition wrote a history row whose `to` is the current
  status). The FE computes time-in-status from it. Falls back to `createdAt`
  on the FE when `statusSince` is null (legacy tickets with no history).

No other API or schema change; `totalAmount`, `amountPaid`, and
`assignedRepresentative` are already returned to staff callers by `findAll`.

### 4. Small refactor

`relativeTime()` currently lives as a private helper inside
`consumer-ticket-board.tsx`. Extract it to **`apps/web/lib/relative-time.ts`**
and import it in both that board and `ticket-board.tsx`, so the "X ago" format
is defined once. Behavior unchanged (just now / Xm / Xh / Xd / locale date).

## Data flow

`findAll` (API) → ordered `updatedAt desc`, each item carries `updatedAt`,
`statusSince`, `totalAmount`, `amountPaid`, `assignedRepresentative` (staff
only) → `ticket-board.tsx` maps each row, rendering the enriched cells and the
status-gated actions. No client-side re-sort (server order is authoritative).

## Edge cases

- **No history row** (`statusSince` null) → FE falls back to `createdAt` for the
  time-in-status duration.
- **Free / zero-priced tickets** → payment line shows "Free", no "due".
- **Fully paid** → "Paid in full", no "due" amount.
- **Unassigned** → no "→ rep" line (omit, don't show a placeholder).
- **Updated == created** (never touched since intake) → "updated {relative}"
  still renders off `updatedAt` (≈ created time); harmless.

## Testing

- **API:** extend the existing `findAll` test(s) to assert the
  `updatedAt desc` ordering and that `updatedAt` + `statusSince` are present on
  returned items.
- **FE:** no component-test harness exists in this repo for the board; the
  changes are verified by `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Affected files

- `apps/api/src/tickets/tickets.service.ts` — `findAll` (`statusSince` include
  + return; ordering/`updatedAt` already done).
- `apps/api/src/tickets/tickets.service.spec.ts` — ordering/field assertions.
- `apps/web/lib/relative-time.ts` — new shared helper.
- `apps/web/components/consumer-ticket-board.tsx` — import the shared helper
  (drop the local copy).
- `apps/web/components/ticket-board.tsx` — assign gating + "Awaiting payment" +
  row enrichment + `TicketRow` type (`updatedAt`, `statusSince`).
