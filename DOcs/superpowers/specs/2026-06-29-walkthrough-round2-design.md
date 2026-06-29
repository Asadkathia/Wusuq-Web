# Owner walkthrough — round 2 (6 modifications)

**Date:** 2026-06-29
**Status:** Approved (brainstorm) → implementing

A batch of owner-requested changes following the round-1 walkthrough fixes. Sequenced
AFTER the email-only-auth change (`2026-06-29-email-only-auth-phone-region-design.md`),
which item 6 extends.

## 0. Shared building block

- **Centralize clerk earnings** in `@wusuq/shared`: `computeClerkEarnings(t)` =
  `clerkCost (or defaultClerkCost) + attestedCharges + nonAttestedCharges + printingCharges + deliveryCharges + (pdfPurchased ? PDF_CLERK_FEE : 0)`.
  Replaces the two duplicated web copies (`computeFinalizeClerkEarnings` in
  `ticket-board.tsx`, `computeClerkEarnings` in `ticket-detail-panel.tsx`) and is reused
  by the clerk-dashboard API. New constant **`PDF_CLERK_FEE = 100`**.
- The finalize-dialog variant takes the in-progress form values (attested/printing/etc.)
  rather than persisted columns; the shared fn accepts a plain shape so both callers pass
  either persisted or form values.

## 1. Self-collection → court is the pickup point

`intake-flows.ts`: remove the `pickup_location` **text input** (Case Files + Case Search).
When `delivery_mode === 'Self Collection'`, the wizard renders a **read-only** block:
"Collect from: *{select_court}, {city}*". GeoCity/CourtSeat store no street address, so the
selected court + city **is** the pickup point. Persist that composed label as
`pickup_location` at submit (via `withDerivedYear`-style stamping) so the ticket/clerk shows it.

## 2. Remove billing-region chip (consumer)

Delete the "Billing region: International (USD) / Pakistan (PKR)" chip + helper text in
`consumer-profile-board.tsx` (~lines 108-115). Currency still drives billing server-side;
it is simply not surfaced to the consumer.

## 3. Clerk dashboard (new)

- **API:** `GET /dashboard/clerk-summary`, self-scoped by `actor.sub`, gated on `tickets.read`
  (representatives already hold it — no `ROLE_PERMISSIONS` change). New
  `DashboardService.getClerkSummary(repId)` returns:
  - **earnings**: `{ realized }` (Σ `computeClerkEarnings` over COMPLETED + DELIVERED),
    `{ pending }` (Σ over IN_PROGRESS + WAITING_APPROVAL), `{ thisMonth }` (realized whose
    completion falls in the current month, by latest COMPLETED/DELIVERED history row).
  - **counts** by status (assigned/in-progress/waiting-approval/completed/dispatched/delivered).
  - **acceptance**: pending-acceptance vs accepted.
  - **recent** assignments (latest N) + **upcomingHearings** (future `nextHearingDate`).
- **Web:** `/dashboard` gains a **clerk branch** (alongside consumer/admin) so reps stop
  403'ing; renders earnings cards (Realized / Pending / This month) + status counts + recent
  tickets + upcoming hearings, reusing existing dashboard card components.
- **Nav:** add "Dashboard" as the first item in `buildClerkItems`; reps land on `/dashboard`
  after login (was `/tickets/assigned`).

## 4. Admin price window — show clerk's full submission

Review & Complete dialog (`ticket-board.tsx`): beside each editable charge input
(attested / non-attested / printing / delivery / additional) show the **clerk-submitted
value** read-only ("Clerk submitted: PKR X") so the admin compares submitted vs final. The
page breakdown (pages × rate) already shows; the earnings line now includes PDF 100 (via the
shared fn).

## 5. PDF 300 / 100 split

`PDF_CLERK_FEE = 100` (shared). `computeClerkEarnings` adds 100 when the ticket purchased PDF
(`pdfSurcharge > 0`, or payload `want_pdf_before_dispatch === 'Yes'`). Consumer still pays 300
at intake (unchanged); the 100 is the clerk's internal cut, surfaced only in earnings (admin
finalize + clerk dashboard). No consumer-billing change.

## 6. Post-signup onboarding (skippable, multi-step)

- New route **`/consumer/onboarding`** — a short wizard: **Step 1 Address** (street + postal) →
  **Step 2 Location** (province → district → city cascading pickers, reusing `LocationBlock`) →
  **Step 3 Finish**. `consumerKind` is captured at signup, so not repeated. CNIC/DOB are NOT
  part of onboarding (kept on the profile page).
- **Skippable:** "Skip for now" → dashboard; progress indicator; the existing
  `profile-completion-banner` keeps nudging skippers and links here.
- Saves via the existing `POST /auth/profile/complete` (accepts address/province/district/
  cityName/postalCode/country).
- **Signup redirect changes** `/consumer/dashboard` → `/consumer/onboarding`. Login still →
  dashboard.

## Out of scope

- Clerk payout *tracking* (no "paid to clerk" ledger) — earnings are computed, not settled.
- Per-court street addresses (no data source).
- CNIC/DOB in onboarding.

## Verification

- Shared `computeClerkEarnings` unit test (incl. PDF 100). Clerk-summary service test
  (realized/pending/this-month). Existing auth/ticket tests stay green.
- `pnpm typecheck` (api + web) + `pnpm --filter @wusuq/web build` green; lint clean.
