# Client review batch 5 — findings (2026-08-10)

Sources:
1. `WhatsApp Video 2026-08-09 at 15.02.11.mp4` — 1:12, Urdu voiceover. Invoice download + delete residue.
2. `WhatsApp Video 2026-08-09 at 15.04.52.mp4` — 1:19, Urdu voiceover. Regenerate / future-ticket flow.
3. `Screen Recording 2026-08-10 at 7.24.32 PM.mov` — 37s, silent scroll of the "Wusuq dev" chat (8–10 Aug).

Method: whisper large-v3 (`-mc 0 -tp 0.4 -et 2.8`) + frame extraction with vision passes.

**Client status:** *"all testing done… we are ready to upload it… or Live krain InshaAllah"* (9 Aug). He is
close to go-live, so this batch is mostly finishing work — with one real money bug.

---

## A. Wusuq earnings goes NEGATIVE on USD tickets — currency mixing 🔴 REGRESSION (mine)

Chat msg 26, ticket `TKT-62581265-543774` (Attock, COMPLETED, *"This is an international client"*):

| Line shown | Value |
|---|---|
| Service Cost | PKR 14,250 |
| Test Attock's earnings | PKR 2,375 (clerk cost 2,000 + attested 375) |
| **Wusuq earnings** | **PKR −2,325** ❌ |

Client: *"our profit is 11875"* — and he's right: `14,250 − 2,375 = 11,875`.

**Root cause (verified in code).** `computeWusuqMargin(total, clerkEarnings)` subtracts two numbers in
**different currencies**:

- `customerTotal = Number(ticket.totalAmount)` — the **raw** value in the ticket's own currency, i.e.
  **$50 USD** (`ticket-detail-panel.tsx:134`).
- `clerkEarnings` — **always PKR**; clerk payouts are domestic regardless of the consumer's billing
  currency (a deliberate rule from the USD→PKR work).

`50 − 2375 = −2325` — exactly the figure on screen.

This is a defect in my own batch-3 USD→PKR feature, and the surrounding comment I wrote is what
enshrined it:

> *"Clerk earnings + the Wusuq-margin line below stay literal PKR, unconverted — clerk pay-outs (and
> the margin derived from them) are domestic regardless of the consumer's billing currency."*

The clerk half of that is right. The **margin** half is wrong: the margin is a *subtraction across two
currencies*, so the total must be converted to PKR **before** subtracting PKR clerk pay. The bug is
especially visible because the Service Cost line right above it *is* converted (via `formatStaffMoney`,
14,250) — converted display sitting directly on top of unconverted arithmetic.

**Affects both call sites:** `ticket-detail-panel.tsx:363` and `ticket-board.tsx:2605` (the finalize
dialog, via `finalizeTotal` from `computeTicketTotal`, which also works in the ticket's currency).

**Fix:** convert the total to PKR (`convertToPkr(total, ticket.fxRateToPkr)`) before computing the
margin on non-PKR tickets. When no FX rate is stamped, render the "(rate not set)" marker rather than
a number — never a nonsense negative. PKR tickets are unaffected.

---

## B. Soft-delete leaves residue everywhere 🔴

The client cleared tickets and found remnants across four surfaces. Chat msgs 3, 5, 11 + video 1.

- **Clerk/paralegal data** — staff dashboard still shows **Top Paralegals** ("Abbas Ali – 1", "Bilal – 1")
  and **Today's Hearings** after everything was deleted. Client: *"ticket 0 hy to clerks ki tickets kesy
  ho sakti hy"* — if tickets are 0, how can clerks have tickets?
  - **Already flagged in batch 4 and not fixed:** `assignment.groupBy` (Top Paralegals) and the
    `openCases` nested `tickets` select reach tickets through relation filters with **no `archivedAt`
    exclusion**. This is that exact gap, now client-visible.
- **Notifications** — the consumer bell still lists "Service completed / Final payment due / Request
  submitted" for `TKT-85905379-133644` after deletion.
- **Wallet** — video 1: *"in My Wallet all these tickets, I deleted them… when a ticket is deleted its
  data should also be deleted from here"*.
- Client asks **twice** for a full DB clear including clerks, clients and notifications
  (msgs 22, 27).

**Note the developer's own reply (msg 10)** — *"Data deleted from dashboard is not deleted from DB…
it's for safety and security"* — and the client **agrees** with soft-delete in principle (msg 11). His
ask is narrower and reasonable: **soft-deleting a ticket should cascade to everything derived from it**
(clerk tallies, notifications, wallet rows), not just hide the ticket row.

---

## C. Invoice not reachable from a completed ticket 🟡

Video 1 + chat msg 14: *"I completed a ticket, paid it… where can I generate its invoice? I go here,
the ticket is completed, I can't find the button anywhere. And if I go to Invoices, there's no button
there either."*

**Not a bug — a design mismatch, and worth an explicit decision.** Per Plan B, an `Invoice` is an
**admin-issued, multi-ticket document**; the consumer "Download invoice" control renders **only** once
that ticket has been pulled onto an invoice (`ticket.invoiceItem` populated,
`consumer-ticket-board.tsx:360-364`). A freshly completed ticket has no invoice yet, so there is
correctly nothing to download.

He received `INVOICE 000002` as a PDF (msg 12) and called it *"the beautiful invoice"* — so the feature
works; what's missing is a **per-ticket receipt on completion**, or a clearer empty state explaining
that invoices are issued by Wusuq.

Also in video 1: *"in place of download, please add **View** too"* — the same View-vs-Download ask as
batch-3 C1/C2, now for the invoice surface.

---

## D. Regenerate / Order Future Tickets 🟡

Video 2 + chat msg 16.

- **Error on regenerate from the consumer side** (*"Regenerating from Consumer side Error please"*).
  Exact error text not legible in the frames — **needs reproduction**.
- **The next hearing date should auto-fill.** Client: the clerk set the next date to **12 Aug**; when
  the consumer clicks through to reorder, *"here the date should be written automatically"*.
  This matches what I observed in batch 4: Regenerate carries the **previous** hearing date forward but
  leaves the **next hearing date blank**. He wants the known next date pre-filled.

---

## E. Smaller items

- **E1 — "Pay later" should navigate away** (msg 9): after clicking Pay later the page stays put; it
  should go to Pending Tickets or the Dashboard. *This also answers batch-3 **L1** ("pay later not
  working"), which I had deferred pending clarification — the complaint was navigation, not logic.*
- **E2 — Delivery address issue** (msgs 6–7): the address block (Delivering to / House / Block / Main
  Area) is circled with *"please this address issue"* and no further detail. **Ambiguous — ask.**

---

## F. Forgot password — ⚠️ do NOT implement as requested

Chat msg 23: *"forgot password isn't working… we don't have OTP so far. what if we use free mail for
some time. they receive email on their mail with their password in it"*

Two problems:

1. **No forgot/reset-password route exists at all** — confirmed, nothing in `auth.controller.ts` /
   `auth.service.ts`. So "isn't working" is accurate: it was never built.
2. **Emailing the user their password is not possible, and must not be made possible.** Passwords are
   bcrypt-hashed at rest (`hash(dto.password, 10)`, `auth.service.ts:172`) — they cannot be read back.
   Implementing this would require storing passwords reversibly, which is a serious security
   regression, and mailing plaintext credentials besides.

**Recommend instead:** a standard time-limited, single-use **reset token** emailed as a link
(`/reset-password?token=…`), which needs no OTP/SMS and keeps hashing intact. Same UX outcome for the
client, without weakening credential storage. This needs an email sender — note `EmailService` was
never wired up (the invoice work found it referenced but not implemented).

---

## Cross-batch status

- Batch-4 **B** (admin dashboard archived filter) shipped, but its **flagged leftovers are exactly what
  the client is now reporting in §B** — `assignment.groupBy` + `openCases`. Fix those.
- Batch-3 **L1** ("pay later not working") is now explained — see E1.
- Batch-3 **C1/C2** (View beside Download) recurs for the invoice surface — see §C.

## Open decisions carried from batch 4 (still unanswered)
1. Downward clerk-charge corrections: keep `min(submitted, final)`, or strict freeze?
2. Split clerk **fee** vs reimbursed **expenses** in the earnings display?
