# Unified Ticket Status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `TicketStatus` + `TicketPaymentStatus` into one unified lifecycle (`UNPAID → PAID → ASSIGNED → IN_PROGRESS → WAITING_APPROVAL → COMPLETED → DELIVERED`), retire `paymentStatus`, encode payment gating in the state machine, and add an audited admin status override from the ticket listing.

**Architecture:** Single source of truth: workflow `status` carries payment milestones; partial/remainder derives from `amountPaid` vs `totalAmount`. Payment approval flips `UNPAID→PAID`; `COMPLETED→DELIVERED` is gated on full payment. The standalone `assertPaymentSatisfied` gate is deleted. Admin override is a separate, audited, machine-bypassing path.

**Tech Stack:** NestJS 11 + Prisma/Postgres (api), Next.js 16 (web), `@wusuq/shared`, Jest (api tests).

**Spec:** `DOcs/superpowers/specs/2026-05-23-unified-ticket-status-design.md`

**Execution order:** Phase 0 (shared + schema + migration) first — everything depends on the enum. Then Phase 1 (backend), then Phase 2 (frontend), then Phase 3 verify. Migration needs the Neon DB (owner / outside sandbox).

**⚠️ This reworks Spec 2.** `paymentStatus` is read/written in ~8 API files + 6 web files. Every reference must move to `status` or amount comparisons. Miss one → typecheck catches it (the column/enum will be gone).

---

## PHASE 0 — Shared + schema + migration

### Task 0.1: Shared statuses + payment helpers

**Files:** `packages/shared/src/index.ts`; Test: `apps/api/src/tickets/tickets.service.spec.ts`

- [ ] **Step 1: Update `TICKET_STATUSES`** (currently lines 15-21) to the unified set:

```ts
export const TICKET_STATUSES = [
  'UNPAID',
  'PAID',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_APPROVAL',
  'COMPLETED',
  'DELIVERED',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
```

- [ ] **Step 2: Add money helpers** (after the statuses):

```ts
// Single source for payment-state derivation now that paymentStatus is retired.
export function isBaseCovered(t: { amountPaid: unknown; serviceCost: unknown }): boolean {
  return Number(t.amountPaid ?? 0) >= Number(t.serviceCost ?? 0);
}
export function isFullyPaid(t: { amountPaid: unknown; totalAmount: unknown }): boolean {
  return Number(t.amountPaid ?? 0) >= Number(t.totalAmount ?? 0);
}
```

- [ ] **Step 3: Write the failing test** in `apps/api/src/tickets/tickets.service.spec.ts`:

```ts
import { isBaseCovered, isFullyPaid, TICKET_STATUSES } from '@wusuq/shared';

describe('unified status helpers (Spec 4)', () => {
  it('has the 7 unified statuses, no PENDING', () => {
    expect(TICKET_STATUSES).toEqual([
      'UNPAID','PAID','ASSIGNED','IN_PROGRESS','WAITING_APPROVAL','COMPLETED','DELIVERED',
    ]);
  });
  it('derives base coverage and full payment from amounts', () => {
    expect(isBaseCovered({ amountPaid: 500, serviceCost: 500 })).toBe(true);
    expect(isBaseCovered({ amountPaid: 200, serviceCost: 500 })).toBe(false);
    expect(isFullyPaid({ amountPaid: 800, totalAmount: 800 })).toBe(true);
    expect(isFullyPaid({ amountPaid: 500, totalAmount: 800 })).toBe(false);
  });
});
```

- [ ] **Step 4: Build shared + run test** — `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test src/tickets/tickets.service.spec.ts` (will fail to compile elsewhere until Phase 1 — that's expected; for now just confirm this block's logic. If the whole spec won't compile, run after Task 1.1).

- [ ] **Step 5: Commit** — `feat(shared): unified ticket statuses + payment helpers`.

---

### Task 0.2: Prisma enum + drop paymentStatus

**Files:** `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Replace the `TicketStatus` enum**:

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

- [ ] **Step 2: On `model Ticket`** — change `status` default to `UNPAID`:

```prisma
  status          TicketStatus        @default(UNPAID)
```

- [ ] **Step 3: Remove `paymentStatus`** — delete the `paymentStatus TicketPaymentStatus @default(UNPAID)` field AND the `@@index([paymentStatus])` line from `model Ticket`, and delete the `enum TicketPaymentStatus { ... }` block.

- [ ] **Step 4: Validate** — `cd apps/api && npx prisma validate` → valid.

- [ ] **Step 5: Hand-write the migration** (Postgres can't drop an in-use enum value automatically). Create `apps/api/prisma/migrations/<ts>_unified_ticket_status/migration.sql`:

```sql
-- 1. add new enum values
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'UNPAID';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
COMMIT;
-- 2. migrate data off PENDING (must be its own statement after the values exist)
UPDATE "Ticket" SET "status" = CASE
  WHEN "paymentStatus" = 'UNPAID' THEN 'UNPAID'::"TicketStatus"
  ELSE 'PAID'::"TicketStatus" END
WHERE "status" = 'PENDING';
-- 3. drop paymentStatus column + its index + the enum
DROP INDEX IF EXISTS "Ticket_paymentStatus_idx";
ALTER TABLE "Ticket" DROP COLUMN "paymentStatus";
DROP TYPE "TicketPaymentStatus";
-- 4. recreate TicketStatus without PENDING (rename-swap)
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
CREATE TYPE "TicketStatus" AS ENUM ('UNPAID','PAID','ASSIGNED','IN_PROGRESS','WAITING_APPROVAL','COMPLETED','DELIVERED');
ALTER TABLE "Ticket" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Ticket" ALTER COLUMN "status" TYPE "TicketStatus" USING ("status"::text::"TicketStatus");
ALTER TABLE "Ticket" ALTER COLUMN "status" SET DEFAULT 'UNPAID';
DROP TYPE "TicketStatus_old";
```

> The owner applies this with `pnpm prisma migrate deploy` (or `migrate dev`) against the DB — needs network the sandbox blocks. Run `prisma generate` locally afterward to refresh the client types. (Implementer: after editing schema, run `npx prisma generate` so the client types update for typecheck; defer the actual DB migrate to the owner.)

- [ ] **Step 6: Commit** — `feat(db): unified TicketStatus enum, drop paymentStatus`.

---

## PHASE 1 — Backend

### Task 1.1: State machine, creation, gating removal, DELIVERED gate

**Files:** `apps/api/src/tickets/tickets.service.ts`; Test: spec

- [ ] **Step 1: Replace `STATUS_TRANSITIONS`** (~line 142):

```ts
const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  UNPAID: ['PAID'],
  PAID: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_APPROVAL'],
  WAITING_APPROVAL: ['COMPLETED', 'IN_PROGRESS'],
  COMPLETED: ['DELIVERED'],
  DELIVERED: [],
};
```

- [ ] **Step 2: Creation status** — in `createIntakeTicket`, change `status: 'PENDING'` → `status: 'UNPAID'`. Remove `paymentStatus: ...` from the create data (column gone). Same for any other `status: 'PENDING'` / `paymentStatus:` writes in `regenerate`, `generateNextHearing` (use `status: 'UNPAID'`, drop paymentStatus).

- [ ] **Step 3: Delete `assertPaymentSatisfied`** (the whole private method, ~line 1857) and its two call sites (`updateStatus` ~698, `assign` ~820). Gating is now the state machine.

- [ ] **Step 4: `updateStatus` DELIVERED gate** — in `updateStatus`, after the transition-legality check, add: if `status === 'DELIVERED'` and `!isFullyPaid(ticket)` throw `ForbiddenException('Final payment required before delivery.')`. Import `isFullyPaid` from `@wusuq/shared`. Remove the old `COMPLETED ⇒ paymentStatus=PAID` line (~704).

- [ ] **Step 5: Tests** — extend the "Payment gate" describe (now state-machine based): `UNPAID` can't → `ASSIGNED` (invalid transition error); `PAID` → `ASSIGNED` ok; `COMPLETED` → `DELIVERED` blocked when `amountPaid < totalAmount`, allowed when `>=`. Update existing tests that referenced `paymentStatus`/`PENDING`.

- [ ] **Step 6: Run** `cd apps/api && pnpm test src/tickets/tickets.service.spec.ts` → PASS. Commit `feat(tickets): unified status machine + DELIVERED payment gate`.

---

### Task 1.2: Admin status override endpoint

**Files:** `tickets.service.ts`, `tickets.controller.ts`, `dto/status-override.dto.ts`; Test: spec

- [ ] **Step 1: DTO** `dto/status-override.dto.ts`:

```ts
import { IsIn } from 'class-validator';
import { TICKET_STATUSES, type TicketStatus } from '@wusuq/shared';
export class StatusOverrideDto {
  @IsIn(TICKET_STATUSES as unknown as string[])
  status!: TicketStatus;
}
```

- [ ] **Step 2: Service `overrideStatus`** in `tickets.service.ts` — sets any status, no machine/gate check, writes history + audit:

```ts
async overrideStatus(
  ticketId: string,
  status: TicketStatus,
  actor: { actorUserId?: string; actorEmail?: string },
) {
  const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, status: true } });
  if (!ticket) throw new NotFoundException('Ticket not found');
  const updated = await this.prisma.ticket.update({ where: { id: ticketId }, data: { status } });
  await this.prisma.ticketStatusHistory.create({
    data: { ticketId, to: status, note: `Admin override from ${ticket.status}` },
  });
  await this.auditLogsService.create({
    action: 'TICKET_STATUS_OVERRIDDEN', entity: 'TICKET', entityId: ticketId,
    actorUserId: actor.actorUserId, actorEmail: actor.actorEmail,
    metadata: { from: ticket.status, to: status },
  });
  return updated;
}
```

(Confirm `TicketStatusHistory.create` field name — match the existing usage in `updateStatus` which writes `to`/`note`.)

- [ ] **Step 3: Route** in `tickets.controller.ts`:

```ts
@RequirePermissions('tickets.write')
@Patch(':id/status-override')
overrideStatus(@Param('id') id: string, @Body() dto: StatusOverrideDto, @CurrentUser() actor: JwtUser | undefined) {
  return this.ticketsService.overrideStatus(id, dto.status, { actorUserId: actor?.sub, actorEmail: actor?.email });
}
```

- [ ] **Step 4: Test** — `overrideStatus` sets an arbitrary status (e.g. `UNPAID`→`DELIVERED`) without throwing, writes a history row + audit log. Run spec → PASS. Commit `feat(tickets): audited admin status override`.

---

### Task 1.3: Wallet + payments flip UNPAID→PAID (retire paymentStatus writes)

**Files:** `apps/api/src/wallet/wallet.service.ts`, `apps/api/src/payments/payments.service.ts`; Test: `wallet.service.spec.ts`

- [ ] **Step 1: `applyPaymentToTicket`** (wallet.service.ts ~408) — replace the `paymentStatus` write with a status flip. Read `status`, `serviceCost`, `amountPaid`, `totalAmount` for the ticket; increment `amountPaid`; if `status === 'UNPAID'` and the new `amountPaid >= serviceCost`, set `status: 'PAID'`; otherwise leave `status` unchanged:

```ts
const newAmountPaid = ticket.amountPaid + deducted;
const data: Prisma.TicketUpdateInput = { amountPaid: { increment: deducted } };
if (ticket.status === 'UNPAID' && newAmountPaid >= ticket.serviceCost) {
  data.status = 'PAID';
}
await tx.ticket.update({ where: { id: ticket.ticketId }, data });
```

Update the ticket-fetch in `clearPendingTickets` (~357) to also `select` `status` + `serviceCost`, and the `applyPaymentToTicket` param type to include them. Remove the `paymentStatus: { not: 'PAID' }` candidate filter — replace with `status: { notIn: ['DELIVERED'] }` and the `totalAmount > amountPaid` remaining check (already present).

- [ ] **Step 2: `payments.service.ts` webhook** — where it sets `paymentStatus: 'PAID'` + `amountPaid`, set `amountPaid` and, if base now covered and status is `UNPAID`, `status: 'PAID'`. Drop the `paymentStatus` write.

- [ ] **Step 3: Tests** — wallet test: paying base on an `UNPAID` ticket flips it to `PAID`; a partial payment below base leaves it `UNPAID`; a remainder payment on a `COMPLETED` ticket updates `amountPaid` but keeps `COMPLETED`. Run `pnpm test src/wallet/wallet.service.spec.ts` → PASS. Commit `feat(wallet/payments): flip UNPAID→PAID on base coverage`.

---

### Task 1.4: Finance, dashboard, notifications, mappers

**Files:** `finance/finance.service.ts`, `finance/finance.controller.ts`, `finance/dto/finance-query.dto.ts`, `dashboard/dashboard.service.ts`, `notifications/notification-dispatcher.service.ts`, `tickets.service.ts` (list/detail mappers)

- [ ] **Step 1: finance-query.dto.ts** — remove the `paymentStatus?: string` filter field; add (if useful) `outstanding?: boolean`.
- [ ] **Step 2: finance.service.ts** — replace the `where.paymentStatus = query.paymentStatus` filter (~36) with status/amount logic: an "outstanding" filter → `where.amountPaid = { lt: prisma.ticket.fields.totalAmount }` is not expressible directly; instead filter `status: { notIn: ['DELIVERED'] }` and compute outstanding in the mapper. Drop `paymentStatus` from the response mapper (~106). **`reconcilePayment`** (~126-198): it computes a `TicketPaymentStatus` and writes `paymentStatus`. Rework it to: increment `amountPaid`, and set `status: 'PAID'` only when the ticket is `UNPAID` and base is now covered (reuse `isBaseCovered`). Remove the `TicketPaymentStatus` import + the `paymentStatus` variable; return the updated amounts instead.
- [ ] **Step 3: dashboard.service.ts** — replace any `paymentStatus` counters (e.g. unpaid count) with `status: 'UNPAID'`; "outstanding" with amount comparison or `status NOT IN (DELIVERED)`.
- [ ] **Step 4: notification-dispatcher.service.ts** — the `paymentRemainderDue` guard (uses `t.paymentStatus === 'PAID'`) → use `isFullyPaid(t)` (already computes remainder from amounts); drop the `paymentStatus` select.
- [ ] **Step 5: tickets.service.ts mappers** — remove `paymentStatus: ticket.paymentStatus` from the list mapper (~263) and the detail (`findOne`) shape. (status already returned.)
- [ ] **Step 6:** `cd apps/api && pnpm typecheck` → 0 errors (this is the big one — every `paymentStatus` reference must be gone). `pnpm test` → API suite green. Commit `feat(api): migrate finance/dashboard/notifications off paymentStatus`.

---

## PHASE 2 — Frontend

> Replace every `paymentStatus` read with `status` / `amountPaid` vs `totalAmount`. Add the admin status dropdown + board pages.

### Task 2.1: Admin status dropdown (override) in the listing
**Files:** `apps/web/components/ticket-board.tsx`, a tickets client method.
- [ ] Add a per-row **status `<select>`** (admin/finance role only) listing the 7 statuses; on change, call `PATCH /tickets/:id/status-override`; show a confirm dialog when the chosen status isn't the normal next transition. Add `overrideStatus(ticketId, status)` to the tickets/payments client. Typecheck + eslint. Commit.

### Task 2.2: Board pages + nav for new statuses
**Files:** `apps/web/app/(portal)/tickets/*`, the portal nav.
- [ ] Replace the `pending` board page with `unpaid` + `paid` pages (`<TicketBoard status="UNPAID" />`, `status="PAID"`), add a `delivered` page (`status="DELIVERED"`), and update the portal sidebar nav entries accordingly. Typecheck. Commit.

### Task 2.3: Replace `paymentStatus` reads in web components
**Files:** `apps/web/components/finance-board.tsx`, `consumer-ticket-board.tsx`, `ticket-charges-board.tsx`, `app/(consumer)/consumer/tickets/[id]/pay/page.tsx`, `app/(consumer)/consumer/dashboard/page.tsx`, `components/ticket-board.tsx`.
- [ ] In each, replace `paymentStatus`-based logic with `status` / amount comparisons: "unpaid" → `status === 'UNPAID'`; "paid/covered" → `status !== 'UNPAID'`; "fully paid" → `amountPaid >= totalAmount`; "remainder due" → `remainderFinalizedAt && amountPaid < totalAmount`. Remove `paymentStatus` from the row types. Typecheck + eslint across web. Commit.

---

## PHASE 3 — Verification

### Task 3.1
- [ ] `pnpm --filter @wusuq/shared build && pnpm lint && pnpm typecheck && pnpm test` → all green (no `paymentStatus` references remain: `grep -rn "paymentStatus" apps packages` returns nothing in source).
- [ ] **Owner runs the migration** against the DB, then manual smoke: create ticket (UNPAID) → pay base → flips PAID → assign → … → COMPLETED → pay remainder → DELIVERED; admin override sets arbitrary status + appears in audit log; boards show the new statuses.
- [ ] Commit any fixups.

---

## Self-review notes (author)
- **Spec coverage:** §1 enum/machine → 0.1/0.2/1.1; §2 retire paymentStatus → 0.2/1.3/1.4/2.3; §3 milestones+gate → 1.1/1.3; §4 override → 1.2/2.1; §5 migration → 0.2; §6 touch points → 1.3/1.4/2.x; §7 testing → each task. Covered.
- **Migration is the highest-risk step** (hand-written SQL, enum value drop, column drop). Owner applies it; `prisma generate` locally unblocks typecheck.
- **typecheck is the safety net:** removing the `paymentStatus` column/enum makes every stale reference a compile error — Phase 1/2 aren't done until `pnpm typecheck` is 0.
