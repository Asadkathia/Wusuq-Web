# Payment & Wallet Redesign — Design Spec

- **Date:** 2026-05-23
- **Status:** Approved (design)
- **Scope:** Spec 2 of 3. Covers the payment-module redesign + checkout changes:
  manual bank-transfer + screenshot + admin approval, **wallet-centric** balance,
  per-flow one-time vs two-phase (split) payment, gating rewrite, and the
  checkout-counter changes. **Clerk-workflow changes (detail trim, intake-type
  bug, doc categories, multi-assign, next-hearing) are Spec 3** — except the
  clerk's phase-2 charge entry, which is defined here because it drives billing.

## Context

The current payment system is a mock gateway (`apps/api/src/payments/`) that, on
success, sets `Ticket.paymentStatus=PAID`. There is **no** bank-details screen,
**no** consumer screenshot upload, and **no** admin payment-approval queue.

Crucially, the **wallet already implements ~90% of the desired flow**:
- `WalletTransaction` has `receiptUrl`, `status` (`PENDING_VERIFICATION →
  VERIFIED / REJECTED`), `reviewedByUserId`, and an optional `ticketId`.
- `walletBalance` lives on `User`.
- `WalletService` already **auto-deducts** from `walletBalance` to pay a ticket,
  setting `Ticket.amountPaid` and `paymentStatus` (`PARTIALLY_PAID` / `PAID`).

So the redesign **reuses the wallet as the single balance ledger** rather than
building a parallel payment system. (User decision 2026-05-23: wallet-centric.)

`Ticket` already carries the charge breakdown: `serviceCost`, `deliveryCharges`,
`printingCharges`, `attestedCharges`, `nonAttestedCharges`, `clerkCost`,
`totalAmount`, `amountPaid`, `paymentStatus`.

---

## 1. Per-flow payment model (single source of truth)

Add `PAYMENT_MODEL_BY_FLOW` to `packages/shared/src/index.ts`:

```ts
export type PaymentModel = 'SPLIT' | 'ONE_TIME';
export const PAYMENT_MODEL_BY_FLOW: Record<string, PaymentModel> = {
  judicial_case_files: 'SPLIT',
  non_judicial_copy_of_fir: 'SPLIT',
  non_judicial_criminal_record_search: 'SPLIT',
  non_judicial_registry_deed: 'SPLIT', // 2026-05-23: physical document → SPLIT
  judicial_case_information: 'ONE_TIME',
  judicial_case_search: 'ONE_TIME',
  judicial_case_filing: 'ONE_TIME',
  judicial_power_of_attorney: 'ONE_TIME',
};
```

Rule of thumb: physical-document flows are **SPLIT** (Case Files, FIR, Criminal
Record, Registry/Deed); pure-information flows are **ONE_TIME** (Case Info, Case
Search, Filing, PoA).

- **SPLIT**: base service charge billed now (before assignment); remainder
  (attested/non-attested + delivery + PDF) billed at completion before dispatch.
- **ONE_TIME**: base service charge billed once before assignment; no phase-2.

Both API gating and the consumer wizard read this single map.

---

## 2. Wallet-centric payments (reuse, don't rebuild)

### Bank details — new `PaymentSettings`

A singleton settings row, admin-editable in the portal:

```prisma
model PaymentSettings {
  id            String   @id @default("singleton")
  bankName      String
  accountTitle  String
  accountNumber String
  iban          String?
  instructions  String?  // free-text shown to consumer
  updatedAt     DateTime @updatedAt
  updatedByUserId String?
}
```

Exposed via `GET /payment-settings` (consumer-readable bank block) and
`PUT /payment-settings` (admin-only). No redeploy to change bank details.

### Payment proof = wallet credit (extend `WalletTransaction`)

Consumer payment submission reuses the wallet top-up machinery:
- After ticket creation (or later), consumer sees the bank details and submits a
  payment: amount + screenshot, optionally tied to the ticket (`ticketId`).
  Creates a `WalletTransaction` (`status=PENDING_VERIFICATION`, `receiptUrl`).
- Admin reviews in a queue → **approve** (`VERIFIED`, `walletBalance += amount`)
  or **reject** (`REJECTED`). Both notify the consumer.
- On approval, the wallet auto-deduction runs against the consumer's open
  tickets (see §3).

Add a `WalletTransactionType` enum to distinguish ledger entries (for audit and
correct balance math):

```prisma
enum WalletTransactionType {
  TOPUP            // consumer screenshot credit (existing behaviour)
  TICKET_PAYMENT   // screenshot credit explicitly tied to a ticket
  TICKET_DEBIT     // auto-deduction to pay a ticket
  ADMIN_ADJUSTMENT // manual admin credit/debit
}
```

> Implementation note: confirm whether the existing auto-deduction writes a
> debit `WalletTransaction`. If not, add `TICKET_DEBIT` ledger entries so the
> balance is fully reconstructable from transactions.

### Admin wallet adjustment

New admin action: credit or debit a consumer's wallet with a reason, recorded as
an `ADMIN_ADJUSTMENT` `WalletTransaction` (auto-`VERIFIED`, `reviewedByUserId`
set) and reflected in `walletBalance`. Audited via `AuditLog`.

### "Pay full upfront" on SPLIT flows

The consumer may pay **base only** (minimum to proceed) or **the full amount**
upfront. A full payment credits the wallet; base auto-deducts now; the excess
remains in the wallet and **auto-covers the remainder** at completion with no
second screenshot.

---

## 3. Two-phase amounts & status

- **At creation:** `ticket.totalAmount = serviceCost` (base only). The wizard
  checkout shows base only (see §6).
- **`paymentStatus` lifecycle:** `UNPAID` → `PARTIALLY_PAID` (base covered,
  remainder pending) → `PAID`.
- **Auto-deduction (existing `WalletService` logic, made phase-aware):** when the
  wallet is credited, deduct toward the ticket's *current due*:
  - SPLIT pre-completion: current due = `serviceCost` (base).
  - SPLIT post-finalization: current due = `totalAmount` (base + remainder).
  - ONE_TIME: current due = `serviceCost`.
- `amountPaid` tracks cumulative wallet debits applied to the ticket.

---

## 4. Phase-2 charge finalization (case files / SPLIT flows)

Order of operations (includes the admin-edit step added 2026-05-23):

1. **Clerk** completes the work and enters phase-2 charges. The charge-entry
   window is **conditional on what the service requires** (see §4a) — it is
   hidden for services that don't involve printing/copying/attestation. Charges
   are stored on the ticket's existing charge fields in a `DRAFT`/unfinalized
   state.
2. **Admin reviews and can edit** those amounts before they reach the consumer.
3. **Admin finalizes** → `totalAmount = serviceCost + (attestedCharges +
   nonAttestedCharges + printingCharges + deliveryCharges + pdf)`; ticket flagged
   `remainderFinalizedAt`. The consumer is prompted for the remainder.
4. The remainder is auto-deducted from wallet if funded; otherwise the consumer
   submits another screenshot (→ wallet credit → auto-deduct).
5. **Dispatch unlocks** once the remainder is covered (`paymentStatus=PAID`).

Rules:
- The **PDF charge is standard/fixed**.
- Add a ticket field to track finalization, e.g.:

```prisma
  remainderFinalizedAt   DateTime?
  remainderFinalizedByUserId String?
```

### 4a. Which charges each service exposes (clerk window visibility)

The clerk phase-2 charge window — and each field within it — appears **only for
services that require that charge** (user clarification 2026-05-23: "don't show
the window for all tickets"). Define `SERVICE_CHARGE_CAPABILITIES` in
`@wusuq/shared` keyed by flow:

| Flow | Attestation (attested/non-attested) | Printing/Copying | Delivery | PDF |
|---|---|---|---|---|
| `judicial_case_files` | ✅ | ✅ | ✅ | ✅ |
| `non_judicial_copy_of_fir` | ❌ | ✅ | ✅ | ✅ |
| `non_judicial_registry_deed` | ❌ | ✅ | ✅ | ✅ |
| `non_judicial_criminal_record_search` | ❌ | ✅ | ✅ | ✅ |
| ONE_TIME flows (Case Info/Search/Filing/PoA) | ❌ | ❌ | ❌ | ❌ |

- **Attestation (attested/non-attested) is Case Files only** (consistent with
  Spec 1).
- **Printing/copying** applies to any physical-document service that requires it
  (the SPLIT flows).
- ONE_TIME info flows expose **no** clerk charge window at all (no phase-2).
- The clerk/admin UI renders only the capable fields; the consumer's phase-2
  remainder reflects only the charges that apply.

> Note: the per-page attested/non-attested rate inputs currently shown at
> assignment (`ticket-board.tsx`) must also respect this capability map — today
> they render for all tickets, which is the bug behind "don't show the window for
> all tickets."

---

## 5. Gating (rewrite of `assertPaymentSatisfied`)

`apps/api/src/tickets/tickets.service.ts` — replace the binary
`paymentStatus===PAID` check with a phase-aware check driven by
`PAYMENT_MODEL_BY_FLOW`:

- **Assign** (`PENDING → ASSIGNED`): require base covered
  (`amountPaid ≥ serviceCost`).
- **Complete → dispatch** (terminal/COMPLETED for SPLIT flows): require remainder
  covered (`amountPaid ≥ totalAmount`).
- **ONE_TIME** flows: assign requires full base payment; no phase-2 gate.
- Admin-created tickets (`createdBy !== 'CONSUMER'`) remain exempt.
- `DISABLE_PAYMENT_GATING=true` still bypasses everything (dev).

---

## 6. Checkout counter

`apps/web/components/intake-wizard.tsx` (+ `intake-wizard/checkout-panel.tsx`):
- Show **base service only** (phase-1). Remove the attested / non-attested,
  delivery, and PDF line items from the wizard checkout — for **SPLIT** flows
  they surface later in the phase-2 prompt.
- Remove the **"deliver to Lahore" TCS option**. ⚠️ The exact control was not
  located during exploration; pinpoint the TCS destination list in
  `intake-flows.ts` / delivery components during implementation and remove the
  Lahore entry.
- Registry/Deed is **SPLIT** (2026-05-23 decision): its delivery/PDF charges
  land in phase-2 like the other physical-document flows. The digital ONE_TIME
  flows (Case Info/Search/Filing/PoA) have no delivery/attested/PDF charge, so
  nothing to remove there.

---

## 7. Consumer payment prompt visibility

(Separate from the clerk charge window in §4a.) The consumer payment prompt
appears **only when payment is actually due**:
- consumer-created ticket, current phase not yet covered.
- Hidden for admin-created tickets and already-covered tickets.
- A "pay later" choice dismisses the prompt without blocking ticket creation; the
  ticket simply stays unpaid until the consumer pays (and cannot be assigned
  until the base is covered).

---

## 8. Notifications

Reuse the dispatcher pattern (`apps/api/src/notifications/`). Events:
- **Payment submitted** → admins/finance (screenshot awaiting review). (Reuses
  the existing wallet-receipt-uploaded path; extend for ticket context.)
- **Payment approved** / **rejected** → consumer. (Reuses
  `walletTopupDecided`; ensure ticket-context copy.)
- **Remainder due** → consumer (after admin finalizes phase-2 charges).
- Add new `NOTIFICATION_TYPES` constants + templates where existing ones don't
  fit the ticket-payment context.

---

## 9. Components & boundaries

**API**
- `payment-settings` module — `PaymentSettings` CRUD (admin) + consumer read.
- `wallet` service — extend: ticket-tied payment submission, approve/reject
  (credit + phase-aware auto-deduct), admin adjustment, debit ledger entries.
- `tickets` service — gating rewrite; phase-2 charge entry (clerk) + admin
  edit + finalize.
- `@wusuq/shared` — `PAYMENT_MODEL_BY_FLOW`, `PaymentModel`,
  `SERVICE_CHARGE_CAPABILITIES` (§4a).

**Web**
- Consumer: post-creation payment screen (bank block + amount + screenshot +
  pay-now/later), remainder prompt, wallet balance display.
- Admin: payment-approval queue, wallet adjustment, phase-2 charge
  review/edit/finalize, `PaymentSettings` editor.
- Wizard checkout: base-only.

---

## 10. Testing

- Unit: `PAYMENT_MODEL_BY_FLOW` resolution; phase-aware gating (assign needs
  base; dispatch needs remainder; ONE_TIME needs base; admin-created exempt;
  `DISABLE_PAYMENT_GATING` bypass).
- Unit: wallet auto-deduction phase-awareness (base before finalize; full
  amount after); full-upfront leaves correct excess and auto-covers remainder.
- Unit: admin finalize sets `totalAmount` from edited charges, not clerk's draft.
- Unit: `SERVICE_CHARGE_CAPABILITIES` — attestation true only for Case Files;
  printing/delivery/PDF true for SPLIT flows; all false for ONE_TIME flows.
- Integration/UI: clerk charge window (and the assignment per-page rate inputs)
  render only the capable fields, and not at all for ONE_TIME flows.
- Integration: submit screenshot → approve → wallet credited → ticket base
  covered → assignable; reject → consumer notified, not assignable.
- Integration: SPLIT completion → clerk charges → admin edits → finalize →
  remainder due → pay → dispatch unlocked.
- Regression: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

---

## 11. Out of scope / deferred

- Clerk ticket-detail trim, intake-type bug, document categories, multi-assign,
  next-hearing → **Spec 3**.
- Real online gateway (JazzCash/EasyPaisa/HBL) — enums exist; manual + wallet is
  the live path. Gateway code left dormant.
- Migrations: new `PaymentSettings`, `WalletTransactionType`, ticket
  `remainderFinalizedAt` fields require Prisma migrations (`prisma:migrate:dev`).

## Open items to resolve during implementation

- **TCS-Lahore control**: locate and remove the Lahore delivery destination.
- **Existing debit ledger**: confirm whether auto-deduction already records a
  `WalletTransaction`; add `TICKET_DEBIT` entries if not.
- **One-time wallet flow**: confirm ONE_TIME tickets also route through the wallet
  (assumed yes for consistency) vs a direct single approval.

---

## Addendum (2026-05-23): clerk cost + phase-2 rate entry

Clarifications from the owner that refine §4/§4a:

### Clerk assignment cost — the one default rate, consumer-billed
- The default clerk cost already lives in **`PricingRule.clerkBaseCost`**, seeded
  from the rate sheet's **CLERK** column (the `seed-pricing.ts` "Wusuq Service
  Rates & Clerk Rat" sheet), keyed on `(flow × courtLevel × yearBand × region)`.
  **No re-import needed**; if the sheet is newer than the xlsx, re-export the
  xlsx and re-run `seed-pricing.ts`.
- The pricing resolver now **exposes `clerkBaseCost`** in `/pricing-rules/resolve`.
- The **assignment dialog** pre-fills the clerk-cost field with the resolved
  `clerkBaseCost` (the default) and offers an **override toggle** so the admin can
  change it for that ticket.
- `clerkCost` **is consumer-billed** (included in the final bill). `assignClerk`
  already adds it to `totalAmount`; **`finalizeRemainder` now also includes it**
  so it isn't dropped at finalize.

### Attestation / printing / delivery — no default rates
- These have **no system defaults** (the WUSUQ/attestation engine rates are NOT
  used for them). The **clerk enters** the amounts in the clerk payment modal;
  the **admin reviews/edits** them at finalize; the consumer is billed the
  admin-set amounts. Capability-gated per §4a (attestation = Case Files only;
  printing/delivery = SPLIT physical flows).

### PDF — standard, opt-in
- PDF is a **standard Rs 300** charge but **opt-in**: only billed when a PDF is
  requested. The finalize/clerk UI defaults the PDF input to 300; the admin may
  set 0. The backend takes the value as-is (no unconditional 300).

### Net consumer total (SPLIT)
`totalAmount = serviceCost (base) + clerkCost + attestation + printing + delivery
+ pdf` — clerkCost from the assignment default/override; attestation/printing/
delivery from the clerk's entries as edited by the admin; pdf standard-when-opted.
