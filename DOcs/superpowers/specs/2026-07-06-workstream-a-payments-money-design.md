# Workstream A — Payments & Money-Timing — Design

**Date:** 2026-07-06
**Status:** Draft — pending user review (two assumptions flagged below)
**Batch:** Owner walkthrough batch 2 (13 clips + PDF "Wusuq Edits 5-10-26 (2)"). Full grounded backlog: `…/scratchpad/batch2-consolidated.md`. This is workstream **A** of a 7-workstream roadmap (A→G); A is first because it fixes urgent revenue-blocking payment bugs and establishes the charge-*timing* model the later workstreams build on.

## Scope (4 items)

- **B4** — the consumer's owed amount jumps when the **clerk** submits costs; it must change only when the **admin approves**.
- **B5** — wallet top-up AND ticket payment both fail on submit (`paymentMode must be one of …` + `receiptUrl must be a URL address`).
- **C6** — payment surfaces should let the consumer pick a method first, then show **that method's** account details.
- **C1** — tax must apply to the **base/service charge only**, not the whole bill.

Out of scope (later workstreams): invoice/receipt download (WS-B), the two-cost *model* implementation and per-ticket cost override (WS-D), representative payment details (WS-E), HC pricing check B13 (WS-G). C1 here only changes *what tax applies to*; it assumes the existing `serviceCost`/`additionalServiceCost` charge fields (which already exist).

## Assumptions to confirm on review

1. **Payment methods = Bank Transfer + JazzCash + EasyPaisa** (drop the non-working "Cash" button; matches the existing `PaymentSettings` fields). A method option renders only if its settings are populated.
2. **Taxable base = `serviceCost + additionalServiceCost`.** `additionalServiceCost` folds into the base cost (per the two-cost model, item C9), so it is part of the taxable base; delivery/printing/attested/non-attested/additionalCharges are not taxed.

---

## B4 — Freeze the consumer total until admin approval

### Current behavior
`submitClerkCosts` (`apps/api/src/tickets/tickets.service.ts`) hand-rolls a total (bypassing `computeTicketTotal` — no tax/promo) at lines ~2258-2266 and writes it into the `IN_PROGRESS → WAITING_APPROVAL` transition at ~2296:
```ts
const totalAmount = Number(ticket.serviceCost) + deliveryCharges + printingCharges
  + attestedCharges + nonAttestedCharges + additionalCharges
  + Number(ticket.additionalServiceCost) - Number(ticket.discountPrice);
// …
data: { deliveryCharges, printingCharges, attestedCharges, nonAttestedCharges,
        additionalCharges, noOfPages, costPerPage,
        totalAmount,                       // ← consumer-facing total bumped at clerk-submit
        clerkApprovalStatus: 'SUBMITTED', status: 'WAITING_APPROVAL' }
```
The consumer's dues read `Ticket.totalAmount` directly (`WalletService.outstandingDuesForUser`, `wallet.service.ts:366-382`, sums `totalAmount − amountPaid` over every non-`DELIVERED` ticket), so the bump raises `due` and pushes the net wallet negative at `WAITING_APPROVAL` — before any admin action. `reviewAndComplete → finalizeRemainderCore` independently recomputes the final total from the persisted charge columns via `computeTicketTotal` and writes it (~2749/2791).

### Change
In `submitClerkCosts`: **remove the hand-rolled `totalAmount` computation (2258-2266) and drop `totalAmount` from the update `data` (2296).** Keep persisting the charge columns, `noOfPages`/`costPerPage`, `clerkApprovalStatus: 'SUBMITTED'`, and `status: 'WAITING_APPROVAL'`. `Ticket.totalAmount` then stays at the phase-1 base (stamped at intake, re-affirmed by `assign`) through WAITING_APPROVAL, and `reviewAndComplete` writes the correct final total on approve.

### Effect
Clerk submits costs → consumer total/dues unchanged (base). Admin "Approve & Complete" → total jumps to the final figure. The clerk's Waiting-Approval figure and the admin Review & Complete dialog are unaffected (both read the persisted charge columns, not `totalAmount`). Removing the hand-rolled sum also eliminates its tax/promo inconsistency.

### Edge cases
- SPLIT physical flow: consumer owes base until approve, then base+phase-2. Matches the SPLIT model.
- Pay-at-end: consumer can still pay the base anytime; the remainder becomes due only after approve.
- No change to clerk earnings (computed from charge columns).

---

## B5 — Fix the two payment-submit failures

### Current behavior
- **Enum mismatch (top-up modal only):** `consumer-wallet-board.tsx:300-304` submits keys `BANK_TRANSFER` / `JAZZCASH` / `EASYPAISA` / `CASH` as `paymentMode`, but the API enum `PAYMENT_MODES = ['JAZZ_CASH','EASY_PAISA','BANK_TRANSFER']` (`packages/shared/src/index.ts:42`) rejects `JAZZCASH`/`EASYPAISA`/`CASH`. Only Bank passes.
- **`@IsUrl` vs relative path (both flows):** the receipt upload returns an app-relative path `/wallet/receipt/<file>` (`wallet.service.ts:403`), but `TopupWalletDto.receiptUrl` validates `@IsUrl({ require_tld: false })` (`topup-wallet.dto.ts:25-33`), which requires a scheme/host → `receiptUrl must be a URL address`. The admin reconcile path avoids this only because `ReconcilePaymentDto.receiptUrl` is `@IsString()`.

### Change
1. **Enum keys:** in `consumer-wallet-board.tsx:300-304`, set the option `key`s to the enum values (`BANK_TRANSFER`, `JAZZ_CASH`, `EASY_PAISA`) and remove the `CASH` option (per assumption 1). Human-readable `label`s stay ("Bank transfer", "JazzCash", "Easypaisa").
2. **DTO:** relax `TopupWalletDto.receiptUrl` from `@IsUrl({ require_tld: false })` to `@IsString()` (matching `ReconcilePaymentDto`), since the value is always an internal app-relative path.

This unblocks the top-up modal (all methods) and the pay page (which uploads the same relative receipt).

---

## C6 — Method picker that reveals only the selected method's details

### Current behavior
- **Pay page** (`apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx:331-390`): no method picker; `paymentMode` hardcoded `BANK_TRANSFER`; renders bank + IBAN + **both** JazzCash and EasyPaisa + instructions all at once.
- **Top-up modal** (`consumer-wallet-board.tsx:298-321`): has a method picker but renders **no** account details.
- `PaymentSettings` singleton fields: `bankName`, `accountTitle`, `accountNumber` (required); `iban`, `jazzCash`, `easyPaisa`, `instructions` (optional).

### Change
Add a **shared payment-details presentation** to both surfaces:
- A method selector offering only the **configured** methods (Bank if bank fields set; JazzCash if `jazzCash` set; EasyPaisa if `easyPaisa` set).
- On selection, render only that method's block: **Bank** → `bankName` / `accountTitle` / `accountNumber` / `iban`; **JazzCash** → `jazzCash`; **EasyPaisa** → `easyPaisa`. `instructions` shown under any method.
- **Pay page:** wire the selected method into the `paymentMode` sent to `/wallet/topup` (replacing the hardcoded `BANK_TRANSFER`; depends on the B5 enum fix).
- **Top-up modal:** render the selected method's block (keyed off its existing `paymentMode` state).

Factor the method-list + details rendering into one small helper/component reused by both surfaces (single source, avoids the two drifting).

---

## C1 — Tax the base only, inside `computeTicketTotal`

### Current behavior
`computeTicketTotal` (`packages/shared/src/index.ts:793-809`) taxes the whole bill:
```ts
const chargesSubtotal = round2(serviceCost + deliveryCharges + printingCharges + attestedCharges
  + nonAttestedCharges + additionalCharges + additionalServiceCost);
const discountTotal = round2((discountPrice ?? 0) + (promoDiscount ?? 0));
const taxableBase = Math.max(0, round2(chargesSubtotal - discountTotal));   // ← whole bill
const taxAmount   = round2(taxableBase * (taxRate ?? 0));
const totalAmount = round2(taxableBase + taxAmount);
```

### Change
Tax only the service base; keep the non-taxed charges in the total:
```ts
const chargesSubtotal = round2(/* all components, unchanged */);
const serviceBase = round2(c.serviceCost + c.additionalServiceCost);
const discountTotal = round2((input.discountPrice ?? 0) + (input.promoDiscount ?? 0));
const taxableBase = Math.max(0, round2(serviceBase - discountTotal));   // discount reduces the taxable base first
const taxAmount   = round2(taxableBase * (input.taxRate ?? 0));
const totalAmount = Math.max(0, round2(chargesSubtotal - discountTotal)) + taxAmount;
return { chargesSubtotal, discountTotal, taxableBase, taxAmount, totalAmount };
```
Semantics: discount reduces the whole bill (total) as today, and reduces the taxable base (floored at 0) for tax purposes.

### Why this is safe (no call-site edits)
All six `computeTicketTotal` call sites funnel through this one function. Intake (`assembleIntakeMoney`) and the wizard checkout preview only ever pass `serviceCost` (phase-2 columns are 0), so for phase-1 `taxableBase` is unchanged → **quotes and intake charges are provably unaffected**. The change lands exactly where phase-2 charges exist: `finance.updateCharge`, `finalizeRemainderCore`, `buildRepriceResult` (edit-ticket) — the physical SPLIT flows that were over-taxing photocopy/TCS. USD forces `taxRate = 0`, so no USD change. Per-phase `taxAmount` is re-stamped at each total write (intake/finalize/reprice), so historical rates are preserved.

### Example
Base 500 + delivery 300 + printing 50, rate 17%: **new** tax = 500 × 0.17 = **85**, total = 850 + 85 = **935**. Old: 850 × 1.17 = 994.5.

---

## Files

- `packages/shared/src/index.ts` — `computeTicketTotal` (C1).
- `apps/api/src/tickets/tickets.service.ts` — `submitClerkCosts` (B4).
- `apps/api/src/wallet/dto/topup-wallet.dto.ts` — `receiptUrl` validator (B5).
- `apps/web/components/consumer-wallet-board.tsx` — top-up modal enum keys (B5) + method details block (C6).
- `apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx` — method selector + wire `paymentMode` (C6), benefits from B5 receiptUrl fix.
- New small shared helper/component for the payment-method details block (C6), reused by both web surfaces.
- Tests (see below).

## Testing

- **API unit:** `submitClerkCosts` does NOT change `Ticket.totalAmount` (asserts it equals the pre-submit base) while it DOES persist the charge columns + advances to WAITING_APPROVAL; `reviewAndComplete` DOES write the final total. (Extend `apps/api/src/tickets/*.spec.ts`.)
- **API unit:** `computeTicketTotal` base-only tax — base 500 + delivery 300 + printing 50 @ 17% → taxAmount 85, total 935; a discount-exceeds-base case floors taxableBase at 0; USD (rate 0) → tax 0. (Extend the money spec that covers `computeTicketTotal`.)
- **API unit/e2e:** `TopupWalletDto` accepts `{ paymentMode: 'JAZZ_CASH', receiptUrl: '/wallet/receipt/x.jpg' }` (was rejected).
- **Web:** pay page + top-up modal render only the selected method's details; typecheck + lint clean.
- **Manual:** clerk submits costs → consumer total/dues unchanged; admin approves → total updates; top-up with JazzCash + a receipt image succeeds; a physical ticket's tax equals base×rate, not whole-bill×rate.

## Verification (end-to-end)
1. Create a SPLIT physical ticket (base 800). Clerk accepts → submits phase-2 costs. Assert consumer ticket total/dues = **800** (unchanged). Admin Approve & Complete → assert total = base + phase-2 + base-only tax.
2. Consumer wallet → Top up → JazzCash + upload receipt → **succeeds** (no enum/URL error). Repeat on the ticket Pay page.
3. Pay page shows a method picker; selecting Bank shows only bank details, JazzCash shows only the JazzCash number.
