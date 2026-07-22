# USD → PKR Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show staff/SuperAdmin the PKR equivalent of USD tickets, while the consumer keeps seeing USD.

**Architecture:** A nullable `Ticket.fxRateToPkr` rate column stamped at intake (USD stays the source of truth — display-only conversion). Two pure functions in `@wusuq/shared` (`convertToPkr`, `formatStaffMoney`) become the single conversion path; ~7 staff surfaces adopt `formatStaffMoney` in place of hand-rolled `"PKR "`/`"Rs "` literals. Multi-user aggregates sum PKR equivalents. Separately, the server stops trusting client-supplied currency on wallet writes.

**Tech Stack:** NestJS 11 + Prisma (Neon Postgres), Next.js 16, TypeScript, Jest.

**Spec:** `DOcs/superpowers/specs/2026-07-23-usd-pkr-conversion-design.md`

## Global Constraints

- **Neon migrations:** apply with `prisma db execute` + `prisma migrate resolve --applied`. **Never `prisma migrate dev`** — it demands a full DB reset on this database. Tasks only WRITE migrations; never apply them.
- **Display-only conversion.** `Ticket.currency`, `Ticket.totalAmount` and every other money column stay in the ticket's own currency. Never write a converted amount to a money column.
- **Never fall back to rate 1.0.** A missing rate renders an explicit marker, never an unconverted number. That silent fallback is the existing bug.
- `formatStaffMoney` is the single staff-facing money formatter; `formatMoney(amount, currency)` remains the consumer-facing one. Never hand-roll a currency literal at a call site.
- **These four boards keep their hardcoded PKR — do NOT convert them:** `cost-rules-board.tsx`, `pricing-rules-board.tsx`, `promo-codes-board.tsx`, `exchange-rate-board.tsx`. They are PKR-denominated business config, not ticket-currency-bearing.
- **Clerk-facing amounts stay PKR unconditionally** (`clerkCost`, per-page rates, clerk earnings) — clerk payouts are domestic regardless of consumer currency.
- **`/wallet/me` is NOT converted** — it is consumer-facing and already single-currency per user.
- Jest 30: the flag is `--testPathPatterns` (plural); the pnpm test script already supplies `--`.
- Rebuild shared before API/web typecheck: `pnpm --filter @wusuq/shared build`.
- Run `npx prettier --write` on any `apps/api` file you touch — eslint enforces prettier and lint must end at 0 errors.

---

## Phase 1 — Conversion core

### Task 1: `Ticket.fxRateToPkr` column

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Ticket model, beside the other currency fields)
- Create: `apps/api/prisma/migrations/20260723000000_add_ticket_fx_rate/migration.sql`

**Interfaces:**
- Produces: `Ticket.fxRateToPkr` — `Decimal? @db.Decimal(18, 6)`.

- [ ] **Step 1: Add the column**

In `apps/api/prisma/schema.prisma`, immediately after the `currency` field on the `Ticket` model:

```prisma
  /// FX rate to PKR captured at intake for non-PKR tickets, so a historical
  /// ticket's staff-side PKR figure never moves when the rate is later updated
  /// (same stamping rule as taxRate). NULL for PKR tickets (no conversion is
  /// needed) and for USD tickets created before this feature — those render an
  /// explicit "rate not set" marker, never an unconverted number.
  fxRateToPkr           Decimal?            @db.Decimal(18, 6)
```

- [ ] **Step 2: Write the migration SQL**

Create `apps/api/prisma/migrations/20260723000000_add_ticket_fx_rate/migration.sql`:

```sql
ALTER TABLE "Ticket" ADD COLUMN "fxRateToPkr" DECIMAL(18,6);
```

- [ ] **Step 3: Regenerate the client**

Run: `cd apps/api && pnpm prisma:generate`
Expected: `Generated Prisma Client`, no errors.

- [ ] **Step 4: Verify types**

Run: `cd apps/api && pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260723000000_add_ticket_fx_rate/
git commit -m "feat(api): add Ticket.fxRateToPkr rate snapshot column"
```

> **Deploy note (do NOT run now):** `cd apps/api && npx prisma db execute --file prisma/migrations/20260723000000_add_ticket_fx_rate/migration.sql` then `npx prisma migrate resolve --applied 20260723000000_add_ticket_fx_rate`.

---

### Task 2: `convertToPkr` + `formatStaffMoney` in `@wusuq/shared`

**Files:**
- Modify: `packages/shared/src/index.ts` (beside `formatMoney`, ~line 795-812)
- Test: `apps/api/src/currency/staff-money.spec.ts` (create)

**Interfaces:**
- Produces:
  - `convertToPkr(amount: number | string | null | undefined, rate: number | string | null | undefined): number | null`
  - `formatStaffMoney(amount: number | string | null | undefined, currency: Currency, fxRateToPkr?: number | string | null): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/currency/staff-money.spec.ts`:

```ts
import { convertToPkr, formatStaffMoney } from '@wusuq/shared';

describe('convertToPkr', () => {
  it('multiplies by the rate', () => {
    expect(convertToPkr(35, 285)).toBe(9975);
  });

  it('accepts string/Decimal-ish inputs', () => {
    expect(convertToPkr('35', '285')).toBe(9975);
  });

  it('rounds to 2 decimals', () => {
    expect(convertToPkr(35, 277.7)).toBe(9719.5);
  });

  it('returns null when the rate is missing — never falls back to 1', () => {
    expect(convertToPkr(35, null)).toBeNull();
    expect(convertToPkr(35, undefined)).toBeNull();
  });

  it('treats a missing amount as 0, not null', () => {
    expect(convertToPkr(null, 285)).toBe(0);
  });
});

describe('formatStaffMoney', () => {
  it('passes PKR straight through', () => {
    expect(formatStaffMoney(500, 'PKR')).toBe('PKR 500');
  });

  it('ignores a stray rate on a PKR ticket', () => {
    expect(formatStaffMoney(500, 'PKR', 285)).toBe('PKR 500');
  });

  it('renders the PKR equivalent for a USD ticket', () => {
    expect(formatStaffMoney(35, 'USD', 285)).toBe('PKR 9,975');
  });

  it('marks a USD ticket with no rate instead of showing a wrong number', () => {
    expect(formatStaffMoney(35, 'USD', null)).toBe('$35.00 (rate not set)');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm test --testPathPatterns=staff-money`
Expected: FAIL — `convertToPkr is not a function`.

- [ ] **Step 3: Implement**

In `packages/shared/src/index.ts`, immediately after `formatMoney`:

```ts
/**
 * Convert an amount into PKR using a stamped FX rate. Returns null when no rate
 * is available — callers MUST render a marker rather than an unconverted number.
 * Never falls back to a rate of 1: that fallback is exactly how a $35 ticket
 * came to display as "Rs 35".
 */
export function convertToPkr(
  amount: number | string | null | undefined,
  rate: number | string | null | undefined,
): number | null {
  if (rate === null || rate === undefined || rate === '') return null;
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return null;
  const a = Number(amount ?? 0) || 0;
  return round2(a * r);
}

/**
 * Staff-facing money. PKR tickets pass straight through, so every staff surface
 * can call this unconditionally. A non-PKR ticket renders its PKR equivalent
 * from the rate stamped on the ticket; when that rate is absent it renders the
 * original amount plus an explicit marker, never a converted-looking number.
 *
 * Consumer-facing surfaces use formatMoney(amount, currency) instead — a
 * consumer must see the currency they were quoted.
 */
export function formatStaffMoney(
  amount: number | string | null | undefined,
  currency: Currency,
  fxRateToPkr?: number | string | null,
): string {
  const a = Number(amount ?? 0) || 0;
  if (currency === 'PKR') return formatMoney(a, 'PKR');
  const pkr = convertToPkr(a, fxRateToPkr);
  if (pkr === null) return `${formatMoney(a, currency)} (rate not set)`;
  return formatMoney(pkr, 'PKR');
}
```

- [ ] **Step 4: Build shared and run the tests**

Run: `pnpm --filter @wusuq/shared build && cd apps/api && pnpm test --testPathPatterns=staff-money`
Expected: PASS, 9/9.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/currency/staff-money.spec.ts
git commit -m "feat(shared): add convertToPkr and formatStaffMoney"
```

---

### Task 3: Stamp the rate at intake; drop the silent 1.0 fallback

**Files:**
- Modify: `apps/api/src/currency/currency.service.ts:12-22` (`convert`)
- Modify: `apps/api/src/tickets/tickets.service.ts` (`createIntakeTicket`, and `regenerate` ~line 2709)
- Modify: `apps/api/src/tickets/tickets.module.ts` (import `CurrencyModule`)
- Test: `apps/api/src/tickets/fx-stamp.spec.ts` (create)

**Interfaces:**
- Consumes: `Ticket.fxRateToPkr` (Task 1).
- Produces: `CurrencyService.getRateToPkr(from: string): Promise<number | null>` — latest `from → PKR` rate, or null. `createIntakeTicket` and `regenerate` write `fxRateToPkr`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tickets/fx-stamp.spec.ts`:

```ts
describe('fxRateToPkr stamping', () => {
  it('stamps the current rate on a USD ticket at intake', async () => {
    const { data } = await captureIntakeCreate({ userCurrency: 'USD', rate: 285 });
    expect(Number(data.fxRateToPkr)).toBe(285);
  });

  it('leaves fxRateToPkr null on a PKR ticket', async () => {
    const { data } = await captureIntakeCreate({ userCurrency: 'PKR', rate: 285 });
    expect(data.fxRateToPkr ?? null).toBeNull();
  });

  it('stamps null (does not block intake) when no rate exists', async () => {
    const { data } = await captureIntakeCreate({ userCurrency: 'USD', rate: null });
    expect(data.fxRateToPkr ?? null).toBeNull();
  });
});
```

> Implementer note: `captureIntakeCreate` is a helper you write in this file that instantiates `TicketsService` using the existing mocked-Prisma pattern from a neighbouring spec in `apps/api/src/tickets/`, stubs `CurrencyService.getRateToPkr` to return the given rate, calls `createIntakeTicket`, and returns the object passed to `tx.ticket.create`. Copy the mock setup from the nearest existing intake spec — do not invent a new one.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm test --testPathPatterns=fx-stamp`
Expected: FAIL — `fxRateToPkr` is undefined on the create payload.

- [ ] **Step 3: Add `getRateToPkr` and remove the 1.0 fallback**

Replace `convert` in `apps/api/src/currency/currency.service.ts` and add the new method:

```ts
  /**
   * Latest `from → PKR` rate, or null when none has been configured.
   * Callers must handle null explicitly — see convertToPkr in @wusuq/shared.
   */
  async getRateToPkr(from: string): Promise<number | null> {
    if (from === 'PKR') return null;
    const rate = await this.prisma.exchangeRate.findFirst({
      where: { fromCurrency: from, toCurrency: 'PKR' },
      orderBy: { effectiveAt: 'desc' },
    });
    return rate ? Number(rate.rate) : null;
  }

  /**
   * Convert an amount between currencies. Returns null when no rate exists —
   * it previously returned the amount UNCONVERTED, which is how a $35 ticket
   * rendered as "Rs 35". Never restore that fallback.
   */
  async convert(amount: number, from: string, to: string): Promise<number | null> {
    if (from === to) return amount;
    const rate = await this.prisma.exchangeRate.findFirst({
      where: { fromCurrency: from, toCurrency: to },
      orderBy: { effectiveAt: 'desc' },
    });
    if (!rate) return null;
    return amount * Number(rate.rate);
  }
```

Then run `grep -rn "\.convert(" apps/api/src --include=*.ts` and update every caller to handle `null`. (At the time of writing there are none outside the currency module — confirm this rather than assuming, and report what you find.)

- [ ] **Step 4: Stamp at intake**

In `apps/api/src/tickets/tickets.service.ts`, inject `CurrencyService` into the constructor (and add `CurrencyModule` to the `imports` of `apps/api/src/tickets/tickets.module.ts`). In `createIntakeTicket`, after the ticket currency is resolved and before `tx.ticket.create`, compute:

```ts
    // Stamp the FX rate in force NOW so this ticket's staff-side PKR figure
    // never moves when the rate is later updated (same rule as taxRate).
    // NULL when the ticket is PKR, or when no rate has been configured — the
    // UI then shows "rate not set" rather than a wrong number. Intake is NOT
    // blocked: USD pricing is an all-inclusive flat list, not FX-derived.
    const fxRateToPkr =
      ticketCurrency === 'PKR'
        ? null
        : ((await this.currencyService?.getRateToPkr(ticketCurrency)) ?? null);
```

and pass `fxRateToPkr` in the `data` of `tx.ticket.create`. Do the same in `regenerate` (a clone is a new sale at the current rate, matching its existing re-pricing rule).

> Inject `CurrencyService` as an OPTIONAL constructor param (`private readonly currencyService?: CurrencyService`) and access it with `?.`, matching how `settingsService?` / `promosService?` are already injected — roughly 30 existing test instantiations construct `TicketsService` positionally and must keep compiling.

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && pnpm test --testPathPatterns="fx-stamp|tickets|currency"`
Expected: PASS, no pre-existing tests broken.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/currency/currency.service.ts apps/api/src/tickets/tickets.service.ts apps/api/src/tickets/tickets.module.ts apps/api/src/tickets/fx-stamp.spec.ts
git commit -m "feat(api): stamp fxRateToPkr at intake; drop the silent rate-1.0 fallback"
```

---

## Phase 2 — Staff display

### Task 4: Staff ticket surfaces

**Files:**
- Modify: `apps/web/components/ticket-board.tsx:146` (the `rs()` helper) and its call sites `1441, 1732, 1939, 1943`; the derived totals at `2594, 2597, 2605, 2628`
- Modify: `apps/web/components/ticket-detail-panel.tsx:363, 370, 389, 392, 395, 398`
- Modify: `apps/web/components/ticket-charges-board.tsx:290, 293, 296, 360, 366, 372, 378, 383, 384, 385, 386`
- Test: `apps/web/components/staff-money.test.ts` (create)

**Interfaces:**
- Consumes: `formatStaffMoney(amount, currency, fxRateToPkr)` (Task 2).

- [ ] **Step 1: Replace the `rs()` helper in ticket-board**

`apps/web/components/ticket-board.tsx:146` currently reads:

```ts
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;
```

Delete it and call `formatStaffMoney(amount, ticket.currency, ticket.fxRateToPkr)` at each of the four consumer-money call sites (`1441, 1732, 1939, 1943`) and at the derived-total sites (`2594, 2597, 2605, 2628`).

**Leave the clerk-cost sites at `2013, 2026, 2036, 2481, 2484, 2499, 2502, 2521, 2524, 2533` on their literal `"PKR "`** — clerk payouts are domestic. Add a short comment at the first of them saying so, so the next sweep does not "fix" them.

- [ ] **Step 2: Same swap in ticket-detail-panel and ticket-charges-board**

In `ticket-detail-panel.tsx`, convert the consumer-money rows (`chargeRows` totals, Total / Amount Paid / Remaining at `389, 392, 395, 398`). Leave `ticket.clerkCost` (`259`), the clerk/Wusuq earnings lines (`363, 370` — verify which of these are clerk-side before converting) and the per-page rates (`502, 508`) as PKR.

In `ticket-charges-board.tsx`, convert `totalAmount`/discount/promo/tax (`290, 360, 366, 372, 378, 383`) and give `amountPaid`/`remaining` (`293, 296, 384, 385`) a currency label — they currently render with **none at all**. Leave `clerkPayout` (`386`) as PKR.

- [ ] **Step 3: Add the guard test**

Create `apps/web/components/staff-money.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');

describe('staff surfaces use the shared converter', () => {
  for (const f of ['ticket-board.tsx', 'ticket-detail-panel.tsx', 'ticket-charges-board.tsx']) {
    it(`${f} calls formatStaffMoney`, () => {
      expect(read(f)).toMatch(/formatStaffMoney\(/);
    });
  }

  it('ticket-board no longer defines the hand-rolled rs() helper', () => {
    expect(read('ticket-board.tsx')).not.toMatch(/const rs = \(n: number\)/);
  });
});

describe('PKR-denominated config boards keep their literal PKR', () => {
  for (const f of [
    'cost-rules-board.tsx',
    'pricing-rules-board.tsx',
    'promo-codes-board.tsx',
    'exchange-rate-board.tsx',
  ]) {
    it(`${f} is not converted`, () => {
      expect(read(f)).not.toMatch(/formatStaffMoney\(/);
    });
  }
});
```

> Guards must match USAGE (`formatStaffMoney\(` with the paren), never a bare identifier — a bare match is satisfied by the import line alone. MUTATION-TEST each: break the source, confirm the test fails, restore.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @wusuq/web test && pnpm --filter @wusuq/web typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ticket-board.tsx apps/web/components/ticket-detail-panel.tsx apps/web/components/ticket-charges-board.tsx apps/web/components/staff-money.test.ts
git commit -m "feat(web): staff ticket surfaces render PKR-converted amounts"
```

---

### Task 5: Finance board, portal dashboard rows, operational queue

**Files:**
- Modify: `apps/web/components/finance-board.tsx:318, 388, 389, 435`
- Modify: `appsts/web/app/(portal)/dashboard/page.tsx:424` (the `rs()` helper) and `377`
- Modify: `apps/web/components/dashboard/operational-queue.tsx:192`
- Test: `apps/web/components/staff-money.test.ts` (extend)

**Interfaces:**
- Consumes: `formatStaffMoney` (Task 2).

> Correct path for the dashboard page is `apps/web/app/(portal)/dashboard/page.tsx` — the line above contains a typo (`appts`); use the correct path.

- [ ] **Step 1: Convert the per-row amounts**

In `finance-board.tsx`, convert the pending-transaction amount (`435`) and the per-ticket amounts using each row's own `currency` + `fxRateToPkr`. **KPI cards at `388, 389` are handled in Task 6** — leave them for now.

In `app/(portal)/dashboard/page.tsx`, delete the `rs()` helper at `424` and convert the ticket row amount at `377` using that row's currency/rate. **The KPI cards at `238, 246, 352, 353` are Task 6.**

In `dashboard/operational-queue.tsx:192`, `r.totalAmount` currently renders through a bare `.toLocaleString()` with **no currency indicator at all** — give it `formatStaffMoney`.

- [ ] **Step 2: Extend the guard test**

Append to `apps/web/components/staff-money.test.ts`:

```ts
describe('finance and dashboard rows use the shared converter', () => {
  it('finance-board calls formatStaffMoney', () => {
    expect(read('finance-board.tsx')).toMatch(/formatStaffMoney\(/);
  });

  it('operational-queue labels its amounts', () => {
    expect(read('dashboard/operational-queue.tsx')).toMatch(/formatStaffMoney\(/);
  });
});
```

- [ ] **Step 3: Run tests and typecheck**

Run: `pnpm --filter @wusuq/web test && pnpm --filter @wusuq/web typecheck`
Expected: PASS, exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/finance-board.tsx "apps/web/app/(portal)/dashboard/page.tsx" apps/web/components/dashboard/operational-queue.tsx apps/web/components/staff-money.test.ts
git commit -m "feat(web): convert finance and dashboard row amounts to PKR"
```

---

## Phase 3 — Aggregation

### Task 6: Multi-user aggregates sum PKR equivalents

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts` (the KPI query — `totalRevenue`, `outstandingBalance`)
- Modify: `apps/api/src/finance/finance.service.ts` (the `summary` reduce, ~line 63-70)
- Modify: `apps/web/components/wallet-board.tsx` (admin all-wallets table, `220, 224, 244`)
- Test: `apps/api/src/dashboard/aggregate-currency.spec.ts` (create)

**Interfaces:**
- Consumes: `convertToPkr` (Task 2), `Ticket.fxRateToPkr` (Task 1).
- Produces: KPI/summary payloads gain `unconvertedCount: number` — tickets excluded from the PKR total for want of a rate.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/dashboard/aggregate-currency.spec.ts`:

```ts
import { convertToPkr } from '@wusuq/shared';

describe('mixed-currency aggregation', () => {
  const tickets = [
    { totalAmount: 500, currency: 'PKR', fxRateToPkr: null },
    { totalAmount: 35, currency: 'USD', fxRateToPkr: 285 },
    { totalAmount: 20, currency: 'USD', fxRateToPkr: null }, // no rate
  ];

  const sumPkr = (rows: typeof tickets) =>
    rows.reduce(
      (acc, t) => {
        if (t.currency === 'PKR') return { ...acc, total: acc.total + Number(t.totalAmount) };
        const pkr = convertToPkr(t.totalAmount, t.fxRateToPkr);
        return pkr === null
          ? { ...acc, unconvertedCount: acc.unconvertedCount + 1 }
          : { ...acc, total: acc.total + pkr };
      },
      { total: 0, unconvertedCount: 0 },
    );

  it('sums PKR equivalents rather than raw mixed amounts', () => {
    // Raw (buggy) sum would be 555. Correct: 500 + (35 x 285) = 10,475.
    expect(sumPkr(tickets).total).toBe(10475);
  });

  it('excludes and COUNTS rate-less tickets instead of understating silently', () => {
    expect(sumPkr(tickets).unconvertedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm test --testPathPatterns=aggregate-currency`
Expected: PASS for the helper shape (it is self-contained), which pins the contract the services must adopt. Proceed to Step 3.

- [ ] **Step 3: Apply the same reduce in both services**

In `dashboard.service.ts`, the KPI query must `select` `currency` and `fxRateToPkr` alongside `totalAmount`/`amountPaid`, and `totalRevenue` / `outstandingBalance` become PKR sums using the reduce shape above. Return `unconvertedCount` in the KPI payload.

In `finance.service.ts` (~63-70), the `summary` reduce over `items` does the same for `totalAmount` / `paidAmount`. Both queries already use `include`, so `currency` and `fxRateToPkr` are present.

- [ ] **Step 4: Surface it on the web**

`app/(portal)/dashboard/page.tsx` KPI cards (`238, 246, 352, 353`) and `finance-board.tsx` KPI cards (`388, 389`) now render a value that is already PKR — label them `PKR` plainly (they are converted totals, not a single ticket's currency). Where `unconvertedCount > 0`, render a short note such as `N ticket(s) excluded — FX rate not set` beneath the card, so a total is never silently understated.

In `wallet-board.tsx`, the **admin all-wallets table** (`220, 224, 244`) spans users of different currencies — convert those. The **own-wallet** figures in the same file (`64, 355, 442, 503, 588`) are single-user and must render in that user's own currency via `formatMoney`.

- [ ] **Step 5: Run the full gate**

Run: `cd apps/api && pnpm test && cd .. && cd .. && pnpm --filter @wusuq/web test && pnpm typecheck`
Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/finance/finance.service.ts apps/api/src/dashboard/aggregate-currency.spec.ts apps/web/components/wallet-board.tsx apps/web/components/finance-board.tsx "apps/web/app/(portal)/dashboard/page.tsx"
git commit -m "feat: aggregate multi-user totals in PKR and count rate-less tickets"
```

---

## Phase 4 — Write path

### Task 7: Server derives currency; DTOs stop accepting it

**Files:**
- Modify: `apps/api/src/wallet/dto/topup-wallet.dto.ts:29` (remove `currency`)
- Modify: `apps/api/src/wallet/wallet.service.ts:83` (derive from the user)
- Modify: `apps/api/src/finance/finance.service.ts:223` (derive from the ticket, not a `'PKR'` default)
- Modify: `apps/api/src/finance/dto/reconcile-payment.dto.ts` (remove `currency`)
- Modify: `apps/web/components/finance-board.tsx:194`, `apps/web/components/users-board.tsx:141`, `apps/web/components/wallet-board.tsx:64` (stop sending it)
- Modify: `apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx` (move its client-side conversion to the server — see the constraint below)
- Test: `apps/api/src/wallet/derived-currency.spec.ts` (create)

**Interfaces:**
- Produces: `WalletTransaction.currency` is always the target user's currency; `Payment`/reconcile currency is always the ticket's.

> ### ⚠️ HARD CONSTRAINT — read before writing any code
>
> **Scope narrowed 2026-07-23 (owner clarification):** everything below applies to the
> **JazzCash / EasyPaisa rails ONLY**. A bank transfer is sent in USD from the consumer's own
> foreign bank and auto-converted by the receiving Pakistani bank, so that path performs **no
> conversion at all** — what the consumer types is what is credited. Read the reworked Task 8
> first; it makes the conversion method-conditional.
>
> **Task 8 ships a client-side FX conversion on this exact path.** `pay/page.tsx`
> divides the PKR amount the consumer enters by `ticket.fxRateToPkr` before POSTing to
> `/wallet/topup`, because `verifyTopup` (`wallet.service.ts:170-174`) does
> `walletBalance: { increment: locked.amount }` with **zero FX awareness**, and `walletBalance`
> is denominated in the user's native currency. Without that division, paying a $35 USD ticket
> would credit **9,975 USD-units** and leave ~$9,940 of phantom credit that FIFO auto-settlement
> would silently spend.
>
> **If you add server-side conversion without removing the client-side one, the amount is
> divided by the rate TWICE.** This repo has already shipped exactly this class of seam defect
> (Plan A Tasks 4+5 were each correct alone and produced a live open redirect at the boundary).
>
> **Do this:** move the conversion to the server in THIS task. Accept the PKR figure the consumer
> actually wired, convert with `ticket.fxRateToPkr` server-side, remove the client-side division
> from `pay/page.tsx`, and persist **both** figures plus the rate on `WalletTransaction`
> (`amount` in native currency, plus the submitted PKR amount and the rate used). Currency and
> amount-units must not be derived on opposite sides of the trust boundary.
>
> Persisting both also fixes a real reconciliation gap: today the wired PKR figure is destroyed,
> so the admin verification card shows `35 USD` while the bank receipt says `PKR 9,975`.
> That needs an additive migration for the two new `WalletTransaction` columns.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/wallet/derived-currency.spec.ts`:

```ts
describe('wallet write path derives currency server-side', () => {
  it('stamps the USER currency on a top-up, ignoring any client value', async () => {
    const { data } = await captureTopup({
      userCurrency: 'USD',
      dto: { amount: 100, paymentMode: 'BANK_TRANSFER', currency: 'PKR' } as never,
    });
    expect(data.currency).toBe('USD');
  });

  it('stamps PKR for a PKR user', async () => {
    const { data } = await captureTopup({
      userCurrency: 'PKR',
      dto: { amount: 100, paymentMode: 'BANK_TRANSFER' } as never,
    });
    expect(data.currency).toBe('PKR');
  });
});
```

> Implementer note: `captureTopup` instantiates `WalletService` with the mocked-Prisma pattern from a neighbouring spec in `apps/api/src/wallet/`, stubs the user lookup to return `userCurrency`, calls the top-up method, and returns the object passed to `walletTransaction.create`. The `currency: 'PKR'` in the first test's dto is deliberately a LIE — the assertion proves the server ignores it.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && pnpm test --testPathPatterns=derived-currency`
Expected: FAIL — the persisted currency is the client-supplied `'PKR'`.

- [ ] **Step 3: Derive server-side and remove the DTO fields**

In `wallet.service.ts`, look up the target user's `currency` and write that to `WalletTransaction.currency`, ignoring any dto value. Delete the `currency` field from `TopupWalletDto` (the whitelist `ValidationPipe` then strips a stray client value automatically).

In `finance.service.ts:223`, replace the `?? 'PKR'` default with the ticket's own `currency`. Delete `currency` from `ReconcilePaymentDto`.

- [ ] **Step 4: Stop sending it from the three forms**

Remove `currency: 'PKR'` from the POST bodies in `finance-board.tsx:194`, `users-board.tsx:141`, `wallet-board.tsx:64`.

- [ ] **Step 5: Fix the notification copy**

In `apps/api/src/notifications/notification-templates.ts` (lines 80, 84, 93, 94, 102, 106, 118), replace every hardcoded `` `PKR ${amount}` `` with `formatMoney(amount, currency)`, threading the transaction's/ticket's currency into each template function's signature and updating its callers.

- [ ] **Step 6: Run the full gate**

Run: `cd apps/api && pnpm test && cd ../.. && pnpm --filter @wusuq/web test && pnpm typecheck && pnpm lint`
Expected: PASS, exit 0, 0 lint errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/wallet apps/api/src/finance apps/api/src/notifications apps/web/components/finance-board.tsx apps/web/components/users-board.tsx apps/web/components/wallet-board.tsx
git commit -m "fix(api): derive wallet/payment currency server-side instead of trusting the client"
```

---

## Phase 5 — Consumer

### Task 8 (REWORKED 2026-07-23): Method-conditional payment currency

> **This task was rewritten after an owner clarification.** The original version converted the
> pay-page amount to PKR unconditionally. That is wrong for bank transfers: an overseas consumer
> wires **USD** from their own foreign bank and the receiving Pakistani bank auto-converts on
> arrival, so the consumer never types a PKR figure and we must not ask them to. But some overseas
> Pakistanis pay via JazzCash/EasyPaisa, which ARE domestic PKR rails. The currency therefore
> follows the **payment rail**, not the ticket.
>
> An earlier commit (`65bff26`, refined by `2ab9222`) already shipped the unconditional version plus
> `apps/web/lib/pay-amount.ts`. This task narrows that to the PKR rails; it does NOT revert it.

**Files:**
- Modify: `apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx`
- Modify: `apps/web/lib/pay-amount.ts` (narrow to the PKR rails)
- Modify: `apps/web/lib/pay-amount.test.ts` (retarget the existing tests)
- Modify: `apps/web/components/consumer-wallet-board.tsx` (verify only — see Step 3)
- Test: `apps/web/components/consumer-money.test.ts` (already exists)

**Interfaces:**
- Consumes: `convertToPkr` (Task 2), `formatMoney`, `Ticket.fxRateToPkr` (Task 1).
- Produces: `isPkrRail(paymentMode): boolean` in `apps/web/lib/pay-amount.ts` — true for
  `JAZZ_CASH` and `EASY_PAISA`, false for `BANK_TRANSFER`. Task 7 consumes this to decide whether
  the server must convert.

- [ ] **Step 1: Add the rail predicate and narrow the conversion helpers**

In `apps/web/lib/pay-amount.ts`:

```ts
/**
 * Domestic PKR rails. A consumer using these already holds PKR, so the amount
 * they enter is PKR and must be converted to the wallet's native currency.
 * BANK_TRANSFER is NOT a PKR rail: the consumer wires USD from their own
 * foreign bank and the receiving Pakistani bank auto-converts on arrival, so
 * what they type is what is credited and no conversion applies.
 */
export function isPkrRail(paymentMode: string | null | undefined): boolean {
  return paymentMode === 'JAZZ_CASH' || paymentMode === 'EASY_PAISA';
}
```

`payableInPkr` and `submitAmountFromPkr` keep their current behaviour but are now only called when
`isPkrRail(paymentMode)` is true. Update their doc comments to say so explicitly.

- [ ] **Step 2: Make the pay page follow the rail**

The page already has a payment-method picker. Drive the amount field from it:

- **`BANK_TRANSFER` on a USD ticket:** label `Amount (USD)`, prefill the raw USD due, **no
  conversion on submit**. Beneath it render an explicitly hedged indicative line:
  `≈ PKR 9,975 will reach the account — your bank sets the final rate`. Use `payableInPkr` for that
  figure and render nothing when the rate is null (it is informational; a missing rate must not
  block a bank transfer, because no conversion is involved).
- **`JAZZ_CASH` / `EASY_PAISA` on a USD ticket:** label `Amount (PKR)`, prefill the converted PKR,
  convert back on submit via `submitAmountFromPkr`, and show `credits $35.00 to your wallet`. When
  `fxRateToPkr` is null, keep the existing triple guard — no prefill, input disabled, submit
  disabled, `FX rate not set — please contact support`.
- **Any PKR ticket:** behaves exactly as it does today, on every rail.

Switching method must recompute the field — do not leave a stale PKR figure in a USD-labelled field.

- [ ] **Step 3: Confirm the top-up dialog needs no further change**

A generic top-up has no ticket and therefore no stamped rate, so it stays
`Amount (<user currency>)` — USD-only for USD users. Inventing a rate at top-up time is explicitly
rejected. `consumer-wallet-board.tsx` already does this after the earlier commit; verify and change
nothing.

- [ ] **Step 4: Retarget the tests**

`apps/web/lib/pay-amount.test.ts` currently asserts the unconditional behaviour. Add:

```ts
import { isPkrRail } from './pay-amount';

describe('isPkrRail', () => {
  it('treats JazzCash and EasyPaisa as PKR rails', () => {
    expect(isPkrRail('JAZZ_CASH')).toBe(true);
    expect(isPkrRail('EASY_PAISA')).toBe(true);
  });

  it('does NOT treat a bank transfer as a PKR rail', () => {
    // The consumer wires USD from a foreign bank; the receiving Pakistani bank
    // converts. Treating this as a PKR rail would ask them to send a number
    // they are not sending, and would double-count on submit.
    expect(isPkrRail('BANK_TRANSFER')).toBe(false);
  });

  it('defaults to not-a-PKR-rail for unknown or missing modes', () => {
    expect(isPkrRail(null)).toBe(false);
    expect(isPkrRail(undefined)).toBe(false);
    expect(isPkrRail('SOMETHING_NEW')).toBe(false);
  });
});
```

Keep the existing round-trip tests — they still govern the JazzCash/EasyPaisa path.

Add a source-level guard to `apps/web/components/consumer-money.test.ts`:

```ts
it('pay page gates its FX conversion on the payment rail', () => {
  const src = readFileSync(
    join(here, '../app/(consumer)/consumer/tickets/[id]/pay/page.tsx'),
    'utf8',
  );
  expect(src).toMatch(/isPkrRail\(/);
});
```

Mutation-test it: remove the `isPkrRail(` call from the page, confirm the test fails, restore.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @wusuq/web test && pnpm --filter @wusuq/web typecheck`
Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx" apps/web/lib/pay-amount.ts apps/web/lib/pay-amount.test.ts apps/web/components/consumer-money.test.ts
git commit -m "fix(web): make consumer payment currency follow the payment rail"
```

---

### Task 9: Full verification

- [ ] **Step 1: Whole-repo gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @wusuq/web test`
Expected: 0 lint errors, exit 0, all API + web tests green.

- [ ] **Step 2: End-to-end check against a local dev DB**

Set a USD→PKR rate of 285 on `/manage-cost/exchange-rates`. Create a USD ticket for $35. Confirm:
- staff ticket list and detail show **PKR 9,975**, not `Rs 35`
- the consumer's own ticket view still shows **$35.00**
- the consumer pay page shows the PKR payable with the `$35.00` original alongside
- deleting the rate row makes staff surfaces read `$35.00 (rate not set)` — never a wrong number
- a staff wallet top-up for that USD user persists `currency: 'USD'`

- [ ] **Step 3: Update CLAUDE.md**

Record: `fxRateToPkr` is stamped at intake and never moves; `formatStaffMoney` is the staff formatter and `formatMoney` the consumer one; `CurrencyService.convert`/`getRateToPkr` return null and must never fall back to rate 1.0; the four config boards keep literal PKR by design; clerk amounts are always PKR; `/wallet/me` is never converted; wallet/payment currency is server-derived.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the USD to PKR conversion invariants"
```

---

## Self-review notes

- **Spec coverage:** schema → T1; conversion core + no-1.0-fallback → T2, T3; rate stamping → T3; staff display (7 surfaces) → T4, T5; aggregation → T6; write path + notifications → T7; consumer → T8; excluded config boards → T4 guard test; testing → per-task + T9.
- **Type consistency:** `convertToPkr(amount, rate) → number | null` and `formatStaffMoney(amount, currency, fxRateToPkr) → string` are used identically in every task; `fxRateToPkr` is the column name throughout.
- **Known ordering constraint:** T4 and T5 both touch `finance-board.tsx` and the portal dashboard page; T5 explicitly defers the KPI cards to T6. Run T4 → T5 → T6 in order, not in parallel.
- **Deliberate deviation from the usual TDD shape:** T6 Step 2 expects the new test to PASS immediately (it is a self-contained helper pinning the contract) rather than fail. Called out so a reviewer does not read it as a broken TDD cycle.
