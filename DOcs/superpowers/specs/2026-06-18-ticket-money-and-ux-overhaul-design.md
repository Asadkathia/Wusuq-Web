# Ticket Money Model & UX Overhaul — Design

**Date:** 2026-06-18
**Status:** Draft for review
**Author:** Brainstormed with Claude Code

## 1. Context & goals

A batch of owner-requested changes touches pricing, tickets, payments, the
intake wizard, and consumer onboarding. This spec organizes the seven original
asks into five workstreams, records the product decisions made during
brainstorming, and defines the design for each.

Original asks (verbatim, mapped to workstreams):

| # | Ask | Workstream |
|---|-----|-----------|
| 1 | Edit ticket feature; update pricing at creation **and** completion; add discount; add tax | A (Pricing & money) |
| 2 | Ticket regeneration with edit ability in the form | B (Regenerate) |
| 3 | Update consumer ticket detail to show complete details | D1 |
| 4 | Improve clerk-side ticket listing (max detail) | D2 |
| 5 | Add payment proof in the update-payment screen | E |
| 6 | Show clerk **name** (not "clerk"); show clerk payments/earnings in ticket detail **and** admin finalize; ticket numbers in the sidebar; instant checkout rate on year change | C, D3, D4 |
| 7 | Capture consumer address at onboarding; add case-file document; richer case info (year) on the form | F |

## 2. Decisions locked during brainstorming

1. **Delivery plan:** one phased spec (this document), implemented workstream by workstream.
2. **Tax:** a configurable **percentage** tax line (not flat, not inclusive).
3. **Discount:** the ask is **consumer promo/coupon codes** — a new subsystem — *in addition to* the staff-applied `discountPrice` field that already exists.
4. **Edit ticket:** **re-price from edited case details** (re-run the resolver) **plus** manual per-line overrides.
5. **Promo codes:** full capability — `% or fixed`, max-discount cap, validity window, total + per-user usage limits, optional service/flow scope.
6. **Regenerate:** **staff-only**, via the intake wizard **pre-filled** from the source ticket, submitted through the existing `createIntakeTicket` path.
7. **Payment proof:** both sides — the **clerk** attaches proof when submitting his payment/costs, and the **admin** can attach proof when reconciling.
8. **Sidebar:** **live count badges per ticket-status nav item** in the left nav.
9. **Consumer detail additions:** status timeline, full submitted case details, delivery address & method. (Per-ticket payment history is **out of scope**.)
10. **Clerk listing additions:** next-hearing date + case number, assignment acceptance state, clerk-approval + delivery sub-status. (Financial summary is **out of scope**.)
11. **Address capture:** post-login **profile-completion step**, structured (geo pickers) + street/area.
12. **Case-file uploads:** the upload form gains **intake-wizard-style case fields** (year, case no, court, etc.).
13. **Clerk earnings (displayed):** `clerkCost` **+ the amounts the clerk reports** (per-page attested/non-attested + printing/delivery he submits).
14. **Instant rate:** compute the **year-sensitive** price components **client-side** using the shared pricing math; the debounced server call stays the source of truth and reconciles.

## 3. Cross-cutting money model

This is the foundation; A2/A3 and every recompute site depend on it.

### 3.1 Calculation order (single, canonical)

```
chargesSubtotal = serviceCost
                + deliveryCharges + printingCharges
                + attestedCharges + nonAttestedCharges
                + additionalCharges + additionalServiceCost
discountTotal   = discountPrice (staff) + promoDiscount (promo code)
taxableBase     = max(0, chargesSubtotal - discountTotal)
taxAmount       = round2(taxableBase * taxRate)        // taxRate stamped on ticket
totalAmount     = taxableBase + taxAmount
```

- Promo and staff discount **stack** and both reduce the base **before** tax.
- `taxAmount` is rounded to 2 decimals (PKR) once, at the end.
- This formula is the **single source**. Every site that computes `totalAmount`
  must use it: the pricing resolver, `createIntakeTicket`, `finalizeRemainderCore`,
  `finance.updateCharge`, `assign` (component-sum recompute), and the new
  edit/reprice endpoint.

### 3.2 Required change to existing gates

`finance.updateCharge` currently rejects `totalAmount < serviceCost`
(`finance.service.ts:249`). With discounts/promo this is now a **legitimate**
outcome. Replace that gate with:

- `totalAmount >= amountPaid` (keep — prevents billing below what's paid; the
  surplus-credit path handles the "dropped below paid" case where applicable),
- `discountTotal <= chargesSubtotal` (a discount may not exceed the subtotal),
- `taxableBase >= 0`.

### 3.3 Tax is per-phase for SPLIT flows

- **Digital ONE_TIME flows:** tax computed on the full taxable base at intake.
  The existing invariant "for ONE_TIME flows `serviceCost === total`" becomes
  **`serviceCost + taxAmount === total`** (no discount case). The `isBaseCovered`
  PAID gate must compare `amountPaid` against the tax-inclusive base, so paying
  the quoted amount still flips UNPAID → PAID.
- **SPLIT (physical) flows:** tax on the **phase-1 base** at intake, and again on
  the **phase-2 remainder** at finalize. `Ticket.taxAmount` **accumulates** across
  phases; `taxRate` is stamped once at intake and reused at finalize so the rate
  can't drift mid-ticket.

### 3.4 Rate is configurable and stamped

- Rate lives in a DB-backed `AppSetting` (`tax.rate`, `tax.enabled`),
  admin-editable, with an env fallback (`TAX_RATE`, default `0`).
- The effective rate is **stamped onto `Ticket.taxRate`** at pricing time so
  historical tickets keep their original rate even if the global rate changes.
- **Review item:** the actual rate value and exactly which charges are taxable.
  Default for this spec: rate configurable starting at `0`; **all
  consumer-billed charges are taxable** (i.e., the full `chargesSubtotal`). If
  delivery or the non-judicial copy fees should be exempt, that's a refinement to
  `chargesSubtotal` → introduce a `taxableSubtotal` subset.

### 3.5 Persist a structured price-breakdown snapshot

Today only flat rupee columns survive on the ticket; the resolver's line-item
detail (which surcharges, how many cities, State-vs, age surcharge, etc.) is
lost after intake. With reprice + promo + tax we need provenance for invoices,
audits, and the edit-preview diff.

- Add `Ticket.priceBreakdown Json?` — a snapshot of the resolver output plus the
  applied discount/promo/tax lines, written at **intake**, re-written on
  **reprice** and at **finalize**.
- The consumer invoice and the admin charges board render from this snapshot when
  present, falling back to flat columns for legacy tickets.

## 4. Workstream A — Pricing & money (build first)

### A1 — Tax

- **Schema:** `Ticket.taxRate Decimal? `, `Ticket.taxAmount Decimal @default(0)`.
  New `AppSetting { key String @id, value String, updatedByUserId String?, updatedAt DateTime @updatedAt }`.
- **Resolver:** `pricing.resolve` returns `taxRate`, `taxAmount`, and a
  tax-inclusive `total` per §3. Existing callers that read `total` keep working;
  the breakdown gains a `tax` line.
- **API:** a small admin endpoint set for tax config — `GET /settings/tax`,
  `PUT /settings/tax` (super-admin / admin only). Guarded by a new
  `settings.write` permission in `@wusuq/shared` (or reuse an existing admin
  permission — see §15, open item 3).
- **Web:** checkout (`intake-wizard.tsx` CheckoutPanel) shows a **Tax** line;
  the charges board (`ticket-charges-board.tsx`) shows tax read-only (derived,
  not hand-editable); a tax-rate field on an admin Settings screen.

### A2 — Promo / coupon codes

- **Schema:**
  ```prisma
  model PromoCode {
    id              String   @id @default(cuid())
    code            String   @unique          // normalized uppercase
    type            PromoType                  // PERCENT | FIXED
    value           Decimal                    // percent (0–100) or fixed Rs
    maxDiscount     Decimal?                   // cap for PERCENT
    startsAt        DateTime?
    endsAt          DateTime?
    totalUsageLimit Int?                       // null = unlimited
    perUserLimit    Int?                       // null = unlimited
    serviceScope    String[]                   // flow keys; empty = all flows
    active          Boolean  @default(true)
    createdByUserId String?
    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt
    redemptions     PromoRedemption[]
  }
  model PromoRedemption {
    id          String   @id @default(cuid())
    promoCodeId String
    userId      String
    ticketId    String
    amount      Decimal                        // discount actually applied
    createdAt   DateTime @default(now())
    promoCode   PromoCode @relation(fields: [promoCodeId], references: [id])
    @@unique([promoCodeId, ticketId])          // one redemption per code per ticket
    @@index([promoCodeId, userId])
  }
  enum PromoType { PERCENT FIXED }
  ```
  `Ticket.promoCodeId String?` + `Ticket.promoDiscount Decimal @default(0)`.
- **Service:** `PromoService.validate({ code, userId, flow, subtotal })` →
  `{ valid, discount, reason }`. Checks: `active`, within window, scope matches
  flow, `totalUsageLimit` (count redemptions), `perUserLimit` (count by user).
  Discount = `min(value%, maxDiscount)` for PERCENT, `min(value, subtotal)` for
  FIXED.
- **Application:**
  - Live checkout: `POST /promo/validate` returns the would-be discount for the
    preview (no write).
  - On intake: `createIntakeTicket` accepts optional `promoCode`; re-validates
    server-side, applies `promoDiscount` before tax, and writes a
    `PromoRedemption` row **inside the ticket-creation transaction** (so a failed
    create never leaks a redemption, and the `@@unique([promoCodeId, ticketId])`
    blocks double-apply on idempotent replays).
  - On reprice/regenerate: re-validate; if still valid, re-apply; else clear with
    a surfaced reason.
- **Admin CRUD:** a Promo Codes management screen (list/create/deactivate) under
  a new `promos.write` permission.
- **Web:** a promo-code input on the checkout step with apply/clear + inline
  validation feedback.

### A3 — Edit ticket → reprice + manual overrides

- **Endpoint:** `PATCH /tickets/:id` extended (or a dedicated
  `PATCH /tickets/:id/reprice`) accepting edited case fields (a payload subset)
  **and** optional manual line overrides. Plus `POST /tickets/:id/reprice/preview`
  returning the computed breakdown **without persisting** (drives the live
  preview).
- **Flow:** load ticket → merge edited fields into `formPayload` → validate via
  the existing flow validation (`requiredFieldsFor`, tier rules) →
  `buildPricingResolveInput(flow, payload)` → `pricing.resolve` → new charges +
  breakdown → apply manual overrides on top → recompute `totalAmount` per §3 →
  persist `formPayload`, charges, `priceBreakdown`, `totalAmount`. Audited
  (`FINANCE_CHARGE_UPDATE` / new `TICKET_REPRICE`).
- **Gates / safety:**
  - Status gate: no edits once `DELIVERED` (and likely not after `COMPLETED`
    except super-admin override — mirror the existing override policy).
  - `totalAmount >= amountPaid`; if the new total drops **below** `amountPaid`,
    reuse the **existing surplus auto-credit** path (VERIFIED `ADMIN_ADJUSTMENT`
    wallet row + `amountPaid` steps down) — and take the **USER lock before the
    ticket lock**, exactly as `finalizeRemainder` does, to avoid deadlock.
  - Must use `buildPricingResolveInput` (never hand-extract resolve fields) per
    the existing invariant.
- **Web:** an "Edit ticket" action on the admin ticket detail panel opening a
  form that re-uses intake field components for the editable case fields, shows
  the live re-priced breakdown (preview endpoint), and a manual-override section.

### A5 — Surface the existing staff discount

`Ticket.discountPrice` already exists and is editable in the charges board.
Surface it clearly in the edit screen and in the checkout breakdown so it reads
as a distinct line from promo and tax.

## 5. Workstream B — Regenerate with edit (staff-only)

- **Schema:** `Ticket.regeneratedFromTicketId String?` (+ index) for lineage.
- **Flow:** the admin "Regenerate" button (today an immediate
  `POST /tickets/:id/regenerate` in `ticket-board.tsx`) instead **navigates to
  the intake wizard** with a `regenerateFromTicketId` param. The wizard hydrates
  `initialPayload` from the source ticket's `formPayload` (full copy — distinct
  from the selective `buildFutureTicketsPayload` used for next-hearing tickets),
  lets staff edit any field, and submits through `createIntakeTicket` (full
  validation, re-pricing, idempotency via `intakeRequestId`), stamping
  `regeneratedFromTicketId`.
- **Source data:** `GET /tickets/:id` already returns `formPayload` to staff; no
  new read endpoint needed.
- **Scope:** staff-only (`tickets.write`). Consumers do not get regenerate-with-edit.
- **Old one-click path:** repurposed to open the wizard; the bare endpoint may
  remain for backward compatibility but the UI no longer calls it directly.

## 6. Workstream C — Instant checkout rate

- The only year-sensitive components are pure functions already in
  `@wusuq/shared`: `computeCaseSearchBase(caseYear)` (Case Search per-year base)
  and the `DECIDED_AGE_SURCHARGE_PER_YEAR` age surcharge.
- **Design:** on every year/decided-date change the checkout **recomputes those
  components client-side instantly** and patches the displayed total; the
  existing **400 ms debounced** server `resolve` call (`intake-wizard.tsx:637`,
  `:693`) remains the authoritative reconcile. Because both client and server use
  the **same shared functions**, there is no drift.
- The debounce stays (it exists for the ~15-req/min throttle); only the
  *displayed* number becomes instant.

## 7. Workstream D — Visibility & detail UX

### D1 — Consumer ticket detail (complete details)

- Render, in `ConsumerTicketDetail` (`consumer-ticket-board.tsx`):
  - **Status timeline** — the `GET /tickets/:id` response already includes
    history; render a transition timeline (no internal staff notes).
  - **Full submitted case details** — a consumer-safe whitelist parsed from
    `formPayload` (case no, year, title, court level, bench, etc.).
  - **Delivery address & method** — for physical-document flows, parse and show
    the structured delivery address and method.
- **Preserve redaction:** `redactTicketForConsumer` keeps hiding `clerkCost`,
  `defaultClerkCost`, `clerkReport`, `dispatchProofUrl`, and rep phone. New fields
  must route through the redaction layer.

### D2 — Clerk ticket listing (max detail)

- **API:** `findAll` eager-loads the `Case` relation (when `caseId` present) and
  the `Assignment` status; returns next-hearing date, case number, clerk-approval
  status, delivery sub-status, assignment acceptance state.
- **Web:** the clerk view of `ticket-board.tsx` gains columns/badges for
  next-hearing date + case number, assignment acceptance (ACTIVE/ACCEPTED), and
  clerk-approval + delivery sub-status. `clerkCost` stays hidden per the audit rule.

### D3 — Clerk identity + earnings

- Replace generic **"Clerk"** labels in `ticket-detail-panel.tsx` and the admin
  **Review & Complete / finalize** dialog (`ticket-board.tsx:1493+`) with the
  assigned rep's **name** (`assignments[0].representative.name`).
- Show **clerk earnings** = `clerkCost` + the amounts the clerk reports
  (attested + non-attested + printing + delivery he submitted), attributed to the
  named clerk, in both the ticket detail and the finalize screen.
- **Internal-only:** clerk earnings (like `clerkCost`) are redacted from consumers.
- **Review item:** confirm the exact components summed into "amounts the clerk
  reports" (proposed: `attestedCharges + nonAttestedCharges + printingCharges + deliveryCharges`).

### D4 — Sidebar count badges

- **API:** `GET /tickets/counts` returning per-status counts, role-scoped (clerk
  → their assignments; admin/staff → all; consumer → their own).
- **Web:** `nav.tsx` renders a live count badge on each ticket-status nav item
  (refreshed on navigation / light polling).

## 8. Workstream E — Payment proof (both sides)

### E1 — Clerk submits proof with his payment/costs

- `Ticket.clerkReceiptUrl` already exists and is **already captured** at clerk
  submit (`tickets.service.ts:1596`, `:1615`) and shown in the finalize dialog
  (`ticket-board.tsx:1507`). Work here is **frontend**: ensure the clerk's
  cost/payment submission form exposes the proof upload (reusing the existing
  upload pattern) and treats it as part of submission.

### E2 — Admin reconcile proof

- `WalletTransaction.receiptUrl` exists but the reconcile path doesn't capture it.
  - **DTO:** add optional `receiptUrl` to `ReconcilePaymentDto`.
  - **Service:** `finance.reconcilePayment` forwards `receiptUrl` onto the
    `WalletTransaction`.
  - **Upload:** reuse the existing `POST /wallet/receipt` upload (PDF/JPG/PNG,
    10 MB) — the front end uploads first, then passes the returned URL into
    reconcile (matching the current top-up pattern).
  - **Web:** the finance-board reconcile row gains an optional file picker; the
    finance/payment history shows a "proof" link when present.
- **Required vs optional:** optional on the admin side (so fast reconciles aren't
  blocked); the clerk side is expected as part of submission.

## 9. Workstream F — Onboarding & case data

### F1 — Address at profile completion

- **Web:** add structured address to the post-login profile step
  (`profile-step.tsx`): province/district/city via the existing geo pickers + a
  street/area line.
- **API:** extend the `completeProfile` DTO + `auth.service.ts:220+` to accept and
  persist `address` (composed) plus the existing `province/district/city/postalCode`
  User fields. `User.address` already exists.

### F2 — Case-file upload form gains intake-wizard case fields

- The case-files upload (`upload-drawer.tsx` → `POST /personal-files/case-files`)
  currently captures only `serviceId/cityId/courtName/courtType/caption`. Add
  intake-wizard-style case fields (year, case no, case title, court level, case
  type, etc.) so an uploaded file is tagged with real case context.
- **Schema:** add case-context columns to `PersonalFile` (or a `caseMeta Json?`
  field) to hold the new metadata.
- **Reuse:** mirror the intake field components and the existing
  `2026-05-16-wizard-style-case-files-upload-design.md` direction — align with,
  don't fork, that prior design.
- **Review item:** which intake fields to include, and whether they're per-file
  or per-upload-batch.

## 10. Consolidated schema changes

New models: `PromoCode`, `PromoRedemption`, `AppSetting`. New enum: `PromoType`.

`Ticket` additions: `taxRate Decimal?`, `taxAmount Decimal @default(0)`,
`promoCodeId String?`, `promoDiscount Decimal @default(0)`, `priceBreakdown Json?`,
`regeneratedFromTicketId String?`.

`PersonalFile` additions: case-context columns or `caseMeta Json?`.

Already present (no migration): `Ticket.discountPrice`, `Ticket.clerkReceiptUrl`,
`WalletTransaction.receiptUrl`, `User.address` (+ geo fields).

Each migration is additive (nullable / defaulted) — safe to deploy ahead of code.

## 11. Invariants to preserve

- **Conditional status transitions** — any new transition is a conditional
  `updateMany({ where: { id, status: expectedFrom } })` with history in the same
  `$transaction`; `count === 0` → 409. Edit/reprice does **not** change status.
- **`buildPricingResolveInput` is the only resolve-input builder** — reprice and
  regenerate must use it.
- **Consumer redaction** — all new consumer-visible fields route through
  `redactTicketForConsumer`; clerk cost/earnings, clerk report, dispatch proof,
  rep phone stay hidden.
- **Lock order** — finalize/reprice take the USER lock before the ticket lock.
- **Idempotency** — regenerate-as-intake relies on `intakeRequestId`; promo
  redemption guarded by `@@unique([promoCodeId, ticketId])`.
- **Payment-model agreement** — `PAYMENT_MODEL_BY_FLOW`,
  `SERVICE_CHARGE_CAPABILITIES`, and the resolver must still agree on the physical
  set; tax threads through both phases.
- **Wallet net balance** stays dynamic (`net = credit − dues`); tax raises dues,
  promo/discount lower them — `getMyWallet` math is unchanged in shape.

## 12. Recommended build order

1. **A (Pricing & money)** — tax, promo, edit/reprice, breakdown snapshot. Foundation: rewrites the money path everything else assumes.
2. **B, C, E in parallel** — regenerate, instant rate, payment proof. Independent and small.
3. **D** — visibility (consumer detail, clerk listing, clerk identity/earnings, sidebar badges).
4. **F** — onboarding address, case-file fields.

## 13. Testing

- **Unit (API):** money-math `round2`/order across digital & SPLIT, per-phase
  tax; promo validation (window, scope, total + per-user limits, PERCENT cap);
  reprice surplus-credit + lock order; gate changes in `updateCharge`.
- **Integration:** intake with promo writes one redemption transactionally;
  reprice below `amountPaid` credits wallet; regenerate stamps lineage and
  re-prices.
- **E2E (Playwright):** checkout shows tax/promo/discount lines and instant
  year-driven rate; admin edits a ticket and sees the re-priced preview; clerk
  submits costs with proof; admin reconciles with proof; consumer detail shows
  timeline + case details + delivery; sidebar badges reflect counts.
- **UAT:** role-permission matrix for new `promos.write` / `settings.write`.

## 14. Out of scope

- Per-ticket payment history in the consumer view.
- Financial summary column in the clerk list.
- Commission-based clerk earnings (earnings = `clerkCost` + reported amounts only).
- SMS/OTP wiring (still absent per project state).

## 15. Open review items

1. Tax **rate value** and exactly which charges are taxable (default: configurable, starts at 0, all consumer charges taxable).
2. Exact components in "amounts the clerk reports" for the earnings figure.
3. Whether to reuse an existing admin permission or add `settings.write` / `promos.write`.
4. Which intake fields to copy into the case-file upload form, and per-file vs per-batch.
5. Whether edits are allowed in `COMPLETED` (super-admin only?) as well as the no-edit-after-`DELIVERED` rule.
