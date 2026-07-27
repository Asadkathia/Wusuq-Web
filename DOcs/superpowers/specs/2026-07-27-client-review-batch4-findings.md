# Client review batch 4 — findings (2026-07-27)

Sources (all 2026-07-26/27):
1. `WhatsApp Video 2026-07-26 at 15.35.20.mp4` — 2:06, Urdu voiceover. Clerk-earnings demo on Review & Complete.
2. `WhatsApp Video 2026-07-26 at 22.08.14.mp4` — 2:12, Urdu voiceover. Hearing dates + "delete didn't work".
3. `WhatsApp Video 2026-07-26 at 22.23.57.mp4` — 1:41, Urdu voiceover. "Order Future Tickets" for the consumer.
4. `Screen Recording 2026-07-27 at 9.07.27 PM.mov` — 27s, silent scroll of the "Wusuq dev" WhatsApp chat.

Method: whisper large-v3 (`-mc 0 -tp 0.4 -et 2.8` to avoid the repetition loop that hit batch 3) + 1 fps frame
extraction with parallel vision passes; 2 fps + crop for the chat scroll.

**Client's overall verdict, unprompted (chat, 7:52 PM):** *"All good to go, Alhamdulillah. Whatever small
issues there are, the system won't be blocked by them."* — these are polish items, not blockers, with the
two exceptions below.

---

## A. Clerk payout cap silently defeated — REGRESSION of the batch-3 fix ✅ FIXED

Video 1 + chat msg 6 (*"ye aik chota sa logic hy — clerk cost jo add krta hy or super admin jo cost add krta hy"*).

**Demonstrated on screen** (ticket `TKT-58520394-488577`, clerk Abbas Ali, clerk cost 400):

| Admin edits attested rate | Attested charges | "Clerk submitted" | **Abbas's earnings** | Wusuq earnings |
|---|---|---|---|---|
| 10/page (clerk's own) | PKR 100 | PKR 100 | **500** | 100 |
| 15/page | PKR 150 | PKR 100 | **550** ❌ | 100 |
| 20/page | PKR 200 | PKR 100 | **600** ❌ | 100 |

The clerk's earnings tracked the admin's markup exactly — the batch-3 rule ("an admin markup is Wusuq
margin, never clerk pay") was not in force.

**Root cause:** `computeClerkEarningsBreakdown` caps each phase-2 line at `min(clerkSubmitted, adminFinal)`
and treats an **absent** clerk value as "no clerk submission recorded" → falls back to the final column.
`TicketsService.findAll` never returned the four `clerk*Charges` snapshot columns, so on the admin
**Review & Complete dialog — which computes its preview from the LIST row** — they arrived `undefined`
and the cap silently no-opped. The shared formula was correct; the data never arrived.

Diagnostic tell: the *"Clerk submitted: PKR 100"* helper on the same screen reads `finalizeDetail`
(`findOne`, full row → correct) while the earnings line reads the list row (→ broken). Same dialog, two
sources, two answers.

Exactly the class the batch-3 review flagged for `fxRateToPkr` ("`findAll`/`finance.list` must return it
or the board fail-safes"). Same shape, different column.

**Fix:** return the four columns from `findAll`, inside the existing `pureConsumer` gate (staff **and** the
assigned rep see them — a clerk must see their own figures; consumers never do). Regression test
`findall-clerk-snapshot.spec.ts` reproduces the client's exact ticket; mutation-proven (removing the fix
fails 2 of 3).

**Scope of the damage:** display/decision-surface only. The clerk dashboard (`getClerkSummary` selects the
columns), `finance.clerkPayout` (full Prisma row) and `ticket-detail-panel` (`findOne`) were all correct —
so actual payout figures were right; the admin's *decision screen* lied.

---

## B. Deleted tickets still counted on the ADMIN dashboard ✅ FIXED

Video 2 + chat msg 16 (*"Ticket not being deleted from super admin side, but being deleted from consumer"*).

Client's words: *"Super admin deleted a ticket — on the consumer side it's fine, that got fixed. But the
super admin's doesn't go."* That is precisely accurate: batch-3 **F1** only fixed `getConsumerSummary`.

**Evidence on screen:** staff Dashboard shows TOTAL TICKETS 2 / COMPLETED 1 / REVENUE PKR 1,147 /
OUTSTANDING PKR 500, and "Click to triage" opens a panel that resolves to **"Ticket not found."** — the
aggregate counts a ticket the detail endpoint correctly treats as gone.

**Root cause:** deletion is a soft archive (`Ticket.archivedAt`, audit 4.2). **18** admin/staff ticket
queries in `dashboard.service.ts` had no `archivedAt: null` filter — `getRevenueKpis` had no `where`
clause at all. Only `getConsumerSummary` and `getClerkSummary` were filtered.

**Fix:** `archivedAt: null` on all 18 (`getRevenueKpis`, `getAgedOutstandingKpi`, `computeSummary`'s
totals/completed/range counts/`statusGroups` groupBy/`recentTickets`/`completedInRange`/`todayTickets`).
Tests extended; mutation-proven.

**Flagged, not fixed:** `assignment.groupBy` (Top Paralegals) and the `openCases` nested `tickets` select
still reference tickets through relation filters without an archive exclusion — an archived ticket can
still count toward a rep's completed tally. Needs a decision.

---

## C. "Order Future Tickets" — stale date, and missing where it matters ⬜ NOT FIXED

Videos 2 + 3. Two symptoms, one cause.

- Strip renders **"Next hearing 27 Jul 2026"** while the ticket's real next hearing is **2026-07-30**
  (video 2) / **2026-07-31** (video 3) — confirmed in both the consumer and staff detail drawers.
- The strip is **absent** on the ticket the client actually wants it on (`TKT-85905379-133644`), present
  on a different one.

**Root cause:** `consumer-ticket-board.tsx` gates and labels the strip from `payload.future_date` — the
date typed at **intake** — not `ticket.scheduledDate`, the clerk-recorded authoritative next hearing:

```ts
const futureDate = payload.future_date ?? '';
const isPendingFlow = payload.case_status === 'Pending Case' && futureDate !== '' && (…);
const showStrip = isPendingFlow;
```

So a blank `future_date` at intake ⇒ no strip, regardless of the real hearing date; and a stale
`future_date` ⇒ a stale label.

CLAUDE.md already records the correct rule from WS-B/B3: *"clerk-set `Ticket.scheduledDate` is
authoritative for 'next hearing' … dead `future_date`-as-payload-key fallback removed"*. That was applied
to `buildCaseView` (detail) — **the card strip was missed**.

**Proposed fix:** source both the gate and the label from `scheduledDate ?? payload.future_date`. Repairs
both symptoms at once. Changes *when* the CTA appears, so it wants a explicit sign-off.

**Related ask (video 3):** the client wants the consumer — not just the super admin — to initiate the next
order: *"how can the super admin order without asking him?"* The strip already links to
`?futureFromTicketId=…`; making it appear reliably is most of that ask.

---

## D. Previous hearing date is lost when the clerk updates ⬜ NOT FIXED

Video 2: *"the previous date got erased — the previous date should also show."*

`recordNextHearing` overwrites `Ticket.scheduledDate`; the prior value isn't retained. In video 2's detail
drawer the HEARINGS block shows only `Next: 2026-07-30` with **no Previous row at all**; in video 3 (a
ticket never clerk-updated) Previous correctly shows `2026-07-18` from `payload.case_date`.

Needs a decision: roll the old `scheduledDate` into a `previousHearingDate` column on update, vs. derive
history from `TicketStatusHistory`.

---

## E. Smaller items from the chat log

- **E1 — Wallet balance absent from the Super Admin dashboard** (msgs 8–10). A consumer's PKR 353 shows on
  the consumer wallet page and the staff `/wallet` list, but **not** on the Dashboard KPIs. Client:
  *"but not anywhere in SuperAdmin"*, then self-resolved: *"ok it's coming here at Wallet of super admin"*.
  Possibly a discoverability request for a Dashboard KPI tile rather than a bug.
- **E2 — "Next hearing" dashboard widget should be clickable** (msg 19): *"this is next hearing. fine. it
  should be clickable. so one can see ticket details."* Currently static text.
- **E3 — Consumer invoice discoverability** (msg 21): *"consumer invoice kahan sy download kry"*, answered
  in-chat with *"download from invoices"*. WS-B already shipped `GET /tickets/:id/invoice` + a Download
  button on the consumer ticket detail, and there is a consumer `/consumer/invoices` board — so this is
  discoverability, not a missing feature.
- **E4 — Future-dated ticket drove the wallet to −947** (msg 18). Matches the documented dynamic
  net-balance model (wallet goes negative when dues exist). Observation, not obviously a defect —
  **confirm with the client** whether he considers this wrong.
- **E5 — "Remove pickup"** (video 3). No "pickup" string exists in the UI; the only match is
  **Delivery → Method: Self Collection**, which he scrolls past as he says it. **Ambiguous — ask.**
- **E6 — Clerk fee vs reimbursed expenses** (video 1). He distinguishes Abbas's *earning* (400) from the
  *100 photocopy expense*, both currently summed under "earnings". Labelling question, not a math bug.

## Not code
- **Namecheap subscription expiring** + *"What ip location add on?"* (msgs 1–2) — operational/DNS. A
  parallel session was already doing routing/DNS work on this repo.
- **"Will you please clear all the tickets data"** (msg 3) — the origin of the clear-tickets request;
  `apps/api/clear-tickets.mjs` was prepared for this.
