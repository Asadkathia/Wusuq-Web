# Streamline the ticket workflow + physical-dispatch verification

**Date:** 2026-06-05
**Status:** Approved (design)

Make the admin/clerk ticket workflow fewer, single-click steps, and add a
lightweight way to verify the clerk actually dispatched physical files before a
ticket is marked delivered.

---

## Goals

1. Collapse the redundant admin review tail (**Verify Receipt → Finalize Charges
   → Approve & Complete**) into **one** "Review & Complete" action.
2. Add a simple physical-dispatch trail: clerk **Mark dispatched** (with proof) →
   admin **Confirm delivered** (which shows the proof — confirming *is*
   verifying). No standalone verify step.
3. Auto-finish digital flows (no dispatch, no manual delivery click).
4. Every gate is a single click; proof is shown at the click that matters.

Non-goals: courier API / real-time tracking; consumer-side receipt
confirmation; settlement-triggered auto-deliver for pay-later digital tickets.

---

## New lifecycle

Admin actions in **bold**, clerk in _italics_.

```
PAID → [Assign] → ASSIGNED → _Accept_ → IN_PROGRESS
  → _Mark done & submit_ (upload work receipt)                  → WAITING_APPROVAL   (was: stayed IN_PROGRESS)
  → [Review & Complete]  (one modal: receipt + finalize charges + Approve)   → COMPLETED
       • Send back → IN_PROGRESS (reason logged)
  → DIGITAL flows (Case Info/Search/Filing/PoA): auto → DELIVERED  (when fully paid)
  → PHYSICAL flows (Case Files + 3 non-judicial):
       → _Mark dispatched_ (attach courier proof + tracking no)  → deliveryStatus = DISPATCHED
       → [Confirm delivered] (proof + tracking shown inline)     → DELIVERED   (payment-gated)
```

"Physical flow" = `chargeCapabilitiesFor(flow).delivery === true` (the single
source already used for delivery — Case Files + the 3 non-judicial copies).

---

## Data model (one migration)

```prisma
enum DeliveryStatus {
  PENDING
  DISPATCHED
}

model Ticket {
  // …
  deliveryStatus   DeliveryStatus @default(PENDING)
  dispatchProofUrl String?
  trackingNo       String?
}
```

`deliveryStatus` is only advanced for physical flows; digital flows stay
`PENDING`. The admin's "Confirm delivered" is the verification, so there is no
`VERIFIED` state — `DELIVERED` (the main ticket status) is the terminal state.

---

## Backend changes (`apps/api/src/tickets`)

1. **`submitClerkReceipt`** — also transition `IN_PROGRESS → WAITING_APPROVAL`
   (guarded: only when current status is `IN_PROGRESS`). Still sets
   `clerkReceiptUrl` + `clerkApprovalStatus = SUBMITTED`.

2. **New `reviewAndComplete(ticketId, dto, actor)`** (admin, from
   `WAITING_APPROVAL`), atomic in one transaction:
   - set `clerkApprovalStatus = VERIFIED` (if it was `SUBMITTED`),
   - apply finalize charges if provided (reuse the `finalizeRemainder` math —
     attestation/printing/delivery, gated by `chargeCapabilitiesFor`, recompute
     `totalAmount`, set `remainderFinalizedAt`),
   - set `status = COMPLETED`,
   - **auto-deliver**: if the flow is digital and `isFullyPaid`, set
     `status = DELIVERED`,
   - one audit event + status-history row + dispatcher notify.
   Replaces the FE orchestration of `verifyClerkReceipt` + `finalizeRemainder` +
   `updateStatus`. Extract the shared charge math into a private helper used by
   both `finalizeRemainder` and `reviewAndComplete`.

3. **New `sendBackToClerk(ticketId, reason, actor)`** (admin, from
   `WAITING_APPROVAL`) → `clerkApprovalStatus = REJECTED`, `status = IN_PROGRESS`.
   Replaces verify-reject + the standalone "Send Back".

4. **New `dispatchDelivery(ticketId, { proofUrl?, trackingNo? }, actor)`**
   (clerk/representative, from `COMPLETED`, physical flow only): set
   `deliveryStatus = DISPATCHED`, persist `dispatchProofUrl` + `trackingNo`.
   Reuses the clerk-receipt upload plumbing (`getUploadsBucketDir`). Audit +
   notify admin. Rejects on digital flows / non-`COMPLETED` status.

5. **DELIVERED gate** (`updateStatus` / `overrideStatus` → `DELIVERED`): keep the
   existing `isFullyPaid` gate; **additionally**, for physical flows require
   `deliveryStatus === DISPATCHED` (the admin can't confirm delivery before the
   clerk dispatched). Digital flows: `isFullyPaid` only.

Controller: new endpoints `POST :id/review-complete`, `POST :id/send-back`,
`POST :id/dispatch` (with multipart proof upload, like `clerk-receipt`). Keep
existing `verifyClerkReceipt`/`finalizeRemainder` endpoints available during
migration but the new UI uses the merged ones.

---

## Frontend changes

**Admin (`ticket-board.tsx`):**
- Remove the standalone `IN_PROGRESS` "Verify Receipt" button (submit now lands
  the ticket in `WAITING_APPROVAL`).
- `WAITING_APPROVAL`: replace "Verify Receipt" + "Finalize Charges" + "Approve &
  Complete" with **one "Review & Complete"** modal — clerk-receipt preview +
  charge-finalization fields (only when `chargeCapabilitiesFor(flow)` has caps &
  not finalized) + **Approve** / **Send back**.
- `COMPLETED` + physical + `deliveryStatus = DISPATCHED`: **"Confirm delivered"**
  (modal shows `dispatchProofUrl` + `trackingNo`; payment-gated). Replaces the
  buried status dropdown for this transition.

**Clerk/representative (`ticket-board.tsx`, clerk view):**
- Relabel "Submit to Admin" → **"Mark done & submit for review"**.
- `COMPLETED` + physical + `deliveryStatus = PENDING`: **"Mark dispatched"**
  (upload proof + tracking).

**Consumer (`consumer-ticket-board.tsx`):**
- Physical ticket with `deliveryStatus = DISPATCHED`: show an **"Out for
  delivery"** chip + the tracking no.

Status pills / timeline reflect the dispatch sub-state where shown.

---

## Gating summary

| Transition | Guard |
|---|---|
| `IN_PROGRESS → WAITING_APPROVAL` | clerk submits work receipt |
| `WAITING_APPROVAL → COMPLETED` | admin Review & Complete |
| `WAITING_APPROVAL → IN_PROGRESS` | admin Send back (reason) |
| `COMPLETED → DISPATCHED` (sub-state) | clerk dispatch, physical flow only |
| digital `COMPLETED → DELIVERED` | auto, when `isFullyPaid` |
| physical `COMPLETED → DELIVERED` | admin Confirm delivered, requires `deliveryStatus = DISPATCHED` AND `isFullyPaid` |

---

## Testing

Backend unit tests (mock Prisma, mirror existing `tickets.service.spec.ts`):
- `submitClerkReceipt` moves `IN_PROGRESS → WAITING_APPROVAL` and sets
  `clerkApprovalStatus = SUBMITTED`.
- `reviewAndComplete`: sets `VERIFIED` + applies charges + `COMPLETED`;
  auto-`DELIVERED` for a digital flow when fully paid; stays `COMPLETED` for a
  physical flow (remainder unpaid).
- `sendBackToClerk` → `IN_PROGRESS` + `REJECTED`.
- `dispatchDelivery` sets `DISPATCHED` for a physical flow from `COMPLETED`;
  rejects on a digital flow and on non-`COMPLETED` status.
- DELIVERED gate: physical flow blocked unless `deliveryStatus = DISPATCHED` and
  fully paid; digital flow blocked unless fully paid.

FE is presentational — verify via typecheck/lint + manual pass (no component
render harness for these boards).
