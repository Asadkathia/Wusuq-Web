# Clerk Payout Ignores Admin Markup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pay clerks from their own submitted charges, never from the admin's marked-up final charges.

**Architecture:** Four nullable `clerk*Charges` snapshot columns on `Ticket` capture what the clerk submitted. `submitClerkCosts` writes them; `finalizeRemainderCore` never touches them. A per-line cap `min(clerkSubmitted, adminFinal)` in a new `computeClerkEarningsBreakdown()` in `@wusuq/shared` becomes the single source for every clerk-earnings display and the finance payout report.

**Tech Stack:** NestJS 11 + Prisma (Neon Postgres), Next.js 16, TypeScript, Jest.

**Spec:** `DOcs/superpowers/specs/2026-07-22-clerk-payout-design.md`

## Global Constraints

- **Neon migrations:** apply with `prisma db execute` + `prisma migrate resolve --applied`. **Never `prisma migrate dev`** — the applied migration `20260523090000_unified_ticket_status` was edited post-apply, so `migrate dev` demands a full DB reset.
- **Never hand-roll clerk-earnings math.** `computeClerkEarningsBreakdown` in `@wusuq/shared` is the single source (same rule as `computeTicketTotal` / `buildPricingResolveInput`).
- **`submitClerkCosts` must never write `Ticket.totalAmount`** (batch-2 B4). Unchanged by this plan.
- **Redaction gates use `isStaffRole()` / `isConsumerRole()` helpers**, never literal role strings.
- `additionalCharges` is **excluded** from clerk earnings. `clerkCost` and `PDF_CLERK_FEE = 100` are unchanged.
- Rebuild shared before API/web typecheck: `pnpm --filter @wusuq/shared build`.

## ⚠️ Behaviour change requiring sign-off before Task 6

`finance.service.ts` `clerkPayout` and `computeClerkEarnings` currently disagree on what a clerk is paid:

| Component | `computeClerkEarnings` | `finance.clerkPayout` |
|---|---|---|
| `additionalCharges` | excluded | **included** |
| `PDF_CLERK_FEE` (100) | **included** | excluded |

Unifying them (per spec) means the finance report **drops `additionalCharges` and adds the PDF fee**. That is a real change to payout amounts, not a refactor. Task 6 must not be merged until the owner confirms the unified definition is correct.

---

### Task 1: Schema — clerk-submitted charge columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Ticket model, after `nonAttestedCostPerPage` ~line 245)
- Create: `apps/api/prisma/migrations/20260722000000_add_ticket_clerk_submitted_charges/migration.sql`

**Interfaces:**
- Produces: `Ticket.clerkAttestedCharges`, `clerkNonAttestedCharges`, `clerkPrintingCharges`, `clerkDeliveryCharges` — all `Decimal? @db.Decimal(10, 2)`.

- [ ] **Step 1: Add the columns to the Prisma model**

In `apps/api/prisma/schema.prisma`, immediately after the `nonAttestedCostPerPage` line:

```prisma
  // What the CLERK submitted, snapshotted at submitClerkCosts and never
  // overwritten by the admin's finalize edits. Clerk payout is capped at
  // these values so an admin markup is Wusuq margin, not clerk pay.
  // NULL = no clerk submission recorded (admin filled charges directly) →
  // payout falls back to the final columns.
  clerkAttestedCharges     Decimal?           @db.Decimal(10, 2)
  clerkNonAttestedCharges  Decimal?           @db.Decimal(10, 2)
  clerkPrintingCharges     Decimal?           @db.Decimal(10, 2)
  clerkDeliveryCharges     Decimal?           @db.Decimal(10, 2)
```

- [ ] **Step 2: Write the migration SQL**

Create `apps/api/prisma/migrations/20260722000000_add_ticket_clerk_submitted_charges/migration.sql`:

```sql
ALTER TABLE "Ticket" ADD COLUMN "clerkAttestedCharges" DECIMAL(10,2);
ALTER TABLE "Ticket" ADD COLUMN "clerkNonAttestedCharges" DECIMAL(10,2);
ALTER TABLE "Ticket" ADD COLUMN "clerkPrintingCharges" DECIMAL(10,2);
ALTER TABLE "Ticket" ADD COLUMN "clerkDeliveryCharges" DECIMAL(10,2);
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `cd apps/api && pnpm prisma:generate`
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 4: Verify the types landed**

Run: `cd apps/api && pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260722000000_add_ticket_clerk_submitted_charges/
git commit -m "feat(api): add clerk-submitted charge columns to Ticket"
```

> **Deploy note (do NOT run now):** apply to Neon with
> `cd apps/api && npx prisma db execute --file prisma/migrations/20260722000000_add_ticket_clerk_submitted_charges/migration.sql`
> then `npx prisma migrate resolve --applied 20260722000000_add_ticket_clerk_submitted_charges`.

---

### Task 2: Shared — capped breakdown

**Files:**
- Modify: `packages/shared/src/index.ts:887-920`
- Test: `apps/api/src/dashboard/clerk-earnings.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ClerkEarningsInput` gains `clerkAttestedCharges?`, `clerkNonAttestedCharges?`, `clerkPrintingCharges?`, `clerkDeliveryCharges?` — each `number | string | null`.
  - `interface ClerkEarningsBreakdown { base, attested, nonAttested, printing, delivery, pdfFee, total }` — all `number`.
  - `computeClerkEarningsBreakdown(t: ClerkEarningsInput): ClerkEarningsBreakdown`
  - `computeClerkEarnings(t: ClerkEarningsInput): number` — unchanged signature, now returns `computeClerkEarningsBreakdown(t).total`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/dashboard/clerk-earnings.spec.ts`:

```ts
import { computeClerkEarningsBreakdown } from '@wusuq/shared';

describe('computeClerkEarningsBreakdown — admin markup is capped out', () => {
  it('pays the clerk their submitted rate when the admin marks UP', () => {
    // The client's exact demonstrated case: clerk 50 pages @ 5 = 250,
    // admin re-rates to 10/page = 500. Clerk keeps 250.
    const b = computeClerkEarningsBreakdown({
      clerkCost: 400,
      nonAttestedCharges: 500,
      clerkNonAttestedCharges: 250,
      deliveryCharges: 200,
      clerkDeliveryCharges: 200,
    });
    expect(b.nonAttested).toBe(250);
    expect(b.total).toBe(850);
  });

  it('applies an admin correction DOWNWARD', () => {
    const b = computeClerkEarningsBreakdown({
      clerkCost: 400,
      nonAttestedCharges: 250,
      clerkNonAttestedCharges: 500,
    });
    expect(b.nonAttested).toBe(250);
    expect(b.total).toBe(650);
  });

  it('falls back to the final column when no clerk value was recorded', () => {
    const b = computeClerkEarningsBreakdown({
      clerkCost: 400,
      nonAttestedCharges: 500,
      clerkNonAttestedCharges: null,
    });
    expect(b.nonAttested).toBe(500);
    expect(b.total).toBe(900);
  });

  it('caps every line independently', () => {
    const b = computeClerkEarningsBreakdown({
      clerkCost: 100,
      attestedCharges: 900, clerkAttestedCharges: 300,
      nonAttestedCharges: 900, clerkNonAttestedCharges: 400,
      printingCharges: 900, clerkPrintingCharges: 500,
      deliveryCharges: 900, clerkDeliveryCharges: 600,
    });
    expect(b).toMatchObject({ attested: 300, nonAttested: 400, printing: 500, delivery: 600 });
    expect(b.total).toBe(1900);
  });

  it('breakdown fields sum to total and match the wrapper', () => {
    const input = {
      clerkCost: 700,
      attestedCharges: 100, clerkAttestedCharges: 100,
      wantPdf: true,
    };
    const b = computeClerkEarningsBreakdown(input);
    expect(b.base + b.attested + b.nonAttested + b.printing + b.delivery + b.pdfFee)
      .toBe(b.total);
    expect(b.pdfFee).toBe(100);
    expect(computeClerkEarnings(input)).toBe(b.total);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=clerk-earnings`
Expected: FAIL — `computeClerkEarningsBreakdown is not a function`.

- [ ] **Step 3: Implement**

In `packages/shared/src/index.ts`, add the four optional fields to `ClerkEarningsInput`:

```ts
  /**
   * What the CLERK submitted for each phase-2 line. The admin's finalize edits
   * overwrite the flat columns above, so payout is capped at these. Absent
   * (null/undefined) means no clerk submission was recorded — fall back to the
   * final column.
   */
  clerkAttestedCharges?: number | string | null;
  clerkNonAttestedCharges?: number | string | null;
  clerkPrintingCharges?: number | string | null;
  clerkDeliveryCharges?: number | string | null;
```

Then replace the body of `computeClerkEarnings` with:

```ts
export interface ClerkEarningsBreakdown {
  base: number;
  attested: number;
  nonAttested: number;
  printing: number;
  delivery: number;
  pdfFee: number;
  total: number;
}

/**
 * Internal-only clerk payout, itemized. Each phase-2 line is capped at what the
 * clerk submitted: an admin MARKUP is Wusuq margin and never reaches the clerk,
 * while an admin CORRECTION downward (fixing a clerk typo) does reduce pay.
 * A null clerk value means no submission was recorded → use the final column.
 * The SINGLE source for clerk earnings — never hand-roll this sum.
 */
export function computeClerkEarningsBreakdown(
  t: ClerkEarningsInput,
): ClerkEarningsBreakdown {
  const num = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;
  const line = (
    submitted: number | string | null | undefined,
    final: number | string | null | undefined,
  ): number => {
    const f = num(final);
    if (submitted === null || submitted === undefined || submitted === '') return f;
    return Math.min(num(submitted), f);
  };

  const base = t.clerkCost != null && t.clerkCost !== ''
    ? num(t.clerkCost)
    : num(t.defaultClerkCost);
  const pdfPurchased = num(t.pdfSurcharge) > 0 || t.wantPdf === true;

  const attested = line(t.clerkAttestedCharges, t.attestedCharges);
  const nonAttested = line(t.clerkNonAttestedCharges, t.nonAttestedCharges);
  const printing = line(t.clerkPrintingCharges, t.printingCharges);
  const delivery = line(t.clerkDeliveryCharges, t.deliveryCharges);
  const pdfFee = pdfPurchased ? PDF_CLERK_FEE : 0;

  return {
    base: round2(base),
    attested: round2(attested),
    nonAttested: round2(nonAttested),
    printing: round2(printing),
    delivery: round2(delivery),
    pdfFee: round2(pdfFee),
    total: round2(base + attested + nonAttested + printing + delivery + pdfFee),
  };
}

export function computeClerkEarnings(t: ClerkEarningsInput): number {
  return computeClerkEarningsBreakdown(t).total;
}
```

- [ ] **Step 4: Build shared, run tests**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test -- --testPathPattern=clerk-earnings`
Expected: PASS, all existing `computeClerkEarnings` tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/dashboard/clerk-earnings.spec.ts
git commit -m "feat(shared): cap clerk earnings at the clerk's submitted charges"
```

---

### Task 3: Write boundary — persist the clerk set, never overwrite it

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts:2373-2408` (`submitClerkCosts`)
- Test: `apps/api/src/tickets/clerk-payout.spec.ts` (create)

**Interfaces:**
- Consumes: Task 1 columns, Task 2 `computeClerkEarningsBreakdown`.
- Produces: `submitClerkCosts` persists the four `clerk*Charges` columns. `finalizeRemainderCore` is verified to leave them untouched (no code change expected — this task proves it).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tickets/clerk-payout.spec.ts`:

```ts
import { computeClerkEarningsBreakdown } from '@wusuq/shared';

describe('clerk payout write boundary', () => {
  it('submitClerkCosts persists the clerk set alongside the working columns', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const data = await captureSubmitData(updateMany, {
      nonAttestedPages: 50,
      nonAttestedCostPerPage: 5,
      deliveryCharges: 200,
    });
    expect(data.nonAttestedCharges).toBe(250);
    expect(data.clerkNonAttestedCharges).toBe(250);
    expect(data.clerkDeliveryCharges).toBe(200);
  });

  it('an admin markup after submit does not raise clerk pay', () => {
    // Simulates post-finalize state: final columns marked up, clerk set intact.
    const b = computeClerkEarningsBreakdown({
      clerkCost: 400,
      nonAttestedCharges: 500,        // admin's finalized value
      clerkNonAttestedCharges: 250,   // clerk's submission, untouched
      deliveryCharges: 200,
      clerkDeliveryCharges: 200,
    });
    expect(b.total).toBe(850);
  });
});
```

> Implementer note: `captureSubmitData` is a helper you write in this file that
> instantiates `TicketsService` with the existing mocked-Prisma pattern used by
> the other specs in `apps/api/src/tickets/`, calls `submitClerkCosts`, and
> returns the `data` object passed to `tx.ticket.updateMany`. Copy the mock
> setup from the nearest existing `tickets.*.spec.ts` — do not invent a new one.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=clerk-payout`
Expected: FAIL — `clerkNonAttestedCharges` is `undefined`.

- [ ] **Step 3: Persist the clerk set in `submitClerkCosts`**

In `apps/api/src/tickets/tickets.service.ts`, inside the `tx.ticket.updateMany` `data` block (after the `nonAttestedCostPerPage` line, before the `dispatchProofUrl` C12 comment), add:

```ts
          // Clerk payout basis: snapshot what the CLERK submitted. The admin's
          // finalize edits overwrite the flat columns above but must never
          // touch these — a markup is Wusuq margin, not clerk pay.
          clerkAttestedCharges: attestedCharges,
          clerkNonAttestedCharges: nonAttestedCharges,
          clerkPrintingCharges: printingCharges,
          clerkDeliveryCharges: deliveryCharges,
```

- [ ] **Step 4: Verify `finalizeRemainderCore` does not write them**

Run: `grep -n "clerkAttestedCharges\|clerkNonAttestedCharges\|clerkPrintingCharges\|clerkDeliveryCharges" apps/api/src/tickets/tickets.service.ts`
Expected: matches **only** inside `submitClerkCosts`. If any appear in `finalizeRemainderCore` or `saveClerkCharges`, remove them — those paths must never write the clerk set.

- [ ] **Step 5: Run tests**

Run: `cd apps/api && pnpm test -- --testPathPattern=clerk-payout`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/clerk-payout.spec.ts
git commit -m "feat(api): snapshot clerk-submitted charges at clerk submit"
```

---

### Task 4: Redaction gates

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts:552+` (`redactTicketForConsumer`)
- Test: `apps/api/src/tickets/clerk-payout.spec.ts`

**Interfaces:**
- Consumes: Task 1 columns.
- Produces: clerk set stripped for consumers, retained for representatives.

**Context:** `redactTicketForRepresentative` already deletes the *final* charge columns (`attestedCharges` etc.) but keeps `clerkCost`. The clerk set is the rep's own submission and must likewise be **kept**. Only the consumer path strips it.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/tickets/clerk-payout.spec.ts`:

```ts
describe('clerk-set redaction', () => {
  const CLERK_KEYS = [
    'clerkAttestedCharges',
    'clerkNonAttestedCharges',
    'clerkPrintingCharges',
    'clerkDeliveryCharges',
  ] as const;

  it('strips the clerk set for consumers', () => {
    const out = redactForConsumer({
      status: 'COMPLETED',
      clerkAttestedCharges: 100,
      clerkNonAttestedCharges: 250,
      clerkPrintingCharges: 0,
      clerkDeliveryCharges: 200,
    });
    for (const k of CLERK_KEYS) expect(out).not.toHaveProperty(k);
  });

  it('KEEPS the clerk set for representatives — a clerk sees their own figures', () => {
    const out = redactForRepresentative({
      clerkNonAttestedCharges: 250,
      clerkDeliveryCharges: 200,
    });
    expect(out.clerkNonAttestedCharges).toBe(250);
    expect(out.clerkDeliveryCharges).toBe(200);
  });
});
```

> Implementer note: `redactForConsumer` / `redactForRepresentative` are thin
> wrappers you add in this spec file that reach the private methods via
> `(service as any).redactTicketForConsumer(...)`, matching how the existing
> redaction specs in this directory access them.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=clerk-payout`
Expected: FAIL — consumer output still has `clerkNonAttestedCharges`.

- [ ] **Step 3: Strip in the consumer path only**

In `redactTicketForConsumer`, after the `delete safe.nonAttestedCostPerPage;` line:

```ts
    // Clerk payout basis — internal, same class as clerkCost. NOTE: the
    // representative path deliberately KEEPS these (a clerk must see their
    // own submitted figures); only the consumer view strips them.
    delete safe.clerkAttestedCharges;
    delete safe.clerkNonAttestedCharges;
    delete safe.clerkPrintingCharges;
    delete safe.clerkDeliveryCharges;
```

Make **no change** to `redactTicketForRepresentative`.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && pnpm test -- --testPathPattern=clerk-payout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/clerk-payout.spec.ts
git commit -m "feat(api): strip clerk-submitted charges from the consumer view"
```

---

### Task 5: Clerk dashboard uses the capped breakdown

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts:146-207`
- Test: `apps/api/src/dashboard/clerk-earnings.spec.ts`

**Interfaces:**
- Consumes: Task 2 `computeClerkEarningsBreakdown`, Task 1 columns.
- Produces: `getClerkSummary` returns `earnings.breakdown` — a `ClerkEarningsBreakdown` summed across realized tickets — alongside the existing `realized` / `pending` / `thisMonth` totals.

- [ ] **Step 1: Select the clerk columns**

In the ticket query feeding `getClerkSummary`, add to the `select` (or confirm `include` already covers them — if the query uses `include`, no change is needed and you should skip to Step 2):

```ts
        clerkAttestedCharges: true,
        clerkNonAttestedCharges: true,
        clerkPrintingCharges: true,
        clerkDeliveryCharges: true,
```

- [ ] **Step 2: Pass them through and accumulate the breakdown**

Replace the `const earn = computeClerkEarnings({...})` block (line ~192) with:

```ts
      const b = computeClerkEarningsBreakdown({
        clerkCost: toNum(t.clerkCost),
        defaultClerkCost: toNum(t.defaultClerkCost),
        attestedCharges: toNum(t.attestedCharges),
        nonAttestedCharges: toNum(t.nonAttestedCharges),
        printingCharges: toNum(t.printingCharges),
        deliveryCharges: toNum(t.deliveryCharges),
        clerkAttestedCharges: t.clerkAttestedCharges == null ? null : toNum(t.clerkAttestedCharges),
        clerkNonAttestedCharges: t.clerkNonAttestedCharges == null ? null : toNum(t.clerkNonAttestedCharges),
        clerkPrintingCharges: t.clerkPrintingCharges == null ? null : toNum(t.clerkPrintingCharges),
        clerkDeliveryCharges: t.clerkDeliveryCharges == null ? null : toNum(t.clerkDeliveryCharges),
        wantPdf,
      });
      const earn = b.total;
```

> The `== null ? null :` guard is load-bearing — `toNum(null)` would coerce to
> `0` and cap every line at zero, silently paying clerks nothing.

Declare `const breakdown = { base: 0, attested: 0, nonAttested: 0, printing: 0, delivery: 0, pdfFee: 0, total: 0 };` beside `let realized = 0;`, and inside the `REALIZED` branch accumulate each field:

```ts
      if (REALIZED.has(t.status)) {
        realized += earn;
        for (const k of Object.keys(breakdown) as (keyof typeof breakdown)[]) {
          breakdown[k] += b[k];
        }
        if (t.updatedAt >= startOfMonth) thisMonth += earn;
      } else if (PENDING.has(t.status)) {
```

Include `breakdown` in the returned earnings object.

- [ ] **Step 3: Add the regression test**

Append to `apps/api/src/dashboard/clerk-earnings.spec.ts`:

```ts
it('null clerk columns must not cap the payout to zero', () => {
  const b = computeClerkEarningsBreakdown({
    clerkCost: 400,
    nonAttestedCharges: 500,
    clerkNonAttestedCharges: null,
  });
  expect(b.total).toBe(900);
});
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && pnpm test -- --testPathPattern="clerk-earnings|dashboard"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/clerk-earnings.spec.ts
git commit -m "feat(api): clerk dashboard uses capped earnings breakdown"
```

---

### Task 6: Finance payout report — ⚠️ BLOCKED on owner sign-off

**Do not start until the owner confirms the unified payout definition** (see the callout at the top of this plan: this drops `additionalCharges` and adds the PDF fee).

**Files:**
- Modify: `apps/api/src/finance/finance.service.ts:99-105` and `:339-345`
- Test: `apps/api/src/finance/clerk-payout.spec.ts` (create)

**Interfaces:**
- Consumes: Task 2 `computeClerkEarningsBreakdown`.
- Produces: `clerkPayout` in both finance responses equals `computeClerkEarnings(ticket)`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/finance/clerk-payout.spec.ts`:

```ts
import { computeClerkEarnings } from '@wusuq/shared';

it('finance clerkPayout matches the shared definition', () => {
  const ticket = {
    clerkCost: 400,
    attestedCharges: 0,
    nonAttestedCharges: 500,
    clerkNonAttestedCharges: 250,
    printingCharges: 0,
    deliveryCharges: 200,
    clerkDeliveryCharges: 200,
    additionalCharges: 999, // excluded from clerk pay by definition
  };
  expect(computeClerkEarnings(ticket)).toBe(850);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm test -- --testPathPattern=finance/clerk-payout`
Expected: PASS for the shared fn (it already behaves), then proceed — this test pins the contract the service must adopt.

- [ ] **Step 3: Replace both hand-rolled sums**

Import at the top of `finance.service.ts`:

```ts
import { computeClerkEarnings } from '@wusuq/shared';
```

Replace the six-term sum at **both** sites (~line 99 for `ticket`, ~line 339 for `updated`) with:

```ts
          clerkPayout: computeClerkEarnings({
            ...ticket,
            wantPdf:
              ((ticket.formPayload ?? {}) as Record<string, unknown>)
                .want_pdf_before_dispatch === 'Yes',
          }),
```

(at the second site substitute `updated` for `ticket` in both places).

Both queries use Prisma `include`, so `formPayload` and the clerk columns are already present on the object — no query change needed.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && pnpm test -- --testPathPattern=finance`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/finance/finance.service.ts apps/api/src/finance/clerk-payout.spec.ts
git commit -m "fix(api): finance clerkPayout uses the shared capped earnings"
```

---

### Task 7: Review & Complete dialog — real clerk set + itemization

**Files:**
- Modify: `apps/web/components/ticket-board.tsx:327` (earnings line), `:2401-2404` (`clerkSubmitted`)
- Test: `apps/web/components/ticket-board.test.ts` (create if absent)

**Interfaces:**
- Consumes: Task 2 `computeClerkEarningsBreakdown`, Task 1 columns on the ticket payload.
- Produces: none downstream.

- [ ] **Step 1: Point `clerkSubmitted` at the real clerk columns**

Replace the `clerkSubmitted` helper (line ~2401) with:

```ts
            // Reads the CLERK SET, not the working columns — the working
            // columns are overwritten by finalize, which made this line wrong
            // on any second open of the dialog.
            const clerkSubmitted = (
              field: 'attestedCharges' | 'nonAttestedCharges' | 'printingCharges' | 'deliveryCharges',
            ): number => {
              const clerkKey = `clerk${field[0].toUpperCase()}${field.slice(1)}` as const;
              const raw =
                (finalizeDetail?.[clerkKey] ?? (finalizeTicket as Record<string, unknown>)[clerkKey]) ??
                (finalizeDetail?.[field] ?? (finalizeTicket as Record<string, unknown>)[field]);
              return Number(raw ?? 0);
            };
```

Note the `additionalCharges` case is dropped from the union — it has no clerk column and is not part of clerk pay. Remove the `Clerk submitted:` line under the Additional Cost input (line ~2506).

- [ ] **Step 2: Itemize the earnings line**

At line ~327, replace the `computeClerkEarnings({...})` call with `computeClerkEarningsBreakdown({...})` (same argument object, plus the four `clerk*Charges` fields from the ticket), and render the itemized parts beneath the total, skipping zero lines:

```tsx
<p className="mt-1 text-xs text-slate-500">
  {[
    ['Clerk cost', b.base],
    ['Attested', b.attested],
    ['Non-attested', b.nonAttested],
    ['Printing', b.printing],
    ['Delivery', b.delivery],
    ['PDF', b.pdfFee],
  ]
    .filter(([, v]) => Number(v) > 0)
    .map(([label, v]) => `${label} ${Number(v).toLocaleString()}`)
    .join('  +  ')}
</p>
```

- [ ] **Step 3: Add a source-level guard test**

Create/append `apps/web/components/ticket-board.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ticket-board.tsx'),
  'utf8',
);

it('uses the shared breakdown, never a hand-rolled clerk sum', () => {
  expect(src).toMatch(/computeClerkEarningsBreakdown\(/);
});

it('clerkSubmitted reads the clerk set', () => {
  expect(src).toMatch(/clerk\$\{field\[0\]\.toUpperCase\(\)\}/);
});
```

> Per the established web-test convention: `__dirname` is undefined (ESM), and
> guards must match **usage**, not a bare identifier that an import line would
> satisfy. Mutation-test each guard — break the source, confirm the test fails,
> restore.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @wusuq/web test && pnpm --filter @wusuq/web typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ticket-board.tsx apps/web/components/ticket-board.test.ts
git commit -m "feat(web): itemize clerk earnings and fix the clerk-submitted line"
```

---

### Task 8: Staff ticket detail panel — itemization

**Files:**
- Modify: `apps/web/components/ticket-detail-panel.tsx:355`
- Test: `apps/web/components/ticket-detail-panel.test.ts` (create if absent)

**Interfaces:**
- Consumes: Task 2 `computeClerkEarningsBreakdown`.

- [ ] **Step 1: Swap to the breakdown**

Replace `const clerkEarnings = computeClerkEarnings({ ...ticket, wantPdf });` with:

```ts
const clerkBreakdown = computeClerkEarningsBreakdown({ ...ticket, wantPdf });
const clerkEarnings = clerkBreakdown.total;
```

Update the import on line 11 to `computeClerkEarningsBreakdown`. Render the same itemized line as Task 7 Step 2 beneath the earnings total.

- [ ] **Step 2: Guard that consumers never see it**

Append to `apps/web/components/consumer-ticket-board.test.ts`:

```ts
it('consumer detail never renders clerk earnings or the clerk set', () => {
  expect(src).not.toMatch(/computeClerkEarnings/);
  expect(src).not.toMatch(/clerkNonAttestedCharges/);
});
```

- [ ] **Step 3: Run tests + typecheck**

Run: `pnpm --filter @wusuq/web test && pnpm --filter @wusuq/web typecheck`
Expected: PASS, exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ticket-detail-panel.tsx apps/web/components/ticket-detail-panel.test.ts apps/web/components/consumer-ticket-board.test.ts
git commit -m "feat(web): itemize clerk earnings on the staff ticket panel"
```

---

### Task 9: Full verification

- [ ] **Step 1: Whole-repo gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @wusuq/web test`
Expected: 0 lint errors, exit 0, all API + web tests green.

- [ ] **Step 2: End-to-end reproduction of the client's case**

Against a local dev DB, drive a ticket through: assign (clerk cost 400) → clerk submits 50 non-attested pages @ 5 (=250) + delivery 200 → admin edits the rate to 10/page (=500) → Review & Complete.

Confirm on screen:
- Clerk earnings **850** (not 1,100), itemized `Clerk cost 400 + Non-attested 250 + Delivery 200`
- Wusuq earnings **350** (not 100)
- Ticket total still **1,200** — the consumer is unaffected
- Reopening the dialog still shows `Clerk submitted: PKR 250`

- [ ] **Step 3: Update CLAUDE.md**

Add to the money-model section: `computeClerkEarningsBreakdown` is the single source for clerk payout; each phase-2 line is capped at the clerk's submitted value; `finalizeRemainderCore` must never write the `clerk*Charges` columns; the consumer view strips them and the representative view deliberately keeps them.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the clerk-payout cap invariant"
```

---

## Self-review notes

- **Spec coverage:** storage → T1; write boundary → T3; cap rule + shared fn → T2; five consumers → T5 (dashboard), T6 (finance ×2), T7 (dialog + clerk-submitted line), T8 (detail panel); redaction → T4; tests → per-task + T9.
- **Type consistency:** `computeClerkEarningsBreakdown` / `ClerkEarningsBreakdown` / the four `clerk*Charges` names are used identically in every task.
- **Known deviation:** T6 is gated on owner sign-off because it changes payout amounts; all other tasks are safe to run in sequence.
