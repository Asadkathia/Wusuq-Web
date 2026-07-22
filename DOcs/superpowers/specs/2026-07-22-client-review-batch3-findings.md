# Client review batch 3 — findings (2026-07-22)

Sources:
1. `WhatsApp Video 2026-07-20 at 01.24.40.mp4` — 1:55 client screen recording **with Urdu voiceover**, demonstrating the clerk-payout defect live.
2. `Screen Recording 2026-07-22 at 9.00.27 PM.mov` — 2:42 **silent** scroll through the "Wusuq dev" WhatsApp chat containing the written edit list (Mon 12:29–1:43 AM, sender ~Wusuq 2 / ~Ali Zain Cheema).

Method: whisper large-v3 for the Urdu audio (the single-pass run hit a repetition loop after 0:55; the tail was re-transcribed as a separate segment); 1 fps frame extraction + 4 parallel vision passes for the chat scroll.

Numbering below is by theme, de-duplicated. Several chat items are the **same defect reported more than once**.

---

## A. Clerk payout must ignore the admin's markup — HIGHEST PRIORITY

Reported **three independent times** (voiceover, the 400+100 note, and an explicit rule statement). The client's rule, verbatim:

> "super admin jo cost krta hy add wo clerk k liye nai hy. clerk ka wohi invoice hy jo us ny bana di. super admin 5000 ki ticket ko 10,000 kr de. clerk ki amount wohi rahy gi"
>
> Whatever the super admin adds is NOT for the clerk. The clerk's invoice is exactly what the clerk created. If the super admin turns a Rs 5,000 ticket into Rs 10,000, the clerk's amount stays the same.

**Demonstration (video 1):** clerk submitted 50 non-attested pages @ Rs 5 = 250. Admin marked the rate to Rs 10 → 500. Ticket total 1,200 (base 500 + non-attested 500 + delivery 200).
- Shown: **Bilal's earnings PKR 1,100 / Wusuq earnings PKR 100**
- Expected: clerk 400 + 200 delivery + **250** (clerk's own rate) = **850**; Wusuq = **350**

**Second instance:** clerk dashboard showed EARNED (REALIZED) **PKR 600**; client says it should be 400 + 100 photocopy = 500, because "100 super admin ny extra" must not reach the clerk.

**Root cause (verified in code):**
- `computeClerkEarnings()` — `packages/shared/src/index.ts:908` — sums the **final** charge columns (`attestedCharges`, `nonAttestedCharges`, `printingCharges`, `deliveryCharges`).
- `finalizeRemainderCore` **overwrites those same columns** with the admin's marked-up values.
- Therefore the admin's markup is paid to the clerk, and `computeWusuqMargin` (total − clerk) collapses.

**Consequence not yet noticed by the client:** there is **no separate clerk-submitted column**. The "Clerk submitted: PKR 250" comparison line in the Review & Complete dialog reads the *same live columns* (`apps/web/components/ticket-board.tsx:2404`); it only looks stable because `finalizeDetail` is a pre-edit snapshot. Once finalized, the clerk's original figure is **permanently destroyed** and that line becomes wrong on any later open.

**Implied fix:** persist the clerk-submitted charge set separately from the consumer-facing final charges; `computeClerkEarnings` reads the clerk set. This is a schema change, not a display fix. Existing finalized tickets have already lost the original values — a backfill decision is needed.

---

## B. Currency — USD tickets are never converted

Also one root cause, several symptoms.

| # | Symptom | Where |
|---|---|---|
| B1 | `$35.00` due flows into the **`Amount (PKR)`** field as literal `35` | consumer pay page |
| B2 | Same ticket listed as **"Rs 35"** | staff `/tickets/unpaid` |
| B3 | Wallet chip renders **"$ -35.00"** | consumer dashboard |

**Target behaviour, stated by the client via the old portal (`app.wusuq.com`):** the consumer side stays in **USD** (`$35`), the **SuperAdmin/staff side shows converted PKR** (old portal showed `PKR 9,720` for the same ticket). Client's own arithmetic: 35 × 285 ≈ **9,975**.

> "International Client ki amount SuperAdmin ko converted PkR my aye gi."

**Root cause (verified):**
- `apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx:356` hardcodes `label="Amount (PKR)"` and prefills the USD figure.
- `ExchangeRate` (schema.prisma:752) and `CurrencyService.convert()` **exist but are dead code** — imported by nothing outside `currency.module.ts`. No rate is applied anywhere.
- Already-known related debt (CLAUDE.md): staff/admin boards hand-roll PKR formatting instead of `formatMoney(amount, currency)`.

**Open question for the client:** display-only conversion, or a persisted converted amount? And where does the rate come from (manual admin entry vs feed)? The old portal appears to snapshot a rate per ticket date — `CurrencyService` already has date-aware helpers written for exactly this.

---

## C. View vs download

- **C1** Case Files rows offer only Download/Delete — need **View**.
- **C2** "her jaga jahan download ka button hy wahan view ka button hona chahiye" — *everywhere there is a download button there should be a view button*; shown against the staff Document Repository Actions column.

Note: WS-B already shipped `<DocumentPreview>` (consumer ticket detail, My Documents, admin panel). This is extending that existing component to the remaining surfaces, not new work.

---

## D. Case Files page

- **D1** Richer metadata per group: **case title** and **judge name** (city + court already shown and fine).
- **D2** **Bulk delete** — "how to delete all?"
- **D3** "if client upload Case files for his record. how a superadmin will know?" — no notification/visibility when a consumer uploads.

## E. Drafts

- **E1** Draft cards expose only "Resume" — need a **Delete** action.

## F. Archived ticket lingers on dashboard

- **F1** A deleted (soft-archived) ticket is **gone from My Tickets but still in the consumer Dashboard "Recent activity"** (shown ASSIGNED, PKR 350). Wallet balance recalculated correctly. Two views disagree.
  - Likely cause (not yet traced): the dashboard's recent-activity query lacks the `archivedAt: null` filter that `findAll` applies.

## G. Wallet balance presentation

- **G1** "WALLET BALANCE PKR 0" beside "Outstanding: PKR 500" (and PKR 300 / Outstanding 350) marked confusing. Relates to the documented dynamic net-balance model — may be a labelling fix rather than a math fix.

## H. Profile / user data

- **H1** Consumer profile page has **no address field**, and phone shows **no country code**.
- **H2** Consumer-entered **province/district/city/address do not appear** in the admin Edit User form. (Pairs with H1 — likely one data-flow gap.)
- **H3** **Three phone formats** stored: `+923001998787`, `923001998787`, `3004680800`.
- **H4** Add-Representative phone input should use the **country picker (PK flag + 92)** like signup already does.
- **H5** *Question, not a defect:* "what about this message?" re the "Please complete your profile" banner.

## I. Manage Users

- **I1** The consumers list includes a **`representative`** ("Ahmad") — should be consumer-role only.

## J. Add Representative form

- **J1** District **Attock has only Lower + Special courts**, yet High Court / Federal Shariat / Supreme services are selectable. Service list should be constrained by what the selected city/district actually seats.
- **J2** **"Federal Constitutional Court" missing** from the service list.
- **J3** Payout details capture the EasyPaisa number but **not the account holder name**.

## K. Charge disclosure at intake

- **K1** The consumer must be told the shown figure is the **base only** — "these are our basic charges. photocopy and delivery charges will be added accordingly". Labelling it **"Total"** is misleading on a SPLIT flow.
- **K2** TCS delivery step shows only "Delivering to: Abbottabad" — **no street address**.

## L. Pay later

- **L1** "pay later not woking". The toast fires ("PKR 500 added to your wallet as due"), so the complaint is likely about the resulting state, not the click. **Needs clarification from the client** — the current behaviour is by design per CLAUDE.md.

## M. Hearings on the ticket card

- **M1** A COMPLETED ticket shows "Hearing 29 Jul 2026" inline, but the **"Next hearing" panel does not surface it** — should read "next date is 29-7-26, order now".
- **M2** Also show the **previous** hearing date.
- **M3** Also show **whether the client needs attested or non-attested** copies.

## N. Dispatch document labelling

- **N1** (video 1) The uploaded TCS/dispatch proof renders as a raw filename (`1784492263915-894636498.png`) under a generic "UPLOADED DOCUMENTS". Should be labelled as the TCS document.

---

## Not a client edit — security

The tail of the chat (today, 3:45 PM) contains **forwarded WordPress admin credentials for `wusuq.com` in plaintext** — username `admin` plus a password string, followed by the `wp-login.php` link — in a group chat with 6+ participants, now also captured in a screen recording. **Recommend rotating those credentials** and keeping the recordings out of version control.

---

## Sizing

- **A** and **B** are the substantial pieces: both are architectural (a schema change and a missing conversion layer respectively), and both touch money.
- **C, D, E, F, I, J, M, N** are contained UI/query fixes.
- **G, K, L, H5** need a clarifying question to the client before implementing.
