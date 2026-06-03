# Dynamic wallet (net of dues) + richer My Tickets cards

**Date:** 2026-06-04
**Status:** Approved (design)

Two independent consumer-facing changes.

---

## Feature 1 — Dynamic wallet balance (net of outstanding dues)

### Goal
The consumer's wallet balance should reflect what they actually owe. When a
consumer defers payment ("Pay later"), their wallet shows a **negative** balance
equal to their outstanding ticket dues.

### Model — "indicator" (chosen)
- The ticket stays `UNPAID` and the payment gate still holds (no work starts
  until paid). The negative balance is an indicator of owed dues, not a credit
  line.
- **No schema change.** `User.walletBalance` keeps its current meaning =
  **prepaid credit** (verified top-ups not yet consumed; floored at 0, as today).
- A new **computed net balance** is exposed on read:

  ```
  netBalance      = prepaidCredit − outstandingDues
  prepaidCredit   = User.walletBalance            (>= 0, unchanged)
  outstandingDues = Σ max(0, totalAmount − amountPaid)
                    over the consumer's tickets where
                    status != 'DELIVERED' AND totalAmount > 0
  ```

- `outstandingDues` counts **every** non-delivered unpaid/partly-paid ticket —
  not only ones the consumer explicitly deferred. Any unpaid ticket pulls the
  wallet negative (confirmed with owner).
- "Pay later" requires **no new write**: the ticket already exists as `UNPAID`
  and contributes to dues, so the net balance reflects `−due` immediately.

### Backend
- `WalletService.getMyWallet(userId)` returns
  `{ balance: netBalance, credit: prepaidCredit, due: outstandingDues, transactions }`.
  - `due` sums `totalAmount − amountPaid` over the user's non-delivered,
    positively-priced tickets.
- **No changes** to `topup` / `verifyTopup` / `clearPendingTickets` /
  `adjustWallet`: when a top-up is verified, existing FIFO settlement marks
  tickets `PAID` and reduces dues, so the net balance rises back toward/above 0.
- **Admin wallet list (`WalletService.list`) is unchanged** (owner: keep admin
  as-is). Only the consumer view changes.

### Frontend
- Header wallet chip (`consumer-nav`) and `consumer-wallet-board` display the
  **net** balance. Negative is rendered in a warning/danger color with a small
  breakdown line, e.g. `PKR 3,300 owed · PKR 0 credit`.
- `handlePayLater` (pay page): keep the navigation, add a confirmation toast
  ("Added PKR X to your wallet as due — pay anytime").

### Out of scope
- No credit/overdraft logic (work does not proceed on a negative balance).
- No change to the payment gate.

---

## Feature 2 — Richer My Tickets cards (frontend-only)

### Goal
Each ticket card on the consumer **My Tickets** page should surface the maximum
useful detail about the ticket at a glance.

### Data
The `/tickets` list endpoint (`TicketsService.findAll`) **already returns** the
needed fields: `payload` (formPayload), `intakeFlow`, `scheduledDate`,
`service.{name,category,type}`, `serviceCost`, `totalAmount`, `amountPaid`,
`status`, `createdAt`, `batchNo`, `serviceCity`, `caseType`. **No backend
change** — extend the FE `TicketRow` type and the card renderer only.

### Card sections (render each field only when present)
- **Header** (unchanged): service name, batch no, relative created time, status
  pill.
- **Case identifiers:** case no (`payload.case_petition_no` / `case_no`), year
  (`payload.case_year` / `year`), case title (`payload.case_title`).
- **Court & category:** court tier label from `payload.select_court_type`
  (via `courtTierFromCourtType` / a label map) + sub-court
  (`payload.select_court` or `caseType`); Judicial/Non-Judicial from
  `service.category`; flow label from `FLOW_LABELS[intakeFlow]`.
- **Payment breakdown:** thin paid/total progress bar + `PKR X paid · PKR Y due`
  (reuses `totalAmount`/`amountPaid`).
- **Dates & progress:** created date, scheduled/hearing date if present
  (`scheduledDate`), and a compact 5-step lifecycle indicator
  (UNPAID → PAID → ASSIGNED/IN_PROGRESS → WAITING_APPROVAL → COMPLETED/DELIVERED).

### Constraints
- Consumer-safe: no clerk cost, no PII, no internal staff names (mirror
  `ConsumerTicketDetail`).
- Keep the card scannable: small section labels, wrap chips, hide empty fields.
- Existing Pay-now / Final-payment CTAs preserved.

### Out of scope
- Portal/admin ticket cards (this is the consumer `ConsumerTicketBoard` only).

---

## Testing
- **Wallet:** unit test `getMyWallet` — net = credit − dues; negative when dues >
  credit; dues exclude `DELIVERED` and zero-priced tickets; existing top-up/
  settlement tests still pass.
- **Cards:** rendering is presentational; verify via typecheck/lint and a manual
  pass (the project has no component-render test harness for this board).
