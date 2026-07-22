# USD → PKR conversion for staff surfaces — design (2026-07-23)

Source: client review batch 3 — `DOcs/superpowers/specs/2026-07-22-client-review-batch3-findings.md` items 5–9.
This is the second architectural piece in that batch (the first, clerk payout, shipped on `feat/clerk-payout`).

## The ask

> "International Client ki amount SuperAdmin ko converted PkR my aye gi."
> The international client's amount should reach the Super Admin already converted into PKR.

The client specified the target behaviour by comparing to the **old portal** (`app.wusuq.com`):
the consumer side shows **`$35`**; the Super Admin side shows the converted **`PKR 9,720`**.
His own arithmetic on the screenshot: `35 × 285 ≈ 9,975`.

So this is **not** "convert everything" — display currency depends on who is looking.

## Current behaviour (the defect)

| # | Symptom | Where |
|---|---|---|
| 1 | `$35.00` due flows into the **`Amount (PKR)`** field as literal `35` | consumer pay page |
| 2 | The same ticket lists as **"Rs 35"** | staff `/tickets/unpaid` |
| 3 | Wallet chip renders **"$ -35.00"** | consumer dashboard |

### Root cause

**No conversion is applied anywhere.** `ExchangeRate` (schema.prisma:761) and `CurrencyService`
(`apps/api/src/currency/`) exist, and there is already a `GET /currency/rates` endpoint plus an admin
rate-management screen (`exchange-rate-board.tsx`) — so rates can be *entered*. They are never *applied*
to any amount.

Compounding it, ~10 staff surfaces hand-roll a `"PKR "` / `"Rs "` literal instead of calling
`formatMoney(amount, currency)`. A USD ticket therefore renders its USD number under a PKR label.
(CLAUDE.md already recorded this as a known follow-up.)

### Two problems found during design that the client did not report

**A. `CurrencyService.convert()` silently falls back to rate 1.0 when no rate row exists**
(`currency.service.ts:21`). That fallback is exactly how `$35` becomes `Rs 35` — it is a money-bug
generator and must not survive into a path that renders money.

**B. Write-path currency corruption (data, not display).** `finance-board.tsx:194`,
`users-board.tsx:141` and `wallet-board.tsx:64` hardcode `currency: 'PKR'` **in the POST body**.
`TopupWalletDto.currency` is a client-supplied free string persisted as-is
(`wallet.service.ts:83`); `ReconcilePaymentDto.currency` defaults server-side to `'PKR'`
(`finance.service.ts:223`). A staff-initiated top-up or reconciliation for a USD user is therefore
**persisted mislabeled**. No amount of formatting work fixes already-written rows.

Also: `notification-templates.ts` (lines 80–118) hardcodes `` `PKR ${amount}` `` in wallet and
payment emails.

## Decisions taken

| Question | Decision |
|---|---|
| Conversion model | **Display-only.** `Ticket.currency` / `totalAmount` stay USD; staff surfaces render a converted PKR figure at read time. The consumer's billed amount can never drift from what they agreed. |
| Which rate | **Snapshotted at ticket creation.** A historical ticket's PKR figure never changes retroactively. Mirrors the existing `Ticket.taxRate` stamping rule. |
| Consumer pay page | **Converted PKR, with the USD original alongside.** The destination account is a Pakistani bank, so the payable figure is PKR; the `$35.00` stays visible so an overseas client can reconcile against their quote. |
| Write-path currency bug | **In scope.** |
| FX drift between order and payment | **Wusuq absorbs it** — a consumer pays the rate from when they ordered. Accepted consequence of stamping at creation. |

## Design

### Schema

One nullable **rate** column (not a money column — display-only is preserved):

```prisma
/// FX rate to PKR captured at intake for non-PKR tickets, so a historical
/// ticket's staff-side PKR figure never moves when the rate is updated.
/// NULL for PKR tickets (no conversion) and for USD tickets created before
/// this feature (renders "rate not set", never a wrong number).
fxRateToPkr Decimal? @db.Decimal(18, 6)
```

Stamped by `createIntakeTicket` for `currency !== 'PKR'` from the then-current rate. Also stamped by
`regenerate` (a new sale at the current rate, consistent with its existing re-pricing rule).

Rejected: deriving the rate from `ExchangeRate` history by `createdAt` (no migration, but editing or
deleting an old rate row would silently rewrite historical figures), and returning pre-converted
display fields from the API (bloats every payload, puts presentation in the API).

### Conversion core — `@wusuq/shared`

```ts
/** Converted amount, or null when no rate is available. Never falls back to 1. */
convertToPkr(amount: number | string | null, rate: number | string | null): number | null

/**
 * Staff-facing money. PKR tickets pass straight through, so every staff surface
 * can adopt this unconditionally. USD tickets render the PKR equivalent; when the
 * rate is missing it renders an explicit marker, never an unconverted number.
 */
formatStaffMoney(amount, currency, fxRateToPkr): string
```

`formatStaffMoney` returns `PKR 9,975` for a USD ticket, `PKR 500` for a PKR ticket, and
`$35.00 (rate not set)` when `fxRateToPkr` is null. Dense tables use it alone; detail views show the
USD original alongside.

`CurrencyService.convert()` loses its silent 1.0 fallback and returns null when no rate exists.

### Staff display

Replace the hand-rolled literals with `formatStaffMoney` in: `ticket-board.tsx` (the `rs()` helper),
`ticket-detail-panel.tsx`, `ticket-charges-board.tsx`, `finance-board.tsx`,
`app/(portal)/dashboard/page.tsx`, `dashboard/operational-queue.tsx` (which today renders amounts with
**no** currency indicator at all), and `wallet-board.tsx`.

**Deliberately excluded — their hardcoded PKR is correct:** `cost-rules-board.tsx`,
`pricing-rules-board.tsx`, `promo-codes-board.tsx`, `exchange-rate-board.tsx`. These are
PKR-denominated business configuration, not ticket-currency-bearing values. A source-level guard test
pins this so a later sweep does not "fix" them.

Clerk-facing amounts (`clerkCost`, per-page rates, clerk earnings) stay PKR unconditionally — clerk
payouts are domestic regardless of the consumer's currency.

### Aggregation

Portal dashboard revenue, finance KPIs and the **admin all-wallets table** currently sum raw
`totalAmount` across tickets and users of mixed currency and stamp one label on the result. Each
switches to summing the PKR equivalent per ticket. Tickets with a missing rate are excluded from the
sum and reported as a count, so a total is never silently understated.

**`/wallet/me` is explicitly NOT converted.** Currency locks once an account is active (an inactive
account has zero tickets and zero balance by definition), so a single user's tickets are always
one currency and `outstandingDuesForUser` is already currency-safe. It is consumer-facing, so its
`due` must stay in the user's own currency — converting it to PKR would show an overseas consumer a
figure in a currency they were never quoted. Only aggregates that span *multiple users* genuinely
mix.

### Write path

The robust fix is not to make the three forms send the right currency — it is to stop trusting the
client. The server **derives** the currency from the target user (top-up, adjustment) or the ticket
(reconcile) and ignores any client-supplied value, matching the existing rule that `Ticket.currency`
is snapshotted from `User.currency` and never client-supplied. This closes the hole for any future
caller, not just today's three forms.

`TopupWalletDto.currency` and `ReconcilePaymentDto.currency` are removed from the DTOs rather than
left accepted-and-ignored, so the contract is honest.

### Consumer

- **Pay page:** amount field shows the converted PKR payable with `$35.00` displayed alongside; the
  hardcoded `Amount (PKR)` label becomes currency-aware.
- **Wallet top-up dialog:** same label fix (`consumer-wallet-board.tsx:309`).
- **Notification templates:** use `formatMoney` with the transaction's real currency.
- Everything else consumer-facing stays USD.

### Rate availability

A USD ticket cannot be priced without a rate. `createIntakeTicket` stamps whatever rate exists; if
none does, it stamps NULL and staff surfaces show "rate not set" — visible and correctable via the
existing admin screen, never a wrong number. Intake is **not** blocked on a missing rate: USD pricing
is an all-inclusive flat list that does not depend on FX, so the ticket is still correctly priced for
the consumer.

## Testing

- Unit: `convertToPkr` (including null rate, null amount, string/Decimal inputs); `formatStaffMoney`
  for PKR pass-through, USD conversion, and the missing-rate marker.
- API: rate stamped at intake for USD and left NULL for PKR; `regenerate` re-stamps; aggregates sum
  PKR equivalents and exclude-and-count missing-rate tickets; write path derives currency and ignores
  a forged client value.
- Regression: `CurrencyService.convert` returns null rather than 1.0 when no rate exists.
- Source-level guards: the four config boards keep their literal PKR; consumer surfaces never render
  `formatStaffMoney`.

## Phasing

1. **Conversion core** — schema + `convertToPkr` / `formatStaffMoney` + the `convert()` fallback fix.
2. **Staff display** — the seven surfaces.
3. **Aggregation** — dashboard KPIs, finance KPIs, admin all-wallets table.
4. **Write path** — server-derived currency + DTO cleanup + notification templates.
5. **Consumer** — pay page and top-up labels.

Each phase is independently shippable and testable.

## Out of scope

The remaining 17 items in the batch-3 findings document. `PricingRule.currency` and the USD flat
price list are unchanged — USD pricing is deliberately not FX-derived, and this feature does not make
it so.
