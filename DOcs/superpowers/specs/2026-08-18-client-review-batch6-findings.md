# Client review — batch 6 findings (2026-08-18)

**Sources.** 6 WhatsApp videos + 2 voice notes + a screen recording of the "Wusuq dev" chat log,
covering 11 Aug → 18 Aug. Transcribed with local whisper large-v3 (`-mc 0 -tp 0.4 -et 2.8`);
1 fps frame extraction (552 frames) with a visual pass. Chat-log scroll used to pair each voice
note with the video it refers to.

| Ref | File | Client's caption | Length |
|---|---|---|---|
| v1 | Video 08-11 13:27 | "active tickets" | 0:54 |
| v2 | Video 08-11 14:18 | "Delivery Address issue" | 0:58 |
| v3 | Video 08-16 14:38 | "FIR form to be edited." | 2:59 |
| v4 | Video 08-16 14:45 | "FIR and Criminal Search Difference — please Discuss" | 1:35 |
| v5 + a1 | Video/Audio 08-16 23:35 / 23:36 | "Aik bar zara mobile sy ticket banana" | 1:20 + 0:46 |
| v6 + a2 | Video/Audio 08-18 14:22 / 14:24 | (mobile zoom demo) | 0:17 + 0:37 |

Two items in the chat log carry no video and are business-critical — see **F**.

---

## A — Consumer dashboard "Active tickets" count contradicts My Tickets

**Grounded.** Same consumer (Ali Zain Cheema), same session, 4 tickets:

- `/consumer/my-tickets` tabs: **All 4 · Active 3 · Completed 1 · Unpaid 1**
- `/consumer/dashboard` KPI: **ACTIVE TICKETS 1** ("4 total" underneath), COMPLETED 1

Client: *"He has four total tickets. Three are active and one is completed… but on his dashboard,
active tickets total four are coming, active one is coming. See why this is happening."*

**Root cause — two different definitions of "active" on two screens the consumer compares
side by side.**

- `dashboard.service.ts` `getConsumerSummary` counts `status IN ('ASSIGNED','IN_PROGRESS')`
- `consumer-ticket-board.tsx` Active tab means `NOT (COMPLETED | DELIVERED)`

Neither is "wrong" in isolation; they simply disagree, and the consumer sees both.

**Fix:** align the dashboard KPI with the My Tickets tab definition (an UNPAID or PAID ticket
is plainly "active" to a consumer — work is outstanding). Same class as batch-5 A/B: one
concept, two implementations. Worth grepping for any third definition before fixing.

---

## B — "Next hearing" widget doesn't say which ticket, and isn't clickable

**Grounded.** Dashboard shows `Next hearing / Wed, 12 Aug / 05:00 / Lower Court Paralegal Service`.
The service *name* is not an identifier — this consumer has four Lower Court tickets.

Client: *"We don't know which case has next date of hearing. If you want to see it or not,
please click on it."*

**This was already flagged as open in batch 4** ("clickable dashboard next-hearing widget") and
has now been re-reported, so it should stop being deferred.

**Fix:** show the batch no / case no, and link the widget to that ticket's detail. Also check the
stray `05:00` — we don't capture hearing *times*, so rendering one is misleading.

---

## C — TCS delivery goes to the COURT's city, not the consumer's ⚠️ reverses a prior decision

**Grounded, and it corrects my batch-5 E2 guess.** In batch 5 I deferred this for lack of a repro
and noted the profile prefill "reads correct on inspection". The prefill *is* correct — that was
never the bug.

Consumer picked **Islamabad High Court**. The intake shows:

- **"Delivering to": `Islamabad`** — greyed, read-only
- **House / Flat: `213 R-1 Johar Town Lahore`** — correctly prefilled from `User.address`

So the parcel is addressed to a Lahore street **in Islamabad**.

Client: *"We are delivering him to Lahore, not Islamabad. Islamabad is a court. Look at his
profile — after looking at his profile we have written his address here. It should be District
Lahore… the address is here but it should not be Islamabad."*

**This contradicts a documented owner decision.** CLAUDE.md records: *"TCS delivery city is pinned
to the case city (read-only in the renderer) and re-stamped at every save/submit by
`withDerivedYear` so it can't go stale → misdelivery."* That rule was introduced **to prevent**
misdelivery; in practice it causes it, because the court's city has no relationship to where the
customer lives.

**Do not flip this silently — it needs the owner's explicit sign-off.** My recommendation: derive
"Delivering to" from the consumer's own address (profile city), keep it **editable** (people ship
to offices, relatives, other cities), and drop the re-stamping for the delivery city specifically.
The anti-staleness re-stamp should stay for genuinely case-derived fields.

---

## D — FIR / Criminal Record intake needs restructuring (the largest ask)

Client's framing (v4): a customer *"just wants to check his criminal record from Punjab. He
doesn't know anything about the FIR, or the police station, or the court."* Today that customer
cannot get through the form.

**D1 — Ask the branching question FIRST.** "What are you looking for? — *I have an FIR number* /
*Search criminal records by CNIC*" currently sits at the **bottom** of a long step, after
province/district/city pickers. Client: *"As soon as we select the city, we can ask for FIR or
Criminal Record. According to that, we can open the next form. If it is like this, then it is
best."*

**D2 — Police station must not be required on the criminal-record branch.** Step 2 of 5 renders
"FIR details — Select the police station handling the FIR" with **Police station\*** required. A
criminal-record customer has no thana to give.

**D3 — The "Registry / deed location" block leaks into the Copy-of-FIR flow.** The FIR intake
renders `Office: Sub Registrar` + `City type: City / Sadar / Unknown` — that belongs to the
Registry/Deed service. Client: *"we will finish this Registry Deed from here"* (i.e. remove it).

**D4 — Redundant location pickers.** Client: *"delete city and [Sadar] as well because everything
is on top of it"* — the district/city selection is duplicated further down the step.

**D5 — Missing fields on the FIR branch.** Step 2 collects FIR No, Year, Offence, Case Title. The
client wants **complainant name** and **accused name** too, and said *"I will send you the field
now"* — **the field list has not arrived yet.** Blocked on him.

---

## E — Mobile: focus-zoom and Enter-to-advance

**a1** (about v5, our app on iOS): *"This is absolutely fine, the view is good, and the zoom in /
zoom out that used to happen is not happening now… but I think there is still a zoom or focus
issue. The functionality is fine — but the way you type, when you press Enter, it should go to the
next line."*

**a2 + v6:** v6 is **not our app** — it is `dsj.punjab.gov.pk` (the Punjab government DSJ portal),
which he recorded as a reference for the behaviour he means.

Two distinct asks:

1. **Focus-zoom on input tap.** The classic cause is iOS Safari zooming when a focused input's
   font-size is < 16px. Our shared `Input` component gets this right (`text-base sm:text-sm`), but
   the **intake wizard's `BASE_CLASS` sets only `sm:text-sm` with no base size**, so its inputs
   fall back to inherited size — fine if the ancestor is 16px, a zoom trigger if anything above
   sets `text-sm`. There is also **no `viewport` export** in `app/`. This is a *hypothesis* from
   source; it needs a real-device / emulated check before I change anything.
2. **Enter should advance to the next field**, rather than doing nothing (or submitting).

The earlier horizontal-overflow fix has clearly held — the mobile frames show a clean layout, and
he confirms the old zoom problem is gone.

---

## F — ⚠️ Overseas clients on Pakistani numbers are billed the domestic rate (no video — chat only)

From the chat log, 18 Aug:

> *"One of Major issue im facing is Pakistani Number & Clients are overseas"*
> *"500 is for National Clients / 2000 for International Clients / So 1500 per order loss"*

**This is a direct revenue leak, and it is a consequence of a rule we designed deliberately.**
`deriveCurrency({phone, country})` in `@wusuq/shared` is **phone-first**: `+92` → PKR, everything
else → USD. An overseas customer who keeps their Pakistani mobile is therefore billed in PKR at
the domestic rate. His figures put the loss at **Rs 1,500 per order**.

Compounding it: currency **locks once the account is active** (any non-archived ticket or wallet
balance), so these accounts cannot self-correct later.

This needs a product decision before any code — the options differ a lot in effort and blast
radius:

1. **Country field wins over dial code** at signup (ask "where are you located?" and mean it).
   Cheapest, but self-declared.
2. **Staff-side override** — let an admin set a user's currency even when active, audited.
   Narrow, safe, and immediately unblocks the accounts already mispriced.
3. **Per-ticket currency** rather than per-user — biggest change; touches the whole money model.

(2) is worth doing regardless, because there are already-mispriced accounts that (1) alone will
never fix.

---

## Status

| Ref | Item | Ready to build? |
|---|---|---|
| A | Dashboard active-count mismatch | Yes |
| B | Next-hearing widget: identify + link | Yes |
| C | TCS delivery city | **Needs owner sign-off — reverses a prior decision** |
| D1–D4 | FIR/Criminal-record restructure | Yes |
| D5 | Complainant / accused fields | **Blocked — client owes the field list** |
| E | Mobile focus-zoom + Enter-to-advance | Needs a device/emulated repro first |
| F | Overseas clients on PK numbers | **Needs a product decision (1/2/3 above)** |
