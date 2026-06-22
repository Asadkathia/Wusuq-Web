# Ticket-Listing UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin/clerk ticket board easier to operate — Assign only where it can succeed (unpaid rows read "Awaiting payment"), and each row surfaces last-updated time, payment/amount, assigned rep, and time-in-status — by enriching the existing table in place.

**Architecture:** One small API addition (`findAll` returns `statusSince` from the latest status-history row; ordering by `updatedAt desc` and the `updatedAt` field are already shipped). All UI work is in the existing portal board `ticket-board.tsx`. A shared `relativeTime` helper is extracted so both boards format "X ago" identically.

**Tech Stack:** NestJS 11 + Prisma (API), Next.js 16 / React 19 + Tailwind (web), Jest (API tests).

Spec: `DOcs/superpowers/specs/2026-06-23-ticket-listing-ux-design.md`.

## Global Constraints

- **Commits require the owner's explicit confirmation** (global CLAUDE.md rule). Every "Commit" step below is gated on that — pause and ask before running `git commit`. End commit messages with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Run gates from the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm build`. API tests: from `apps/api`, `NODE_OPTIONS=--experimental-vm-modules npx jest`.
- After any `packages/shared` change run `pnpm --filter @wusuq/shared build` (no shared change in this plan).
- Money/clerk-internal fields are admin/clerk-only; this board (`ticket-board.tsx`) is the portal (admin/clerk) board — the consumer board (`consumer-ticket-board.tsx`) is a separate component and must not gain these fields.
- React 19: no synchronous `setState` in an effect body without `startTransition` (not triggered by this plan, but don't introduce it).

## File Structure

- `apps/web/lib/relative-time.ts` — **new.** Single `relativeTime(iso?: string): string` helper.
- `apps/web/components/consumer-ticket-board.tsx` — **modify.** Drop the local `relativeTime`, import the shared one.
- `apps/api/src/tickets/tickets.service.ts` — **modify.** `findAll`: include latest history row, return `statusSince`.
- `apps/api/src/tickets/tickets.service.spec.ts` — **modify.** Assert `updatedAt`/`statusSince` in the mapped row + ordering.
- `apps/web/components/ticket-board.tsx` — **modify.** `TicketRow` type (+`updatedAt`, +`statusSince`); assign gating + "Awaiting payment"; row enrichment.

---

### Task 1: Shared `relativeTime` helper

**Files:**
- Create: `apps/web/lib/relative-time.ts`
- Modify: `apps/web/components/consumer-ticket-board.tsx:134-145` (remove local fn), and its import block (`:1-12` region)

**Interfaces:**
- Produces: `export function relativeTime(iso?: string): string` — `'' | 'just now' | '{m}m ago' | '{h}h ago' | '{d}d ago' | <locale date>`.

- [ ] **Step 1: Create the shared helper** (verbatim move of the existing consumer-board implementation)

```ts
// apps/web/lib/relative-time.ts
/**
 * Compact "time ago" label. Shared by the admin/clerk and consumer ticket
 * boards so the format stays consistent. Returns '' for a missing date.
 */
export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
```

- [ ] **Step 2: Delete the local copy in `consumer-ticket-board.tsx`**

Remove the entire `function relativeTime(iso?: string) { ... }` block (currently `:134-145`). Leave the `type FilterTab = ...` line that follows it intact.

- [ ] **Step 3: Import the shared helper in `consumer-ticket-board.tsx`**

Add to the import section near the top (after the existing `@/lib/...` imports, or create one if none):

```ts
import { relativeTime } from '@/lib/relative-time';
```

- [ ] **Step 4: Verify typecheck + lint pass (no behavior change)**

Run: `pnpm typecheck && pnpm lint`
Expected: both `Done`; `apps/web` reports 0 errors (pre-existing warnings only). No new "unused"/"undefined relativeTime" errors.

- [ ] **Step 5: Commit** (ask first — see Global Constraints)

```bash
git add apps/web/lib/relative-time.ts apps/web/components/consumer-ticket-board.tsx
git commit -m "refactor(web): extract shared relativeTime helper"
```

---

### Task 2: API `findAll` returns `statusSince`

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` — `findAll` (the `findMany` `include` block ~`:261-272` and the `items.map` return object, just before `createdAt: ticket.createdAt` ~`:318-320`)
- Test: `apps/api/src/tickets/tickets.service.spec.ts` — `describe('findAll …')` harness ~`:2317`

**Interfaces:**
- Produces: each `findAll` list item now also carries `updatedAt: Date` (already shipped) and `statusSince: Date | null` (the `createdAt` of the most-recent `TicketStatusHistory` row, i.e. when the ticket entered its current status; `null` if it has no history).

- [ ] **Step 1: Extend the existing test mock + add field assertions**

In `tickets.service.spec.ts`, in the `findAll` harness `ticketRow` object, add `updatedAt` and a `history` array (place alongside the existing fields, e.g. after `createdAt: new Date()`):

```ts
      createdAt: new Date('2026-06-20T10:00:00Z'),
      updatedAt: new Date('2026-06-22T15:00:00Z'),
      history: [{ createdAt: new Date('2026-06-21T09:00:00Z') }],
```

Then add a new test inside that `describe` block:

```ts
  it('returns updatedAt and statusSince (latest history timestamp)', async () => {
    const { service } = harness();
    const res = await service.findAll(query);
    const row = res.items[0] as Record<string, unknown>;
    expect(row.updatedAt).toEqual(new Date('2026-06-22T15:00:00Z'));
    expect(row.statusSince).toEqual(new Date('2026-06-21T09:00:00Z'));
  });
```

- [ ] **Step 2: Add an ordering test (captures the findMany query)**

Add another test in the same `describe` block. It builds its own prisma so it can assert the `orderBy` passed to `findMany`:

```ts
  it('orders the list by updatedAt desc, then createdAt desc', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      ticket: { findMany, count },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new TicketsService(
      prisma as never,
      { create: jest.fn() } as never,
      {} as never,
      {} as never,
      makeDispatcher() as never,
    );
    await service.findAll({ page: 1, limit: 20 } as never);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/api && NODE_OPTIONS=--experimental-vm-modules npx jest tickets.service.spec -t "statusSince|orders the list"`
Expected: FAIL — `statusSince` undefined (mapping doesn't return it yet); the ordering test PASSES already (ordering is shipped) but keep it as a regression guard.

- [ ] **Step 4: Add the history include in `findAll`**

In `tickets.service.ts`, in the `findMany` `include` block (alongside `consumer`, `service`, `case`, `assignments`), add:

```ts
          // Most-recent transition timestamp → "time in current status". The
          // last history row's `to` is the current status, so its createdAt is
          // when the ticket entered that state.
          history: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
```

- [ ] **Step 5: Return `statusSince` in the mapped item**

In the `items.map((ticket) => ({ ... }))` return object, add right after `updatedAt: ticket.updatedAt,`:

```ts
        statusSince: ticket.history[0]?.createdAt ?? null,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && NODE_OPTIONS=--experimental-vm-modules npx jest tickets.service.spec`
Expected: PASS (all `findAll` tests, including the two new ones).

- [ ] **Step 7: Commit** (ask first)

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/tickets.service.spec.ts
git commit -m "feat(tickets): findAll returns statusSince (time-in-status) for the board"
```

---

### Task 3: Assign gating + "Awaiting payment" chip

**Files:**
- Modify: `apps/web/components/ticket-board.tsx:1004-1009` (the admin/non-clerk action block; `openAssign` button at `:1006`)

**Interfaces:**
- Consumes: existing `status` prop, `openAssign(ticket)`, `StatusPill` is already imported. No new imports.

- [ ] **Step 1: Gate Assign to PAID only and add the Unpaid chip**

Replace the current block:

```tsx
                        {(status === 'UNPAID' || status === 'PAID') && (
                          <button onClick={() => openAssign(ticket)} className="text-primary-600 hover:text-primary-900 bg-primary-50 px-3 py-1.5 rounded-md flex items-center gap-1">
                            <CheckSquare className="h-3.5 w-3.5" /> Assign
                          </button>
                        )}
```

with:

```tsx
                        {status === 'PAID' && (
                          <button onClick={() => openAssign(ticket)} className="text-primary-600 hover:text-primary-900 bg-primary-50 px-3 py-1.5 rounded-md flex items-center gap-1">
                            <CheckSquare className="h-3.5 w-3.5" /> Assign
                          </button>
                        )}
                        {status === 'UNPAID' && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700"
                            title="A ticket must be paid before it can be assigned to a representative."
                          >
                            <Clock className="h-3.5 w-3.5" /> Awaiting payment
                          </span>
                        )}
```

(`Clock` is already imported from `lucide-react` at `:30`.)

- [ ] **Step 2: Verify typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint && pnpm --filter @wusuq/web build`
Expected: typecheck `Done`, lint 0 errors, build `Done`.

- [ ] **Step 3: Commit** (ask first)

```bash
git add apps/web/components/ticket-board.tsx
git commit -m "fix(tickets-ui): only offer Assign on paid tickets; show Awaiting payment on unpaid"
```

---

### Task 4: Row enrichment (updated-time, payment, assigned rep, time-in-status)

**Files:**
- Modify: `apps/web/components/ticket-board.tsx` — `TicketRow` type (`:39-72`), import (`:32` region), and the three table cells: Batch No (`:834-852`), Consumer (`:853-858`), Service Details (`:859-865`).

**Interfaces:**
- Consumes: `relativeTime` from Task 1; `updatedAt`/`statusSince` from Task 2.

- [ ] **Step 1: Add fields to the `TicketRow` type**

In the `type TicketRow = { ... }` block, add (next to `assignedRepresentative`). Include `createdAt` for the `statusSince` fallback — verify it isn't already declared in the type before adding (it currently is not):

```ts
  createdAt?: string | null;
  updatedAt?: string | null;
  statusSince?: string | null;
```

- [ ] **Step 2: Import the shared helper + add a small money formatter near the top of the file**

Add the import (with the other `@/lib` imports, ~`:32`):

```ts
import { relativeTime } from '@/lib/relative-time';
```

Add a module-scope helper (place beside other top-level consts, e.g. after `CONSUMER_ROLES`):

```ts
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;
// Compact "N{u} in this state" from a status-entry ISO; amber past 7 days.
function statusAge(iso?: string | null): { label: string; stale: boolean } | null {
  if (!iso) return null;
  const days = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 86_400_000);
  const hours = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 3_600_000);
  const label = days >= 1 ? `${days}d` : `${hours}h`;
  return { label, stale: days > 7 };
}
```

- [ ] **Step 3: Batch No cell — add "updated X ago" sub-line**

In the Batch No `<td>`, change the inner `batchNo` div to add a muted line beneath it:

```tsx
                    <div>
                      <div className="text-sm font-medium text-slate-900">{ticket.batchNo}</div>
                      {ticket.updatedAt && (
                        <div className="text-xs text-slate-400" title={new Date(ticket.updatedAt).toLocaleString()}>
                          updated {relativeTime(ticket.updatedAt)}
                        </div>
                      )}
                    </div>
```

(Replace the existing `<div className="text-sm font-medium text-slate-900">{ticket.batchNo}</div>` — keep it wrapped inside the existing `flex items-center gap-3` container that holds the admin checkbox.)

- [ ] **Step 4: Consumer cell — add assigned-rep sub-line**

In the Consumer `<td>`, under the existing name row, add:

```tsx
                  {ticket.assignedRepresentative && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      → {ticket.assignedRepresentative.name}
                    </div>
                  )}
```

- [ ] **Step 5: Service Details cell — add payment + time-in-status line**

In the Service Details `<td>`, after the existing `city · caseType` line, add:

```tsx
                  {(() => {
                    const total = Number(ticket.totalAmount ?? 0);
                    const paid = Number(ticket.amountPaid ?? 0);
                    const due = Math.max(0, total - paid);
                    const age = statusAge(ticket.statusSince ?? ticket.createdAt ?? null);
                    return (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className="text-slate-500">
                          {total <= 0 ? 'Free' : due > 0 ? `${rs(total)} · ${rs(due)} due` : 'Paid in full'}
                        </span>
                        {age && (
                          <span className={age.stale ? 'text-amber-600 font-medium' : 'text-slate-400'}>
                            · {age.label} in {ticket.status.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        )}
                      </div>
                    );
                  })()}
```

- [ ] **Step 6: Verify typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint && pnpm --filter @wusuq/web build`
Expected: typecheck `Done`, lint 0 errors, build `Done`.

- [ ] **Step 7: Commit** (ask first)

```bash
git add apps/web/components/ticket-board.tsx
git commit -m "feat(tickets-ui): surface updated-time, payment, assignee, time-in-status per row"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full gate**

Run from repo root: `pnpm typecheck && pnpm lint && pnpm build`, then `cd apps/api && NODE_OPTIONS=--experimental-vm-modules npx jest`.
Expected: typecheck `Done`; lint 0 errors (web warnings pre-existing); build `Done`; all API tests pass.

- [ ] **Step 2 (optional): Visual check**

If a local DB is available, `pnpm dev`, open the portal Unpaid page (Assign gone, "Awaiting payment" shown) and the Paid/In-progress pages (updated-time, payment, rep, time-in-status visible; list newest-updated first).
