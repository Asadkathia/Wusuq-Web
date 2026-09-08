# Client review — batch 7 findings (2026-09-08)

Consolidated from every source the client sent for this round. **Nothing here is implemented yet** —
this is the grounded backlog.

## Sources

| # | Source | Notes |
|---|---|---|
| A | `Wusuq Edits 5-10-26.docx` (heading "8-30-26") | 11 annotated screenshots, 30 Aug session |
| B | `Wusuq Edits 5-10-26 (1).docx` (heading "Final") | 4 annotated screenshots, 5–8 Sep session |
| V1–V13 | 13 WhatsApp screen recordings with Urdu/English voiceover, 5 Sep (V1–V9) and 8 Sep (V10–V13), ~37 min total. **V-numbers are my own file ordering; the client's own captions are in "The client's ordering" below.** | Transcribed locally with whisper large-v3 (`-mc 0 -tp 0.4 -et 2.8`), both a native pass and an English-translation pass, then a frame-by-frame visual pass aligned to the transcript timestamps |
| V14 | `WhatsApp Video 2026-09-08 at 20.12.19.mp4` (1:45) | Second drop — the client's chat item **12** |
| C1 | `Screen Recording 2026-09-08 at 7.33.10 PM.mov` (52 s, no audio) | Scroll through the "Wusuq dev" WhatsApp thread — items 1–4 |
| C2 | `Screen Recording 2026-09-09 at 3.49.26 AM.mov` (50 s, no audio) | Second scroll of the same thread — items **8–12** plus two untagged asks |

## The client's ordering (verified)

**The WhatsApp filename timestamp IS the message send time**, and the duration WhatsApp prints on each
thumbnail fingerprints a file to its caption unambiguously. Both were used to pin every recording to
the caption the client actually typed — the captions below are quoted, not inferred.

He used **two different numbering schemes**, one per session.

### Session 1 — 5 Sep, "Step N": one ticket's full lifecycle, in order

| # | Client's caption | Sent | Dur | File |
|---|---|---|---|---|
| 1 | "step 1 / creating ticket" | 8:20 PM | 2:29 | `20.20.10` |
| 2 | "Step 2" | 8:46 PM | 2:06 | `20.46.16` |
| 3 | "Step 3" | 8:46 PM | 3:44 | `20.46.46` |
| 4 | **"Step 3 A"** | 8:47 PM | 1:55 | `20.47.10` |
| 5 | "Step 4" | 8:48 PM | 5:03 | `20.48.35` |
| 6 | "Step 5 / need to see on dashboard. 1- Total Business 2- Wusuq Profit. 3- Clerk Profit 4- Advance Amount from Consumers" | 8:52 PM | 1:32 | `20.52.03` |
| 7 | "Step 6 / Upload Document and / no invoice" | 9:08 PM | 2:33 | `21.08.02` |
| 8 | *(no step number)* "V good. super admin enters the next date after completing the ticket even." | 9:13 PM | 2:37 | `21.13.13` |
| 9 | **"Step 8 - Regenerate Ticket"** | 9:17 PM | 2:46 | `21.17.51` |

The sequence walks **one ticket** from consumer intake → assign → representative work → representative upload → admin
review & complete → dashboard → invoice → hearing date → regenerate. That is why several findings only
make sense read in order (e.g. 6.1: the document is uploaded in Step 3 A and is still missing for the
consumer in Step 4).

**There is no "Step 7"** — he jumps 6 → (the unnumbered "V good" clip) → 8. The unnumbered clip sits
exactly where Step 7 would be, so treat it as Step 7.

### Session 2 — 8 Sep, "N-": a numbered defect list, videos and screenshots mixed

| # | Client's caption | Sent | Dur | Source |
|---|---|---|---|---|
| 1- | "What if a client just order a ticket and never pay, never return back. We should either Delete the ticket or move to an immature ticket." | 2:49 PM | — | screenshot (doc B) |
| 2- | "Dashboard and finance and Immature tickets." | 3:02 PM | 1:48 | `15.02.34` |
| 3- | "Finance Issues on Super Admin and Consumer" | 3:13 PM | 3:29 | `15.13.13` |
| 4- | "Maybe later but we need to have data, how many people are register with us…" | 3:33 PM | — | screenshot (doc B) |
| — | "New ticket New User to check finance." | 3:39 PM | 2:59 | `15.39.32` |
| *(unnumbered — the slot where 5- would be)* | Add-Representative validation thread: "there should be a check on the 11 digits only / and remove from shadow / 0300 to 300" · "this has account name" / "this should also have account name in JAZZCASH & EASYPAISA" · "11 Digits only." · "it gave us the error later." · "it works in 9 digits too" | 3:44–3:49 PM | — | screenshots |
| 6- | "there should be only Consumers in Users and Representative on Representatives" | 7:13 PM | — | screenshot |
| 7- | "clerk accepts the ticket and process it." *(edited)* | 7:22 PM | 3:46 | `19.22.02` |
| 8- | "this is best / Clerk Earning is 900, Photocopy is 600 and delivery is 400. / please make such tabs. it will be easier for the clerk." *(edited)* | 7:29 PM | — | screenshot |
| — | "also add Graph just like super admin on Consumer and Representative side." | 7:29 PM | — | text |
| 9- | "please add here. / tcs receipt / Document By Representative / invoice" | 7:43 PM | — | screenshot |
| 10- | "i requested to add additional Service cost. it will add the cost at Basic Cost" | 7:49 PM | — | screenshot |
| 11- | "same as photocopy cost dont change…" | 7:54 PM | — | screenshot |
| — | "it is fine / i added another amount. but it was good with the clerk amount." | 7:56 PM | — | screenshot |
| — | "please jahan jahan download ya image hy wahan View must hona chahiye…" | 8:01 PM | — | screenshot |
| 12- | "after completion of ticket. More informative dashboard. / how to see Representative and Client from Super Admin" *(edited)* | 8:12 PM | — | `20.12.19` |

> **There is no item "5-".** He numbers 1–4, sends the Add-Representative validation thread
> unnumbered (3:44–3:49 PM), then resumes at 6-. Same skip as "Step 7" in session 1 — the content
> exists, the label does not. Nothing is missing.

The client's own written summary in the thread, verbatim:

- 7:30 PM — "Remove street address to House no. Town, Block"
- 7:33 PM — "Address Issue / y 2 typers of address. / Profile address or hy or ticket creating k time or." (*there are two kinds of address — the profile one and the one at ticket-creation time*)
- 8:52 PM — "please add Read All & Clear All"
- 8:52 PM — "need to see on dashboard. 1- Total Business 2- Wusuq Profit. 3- Clerk Profit 4- Advance Amount from Consumers"
- 9:01 PM — "Super Admin ko nai Show ho raha. kitna Representative ny lia - Kitna Advance hy. or kia profit hy"
- 2:49 PM — "What if a client just order a ticket and never pay, never return back. We should either Delete the ticket or move to an immature ticket."
- 3:33 PM — "Maybe later but we need to have data, how many people are register with us. How many lawyers how many non lawyers and how many companies today, this month this year. From which area and so on."

Second drop (source C2), verbatim:

- 7:29 PM — "please make each 'tabs' it will be easier for the clerk" *(edited)*
- 7:29 PM — "also add Graph just like super admin / on Consumer and Representative side."
- 7:43 PM — "9- please add here. / tcs receipt / Document By Representative / invoice"
- 7:49 PM — "10- i requested to add / additional Service cost. it will add the cost at Basic Cost" (annotated **ADD SERVICE COST**)
- 7:54 PM — "11- same as photocopy cost dont change / same as clerk added cost 300. super admin make it 300 / it will change for the consumer but not for the Clerk that added"
- 7:56 PM — "it is fine / i added another amount. but it was good with the clerk amount." *(confirming the cap works once a value is entered)*
- 8:01 PM — "please jahan jahan download ya image hy / wahan View must hona chahiye. and if can have thumbnail type. so can view easily."
- 8:12 PM — "12- after completion of ticket. More informative dashboard. / how to see Representative and Client from Super Admin" *(edited)*

> ⚠️ **The client's own items 5, 6 and 7 are not in either chat recording.** C1 stops after item 4
> (3:39 PM) and C2 starts at 7:29 PM; nothing between those two points was captured. Their content
> is most likely covered by V13 (7:22 PM, representative flow / TCS receipt) and the 5 Sep videos, but that is
> inference — **ask the client to re-send 5–7, or scroll the thread between 3:39 PM and 7:29 PM.**

---

## 1. Intake wizard

### 1.1 Required fields must come first — **(A, V1 0:25–1:06, V12 0:39–0:47)**
On Case Details the optional fields (Case Type, Case No, Year) render above the required ones
(Case Title\*, Judge Designation\*, Judge Name\*). Client, verbatim: *"I want to take the case title,
judge designation, and judge name above… take these three, those who are asterisk, up, and those who
are not necessary, take them down."* In V12 he repeats it for the Supreme Court flow: *"I requested
you to bring the red files to one side"* (the red-asterisk fields).

Two acceptable shapes, his words: either **reorder so required-first**, or **group them under
headings** ("Must fill" / "Optional") so the consumer can see at a glance what is mandatory. He
explicitly says reordering alone is fine for now.

### 1.2 Disclose the PDF surcharge at the point of choice — **(V1 1:21–1:42)**
"Want PDF before dispatch?" is a bare Yes/No. *"We are facing a problem that if we click on 'Yes'
then we will get more money [charged]. But we have to tell them that if we click on 'Yes' then we
will get 300 rupees [charged]."* Show the Rs 300 next to the option.

### 1.3 TCS delivery address — delete the two redundant sub-fields — **(A, V1 1:42–2:09, chat 7:30/7:33 PM)**
The client crossed out **Block / Sector / Street / Building / Floor Name** and **Main Area / Town /
Nearest Landmark** in the doc. The profile address already carries the whole line ("House 2121, Lake
City Block k, Raiwand Road, Lahore"), so those two boxes get filled with junk and the persisted
address renders as `House 2121, Lake City Block k, Raiwand Road, Lahore, 12, 12, Lahore` (visible on
the consumer ticket detail, V4 1:15). *"Now here you have to give these headings and take them in one
line."*

**They are also REQUIRED**: leaving them blank shows both boxes outlined in red with *"Please complete
the delivery address"* and blocks submit (visible in V12). That is why he types `12` / `12` — the form
forces junk into fields that duplicate the line above.

### 1.4 One address, not two — **(chat 7:30 & 7:33 PM)**
Root of 1.3. Today the address is captured twice: onboarding profile (free-text "Street address")
and again in the wizard's delivery step. Client wants the profile one to be the source, and its
single free-text line to become structured: **House no. / Town / Block** ("Remove street address to
House no. Town, Block"). The wizard should then show/confirm it rather than re-collect it.

> ⚠️ Note the direction: structure the **profile** address, simplify the **wizard** address to one
> line. These are not contradictory — they are the two halves of collapsing the duplicate.

### 1.5 Regenerate must let you change the SERVICE on the same case — **(V9 0:07–1:00 & 2:16–2:45, native)**
> ⚠️ **This reverses my first reading.** The English translation lost the sense; the Urdu is explicit.

*"In regenerate it says this is [Case] File… I requested that he wants, **on the same case**, to do a
Case File — or a Power of Attorney — so he doesn't have to **type things again and again**. He changes
his **service** and the rest stays the same. So if I hit regenerate, it should **not land straight on
Case File — it should ask which service you want**… instead of it coming to Case File, start it from
here [the service picker]."*

So Regenerate should open at the **service picker** with every case field pre-filled, letting the
consumer order a *different* service against the same case. Today it jumps straight into the source
flow. (Do **not** implement "skip the service question" — that is the opposite of the ask.)

### 1.5b `select_service` is dropped from the copied payload — **(A "Still this error")**
Separate defect, same area: an **Order Future Tickets** submit (`?futureFromTicketId=`) fails with
`Missing required payload field: select_service`. This is the batch-5 D1 item, finally legible.

### 1.6 Regenerate loses the delivery address — **(A "Regenerate ticket misses the Address")**
On a regenerated ticket the House / Flat field comes back blank (city survives). Same class as 1.5.

### 1.7 SPLIT-checkout wording on regenerate — **(V9 1:33–1:53)**
*"Please give a message here that instead of total cost, this is service cost. Tell me that the
charges of photocopy and TCS will be added accordingly."* The batch-3 K1 relabel ("Base amount" +
disclosure) evidently is not reaching the regenerate/second-submission checkout.

---

## 2. Money, wallet and payments

### 2.1 Payment receipt must be REQUIRED — **(A "This should be Must to upload. Payment receipt.", V5 4:04–4:24)**
Both the consumer **pay page** and the **Top up wallet** modal label the receipt
*"(optional, recommended)"*. Client: *"This should be a must fill. You can't do it without it."*

### 2.2 Wallet advance is not being applied to the new ticket — **(V9 2:16, V11 0:52–1:33)**
Consumer has PKR 900 credit; a new PKR 500 ticket is created and stays UNPAID with the credit
untouched. *"So this is regenerated. Why is the money not decreasing?"* In V11 he walks the same
arithmetic (bill 1100, paid 2000 → 900 credit; next ticket 500 → should leave 400) and then:
*"now see this in super admin, it is saying that the payment is waiting for the ticket, but it was
[already] cut from that."* Staff and consumer views disagree about whether the ticket is paid.

> This may be the documented behaviour (auto-settlement is FIFO **on completion**, and the consumer
> net balance is computed on read), but the client reads it as a defect twice, independently. It
> needs either a behaviour change (settle at creation when credit covers it) or the staff view must
> stop saying "awaiting payment" for a ticket already covered by credit.

### 2.3 Transaction history — for staff AND for the consumer — **(V11 1:33–3:29)**
*"I should also know the transaction history of this… customer, please give us his history, how he
made money [paid]."* The staff Wallet board lists Consumer Wallets with a balance and a TX count but
no drill-down into that consumer's transactions, and the super admin cannot see where the PKR 2,000
top-up went. The native audio asks for **both halves**: *"I should also get its transaction history…
and give the **customer** their history too, please — how they paid."*

### 2.4 Wallet verification rows show raw IDs, not names — **(V5 4:52–5:03)**
Pending Verifications renders `cmtoh5ai70004dv2ij5b3ou4y` in the USER & TX column.
*"You have given the number of the device, but why is the name not coming?"* Show the consumer's
name (and phone). Same for the "Initiate Topup → User ID" box, which should be a searchable picker.

### 2.5 Default representative cost — "save for future" — **(V2 0:55–1:16)**
On assign, the representative cost has to be typed every time. *"Where will the cost be edited from? …every
time I have to do this here — give a 'save for future' [option]."* i.e. persist a default representative cost
per service/court/tier so assign prefills it.

### 2.6 Paying the representative — **(V4 1:30–1:55)**
*"Now you can see the earning of this account. We will see how to send money to this account. Just
like we are sending money to the client, we will also send money to the [representative]."* There is a representative
**earnings** figure but no payout/settlement flow. The rep payout details (`payoutMethod`, bank,
JazzCash/EasyPaisa) already exist on `User` from WS-E — the missing piece is the disbursement record.

---

### 2.7 The admin delivery field defaults to 0 and silently wipes the representative's delivery pay — **(chat 7:49 & 7:54 & 7:56 PM, annotated "+DELIVERY")**
In Review & Complete the **Delivery Charges** input starts at **0** while the caption underneath reads
*"Clerk submitted: PKR 300"*. `computeClerkEarningsBreakdown` caps each phase-2 line at
`min(clerkSubmitted, adminFinal)`, so an admin who simply does not touch that box pays the representative
**0** for delivery — the screenshot shows earnings **PKR 1,600** (`Clerk cost 900 + Non-attested 700`)
with the delivery line missing entirely, and the client annotates it **"+ DELIVERY"**. The consumer
also isn't billed for it.

He then proves the intended behaviour in the very next screenshot: typing **400** gives earnings
**PKR 1,900** (`900 + 700 + Delivery 300` ✓ — the representative keeps his own 300, the consumer is billed
400) and comments *"it is fine — i added another amount, but it was good with the clerk amount."*

**So the cap logic is correct; the default is the bug.** Every admin phase-2 charge input should
**prefill with the representative-submitted value**, not 0. His own rule, verbatim: *"same as representative added cost
300, super admin make it [400] — it will change for the consumer but not for the Clerk that added."*

### 2.8 "Additional Service Cost" is missing from the admin final-charges dialog — **(chat 7:49 PM, item 10)**
The dialog exposes only **Additional Cost** ("separate line; not taxed"). The client wants the other
one too: *"i requested to add additional Service cost. it will add the cost at Basic Cost"* — i.e.
`additionalServiceCost`, which folds into the taxed service base. `computeTicketTotal` already
supports it and the labels shipped in WS-D2 C9 on `ticket-charges-board`; they never reached this
dialog.

## 3. Admin dashboard & finance

### 3.1 Four KPIs the super admin is missing — **(chat 8:52 & 9:01 PM, V6 entire, V11)**
Verbatim: *"need to see on dashboard. 1- Total Business 2- Wusuq Profit. 3- Clerk Profit 4- Advance
Amount from Consumers"* and *"Super Admin ko nai Show ho raha: kitna Representative ny lia — kitna Advance hy
— or kia profit hy."*

His own worked example (V6): one ticket, bill **1,100** → representative **800**, Wusuq **300**, consumer
advance on hand **900**. All four numbers exist per-ticket already (`computeClerkEarningsBreakdown`,
`computeWusuqMarginPkr`, wallet credit) — they are simply not aggregated on the dashboard.

### 3.2 KPI cards must drill down — **(V10 0:03–0:52)**
- **Total Tickets** navigates to `/tickets/pending`, which is not a real status route — the panel
  hangs on "Loading ticket…". (There is no `PENDING` ticket status.)
- **Total Revenue** — *"I am not able to find it yet… how to direct on revenue"*: no way to see what
  makes up the 1,100.
- **Outstanding PKR 500** — *"I click on it and it is not going anywhere."* He also wants to know
  **whose** it is: *"I can't tell whose outstanding this is"* (V10) and *"clicking it should open that
  ticket for me"* (V12).

### 3.3 Consumer name should be clickable from the ticket — **(V5 2:39–2:45)**
*"It has made me clickable so that if I want to go to his account, how can I go?"* — from a ticket
(and from finance rows) the admin wants to jump to that consumer's account/wallet.

### 3.4 Registration analytics — **(B, chat 3:33 PM)** — *client says "maybe later"*
*"We need to have data: how many people are registered with us. How many lawyers, how many
non-lawyers and how many companies — today, this month, this year. From which area and so on."*
`consumerKind` (LAWYER / NON_LAWYER / CORPORATE) and the geo fields are already persisted.

### 3.5 Deleting tickets must zero the derived counters — **(V10 1:17–1:46)**
*"If I delete this completed ticket, then all my clients should be zero-zero."* Batches 4 B, 5 B and
6 closed 20+ archive-exclusion sites; he is re-testing that, so re-verify after this batch's changes
(and note the **known open item**: 25 stale notifications from tickets archived *before* the batch-5
cleanup shipped still exist in the DB and need a one-off delete — 8 of them on the very ticket he
named).

---

### 3.6 Drill from Super Admin into a representative or a client — **(V14 1:23–1:45, chat item 12)**
*"If I want to see any representative, or if I want to go to any client — where do I go from, [and see] how
many tickets have been given?"* There is no per-representative or per-consumer page listing their
tickets, earnings and history. Overlaps 3.3 (clickable consumer name) and 2.3 (consumer wallet
history) — they are the same missing screen seen from three directions.

### 3.7 Profit is not visible on the finance board — **(V14 0:41–1:16)**
*"See here it has gone, but now it is outstanding. How much is my profit? How much is the profit of
the representative? I don't know what is the revenue from here, I don't know what is the outstanding from
here."* The finance rows show Total / Paid / Due / **Representative** per ticket but no **Wusuq** figure and
no totals row. `computeWusuqMarginPkr` exists (batch-5 A) and is only rendered in the ticket panel
and the finalize dialog.

### 3.8 Add the dashboard graph to the consumer and representative dashboards — **(chat 7:29 PM)**
*"also add Graph just like super admin on Consumer and Representative side."* Only the staff
dashboard has the Ticket Volume Trend chart.

### 3.9 Manage Users should list consumers only — **(chat item 6-, 7:13 PM)**
Verbatim: *"there should be only Consumers in Users and Representative on Representatives."* The
Manage Users table mixes a `representative` row in with the consumers, duplicating the dedicated
Representatives screen. He circled the `representative` row in red and the `consumer` rows in green.

## 4. Unpaid / abandoned tickets

### 4.1 "Immature ticket" state — **(B, chat 2:49 PM, V10 0:52–1:46)**
*"What if a client just orders a ticket and never pays, never returns back? We should either delete
the ticket or move it to an immature ticket."* / *"This ticket has been sent to me for 10 days and it
has not sent me any money… if I delete it, fine. Otherwise, if I make it immature, then maybe the
client will start it at some point."*

Wanted: a distinct bucket for aged-unpaid tickets so they stop polluting the live queues, without
destroying them. Soft-archive already exists (`Ticket.archivedAt`, audit 4.2) and could back this —
what is missing is the aging rule, the separate list, and the label.

---

## 5. Representative (representative) experience

### 5.1 Hide charge fields that do not apply to the ordered set type — **(V3 1:33–1:47, V13 1:15–1:42)**
The consumer ordered **non-attested**, yet the representative dialog shows Attested Pages + Attested Cost Per
Page too. *"He has asked for a non-attested file, so… it is not necessary to have these two options."*
And V13: *"if it is a non-attested file then it should be known as non-attested."*

### 5.2 The generic No. of Pages / Cost Per Page pair is confusing — **(V3 2:40–2:48, V13 1:15–1:32, V5 1:08–1:17)**
*"Now, this number of pages, cost per page, this and this, this is not required"* / *"it is showing
the number of pages and cost per page. I think this is extra… when it is complete then these two are
not clear to understand."* In the Review & Complete dialog he says the same about the admin side:
*"you have done this right, but in the representative's section you've crammed it quite a bit — please review
it once."* The printing pair duplicates the attested/non-attested pairs visually.

### 5.3 Show the delivery address in the representative cost dialog — **(V3 2:27–2:40)**
*"Please bring the delivery address here."* The representative enters delivery charges without seeing where it
is going.

### 5.4 TCS receipt must be enterable *after* cost submission — **(V13 2:15–3:34)**
The representative submits costs, then does the TCS run two hours later. *"Once he has done it, he will not
have the option to enter the TCS receipt… I can't even see the TCS Receipt."* Re-opening "Update
ticket payments" shows an **empty** form (his 100 pages × Rs 7 are not prefilled), so using it to add
the receipt risks wiping the submitted numbers. Wanted: a dedicated post-submission
receipt + tracking-number entry.

### 5.5 Add a delivery cost field to Mark Dispatched — **(A, image9)**
*"I uploaded the file when [I] wrote [the] tracking number. Also add cost here."*

### 5.6 "Representative" should be called "Representative" everywhere — **(A)**
Verbatim: *"Representative name should be replaced by Representative."* Terminology only — the role is already
`representative` internally; **the UI still says "clerk" everywhere** — Assign to clerk, Send back to
clerk, Clerk cost, Clerk submitted, Clerk profit, "No clerk receipt on file", the clerk dashboard.
He also says it himself mid-demo in V3: *"this clerk — you have to make it **representative**; and
here, make it the **representative's** cost."* Note some strings already comply (the consumer timeline
says "Representative assigned"), so this is a sweep, not a rewrite.

### 5.7 Assign button on the ticket detail — **(V2 0:28–0:55)**
*"If you want to give him the button of assign here, then give it. Otherwise it's okay."* Low
priority, explicitly optional.

---

### 5.8 Break the representative's "Pending earnings" figure into its parts — **(chat item 8-, 7:29 PM)**
Verbatim: *"this is best. Clerk Earning is 900, Photocopy is 600 and delivery is 400. please make such
tabs. it will be easier for the clerk."* The screenshot is the **representative dashboard**, where
**PENDING EARNINGS PKR 1,900** is a single opaque number; he annotates it **COPY 600**,
**DELIVERY 400** and an arrow to **900**. So the ask is an itemised breakdown of that KPI — representative cost
/ photocopy / delivery — not tabs in the charge-entry dialog.

`computeClerkEarningsBreakdown` already returns exactly these line items; the representative dashboard renders
only `.total`. (Note: the earnings **detail** was wired up in the 2026-07-22 representative-payout work; this
is the dashboard KPI, which was not.)

### 5.9 Add-Representative phone validation is wrong in four ways — **(chat 3:44–3:49 PM, the unnumbered "5-" slot)**
All on `/manage-users/representatives` → Add Representative:
1. **No length check** — `3001234567889998` is accepted into Phone with a `+92` dial code selected.
   *"there should be a check on the 11 digits only."*
2. **Placeholder still shows the leading zero** — *"remove from shadow 0300 to 300"*. Same defect as
   10.1 on the consumer signup form; fix both.
3. **The error only fires on submit, and names the wrong field** — pasting a long JazzCash number
   surfaces *"phone must be shorter than or equal to 16 characters"* **under the JazzCash box**.
   *"it gave us the error later."* Validate inline, and attribute the message to the field it belongs
   to.
4. **Too-short numbers pass** — *"it works in 9 digits too"*; the saved list shows `+9230012345` and
   `3001122222`. The `@MaxLength(16)` from WS-G B6 caps the top end only; there is no lower bound and
   no PK-specific rule on this form (consumer signup has `PK_PHONE_REGEX`; Add-Rep does not).

### 5.10 Payout details need an account name for JazzCash and EasyPaisa — **(chat 3:46 PM)**
*"this has account name"* (Bank Transfer → Account Title) *"…this should also have account name in
JAZZCASH & EASYPAISA"*. Those two methods expose only a number field. `User` already carries
`payoutBankName`/`accountTitle`/`accountNumber`/`jazzCash`/`easyPaisa` — an account-title field for
the wallet methods is missing.

## 6. Documents & deliverables

### 6.1 The deliverable does not reach the consumer *before* completion — **(A "Where is new document?", V4 0:10–1:30, V5 2:02–2:22)**
The most repeated complaint of the first drop. The representative uploads a Deliverable PDF; the consumer gets
a **"New document — TKT-…"** notification; clicking it opens the ticket detail and there is no
document anywhere. *"If I click on it, it is showing this but it is not showing anything here… the
one it has uploaded has not come anywhere."* From the admin side: *"instead of showing this to super
admin, take it there [to the consumer]."*

> **Refined by V14 (second drop):** on a **COMPLETED** ticket the Documents block *does* now render
> for the consumer, with per-row view + download ("Final document", "Supporting document"). So the
> gap is **state-scoped**: the notification fires while the ticket is still `WAITING_APPROVAL`, and
> the consumer document gate (`visibleToConsumer` + `status ∈ {COMPLETED, DELIVERED}`, WS-B B1/B2)
> hides it until the admin approves. Either hold the notification until it is actually visible, or
> let the deliverable through earlier. Do not "fix" this by loosening the gate blindly — that gate is
> the WS-B redaction rule.

### 6.2 The courier/TCS receipt should be consumer-visible — **(A, image9)**
*"…and this should be automatically visible to consumer."* Today `dispatchProofUrl` is uploaded as a
`WORK_DOCUMENT` with `visibleToConsumer: false` and is stripped by `redactTicketForConsumer`.

### 6.3 Documents need a human title — **(V5 1:56–2:02, V7 0:24–0:49)**
The Review & Complete dialog lists `1788622198159-231181454.jpeg`. *"This is the view button. I don't
know which document it is."* / *"How will the user know which case document this is? You can also
give the document a title so that the user can know which case document this is."*

### 6.4 "My Files" vs "Case Files" is confusing — **(V7 1:11–2:30)**
*"These are my files and these are the case files. I don't know what the difference is. I am
confused."* He also states the intent for one of them: *"upload the documents you have so that you
can save it against this ticket — we will take monthly money from it"* (a paid document-storage
idea). Needs a product decision before any code.

---

### 6.5 Name each document by its role, and put the invoice beside them — **(V14 0:14–0:41, chat item 9)**
On the completed ticket the consumer sees "Final document" and "Supporting document" — but one of
them *is* the TCS receipt and is not labelled as such. *"This is the final document, and this is the
supportive document, this is the TCS document… show it here that this is your document of TCS…
third is obviously generate invoice."* So: a **TCS document** label (the tag already exists on the
admin side), and the **invoice** listed as a third entry in the same block.

### 6.6 A View control (and a thumbnail) wherever there is a download — **(chat 8:01 PM)**
Verbatim: *"please jahan jahan download ya image hy, wahan View must hona chahiye. and if can have
thumbnail type. so can view easily."* The `DocumentPreview` component from WS-B exists and is wired
into three surfaces; the admin Review & Complete "Uploaded documents" list (which he annotated) still
offers download only. Apply the rule everywhere a document or image is listed.

## 7. Invoices

### 7.1 Download Invoice on the consumer ticket — **(A "Download Invoice.", V2 0:00–0:28, V7 0:00–0:24, V9 t105, V12 2:00)**
Raised four separate times. The consumer ticket detail shows **Pay now / Pay later / Regenerate** and
no invoice button. *"It has been completed. I need a download invoice here, because I am not able to
see its invoice anywhere."* The endpoint exists (`GET /tickets/:id/invoice`, WS-B C14) and the button
shipped in WS-C — it is evidently missing on the UNPAID and regenerated states he is looking at.

The native audio makes the scope explicit: *"add Download Invoice **here too, and behind it too, and
here too** — and when it goes into **My Tickets**, there are two buttons there, Pay now / Pay later /
Regenerate — add Download Invoice **there too**"* (V2), and *"he should be able to download the
invoice **wherever he wants**"* (V12). Treat it as: every surface where a ticket is shown.

### 7.2 "No invoices yet" on a completed, payment-due ticket — **(A "Case completed payment due but no invoice.")**
`/consumer/invoices` is empty because an `Invoice` is only created when an admin deliberately issues
one (`POST /invoices`, `finance.write`, super-admin only). The client expects an invoice to exist for
a completed ticket. Product decision: auto-issue on completion, or make the per-ticket receipt the
thing that is surfaced there. (Same as the batch-5 C item — re-reported, so it should stop being
deferred.)

### 7.3 Download Invoice from the staff ticket list — **(V10 0:16–0:20)**
*"I just need the power to download the invoice."* The Completed row offers *Generate invoice* but no
download.

---

### 7.4 Put TCS receipt / representative document / invoice on the consumer ticket CARD — **(chat 7:43 PM, item 9)**
Verbatim: *"9- please add here: tcs receipt / Document By Representative / invoice"*, hand-drawn as three
buttons **TCS · DOC · INVOICE** on the My Tickets card row next to Pay now / Regenerate / Pay later,
with an arrow from the "New document" notification. He wants them reachable from the **list**, not
only after opening the detail drawer. Same three artefacts as 6.5 — one on the card, one in the
detail.

## 8. Notifications

### 8.1 "Read all" / "Clear all" on the consumer notification panel — **(B, chat 8:52 PM)**
Verbatim: *"please add Read All & Clear All."* The staff panel has "Mark all read"; the consumer one
has neither.

### 8.2 The payment-pending notification lands on the wrong page — **(A image5)**
*"When [I] enter this notification, [it] comes not to the desired page. To verify payment."* The
admin's **"Ticket payment pending — a payment of PKR 600 … needs review"** notification opens the
ticket detail; it should open the payment-verification screen (Finance / Wallet reconcile).

### 8.3 The "New document" notification must deep-link to the document — **(A image7)**
See 6.1.

### 8.4 Notify the consumer when an admin edits a completed ticket — **(V8 0:46–1:02)**
*"In a completed ticket, if super admin edits it, will [the consumer] receive a notification or not?
Because it should be received. This is our system. It should be there."*

---

## 9. Hearings

### 9.1 Flag pending cases with no next hearing date — **(V8 0:00–0:45)**
*"The representative has forgotten to enter the next date of the case. Is there any pending case? …put [it]
that we should always know the next date of the pending case."* Wanted: a "Pending" marker on the
ticket rows/detail (as already exists on the case card) **and** a check that surfaces pending cases
whose next hearing date is missing.

### 9.2 Recurring reminder to the representative to record the next date — **(V8 2:11–2:36)**
*"We need a notification again and again so that the representative also knows that the next date has to be
announced. The next date of every pending case has to be announced."*

### 9.3 Editing the hearing date on a completed ticket works — **confirmed good, no action**
*"Okay, you did a good job. Now he knows about the next hearing… This is very good."*

---

## 10. Signup

### 10.1 Remove the leading zero from the mobile placeholder — **(B "Remove the Zero")**
With `+92` already shown as the prefix, the placeholder reads `03001234567`. Should be `3001234567`
(the composed number must not become `+9203…`).

---

## 11. Found only in the second verification pass

The first pass leaned on the English translation and a sparse frame sample. Re-running every video's
**native Urdu** transcript and building a 20-frame contact sheet per video surfaced these.

### 11.1 🔴 The staff Wallet board hard-crashes — **(V11 3:15–3:29)**
Scrolling the **Consumer Wallets** list on `/wallet` white-screens with
*"Application error: a client-side exception has occurred while loading wusuq-web.vercel.app."*
The video ends on that screen, and his closing line is *"please look at the finances."* Same family as
the `coerceErrorMessage()` white-screen fixed in the 2026-07-23 rate-board work — a render-time throw
on unexpected data. Note the list also renders rows like `Taimoor $0.00 (rate not set)`, so mixed
currency / null FX is the first thing to check.

**This is the only outright crash in the batch and nothing else in the list matters if finance won't
open.**

### 11.2 The representative cannot see what they will earn until AFTER accepting — **(V13 0:29–0:33)**
*"Here he doesn't come to know — **this is his money**."* The Accept/Reject screen shows Service
Details only; the `PKR 900` cost line appears on the ticket detail only once the assignment is
accepted. They are asked to commit before seeing the fee.

### 11.3 Accepting should move the representative into their Assigned list — **(V13 0:43–0:54)**
*"When he accepts, it should **automatically take him into Assigned** — please look at this too."*

### 11.4 Mirror the representative's earnings tiles onto the admin side — **(V13 0:00–0:20)**
*"Earned how much, pending how much, this month how much… these kinds of things should be taken over
to the **Super Admin** side as well."* The reciprocal of 3.8 (graph → consumer/representative).

### 11.5 The next hearing date cannot be recorded at finalize — **(V3 3:06–3:37)**
The representative submitted without recording it (*"he did not record the next hearing"*), and the
admin then finds: *"In the finalized ticket can I do something else — **next date of hearing** — after
he's done it once, I can't… yes, I can't."* So when the representative leaves it blank there is no
path to add it at review time. This is the concrete gap behind 9.1/9.2 — and note he confirms in V8
that editing a **completed** ticket *does* work, so it is the finalize step specifically.

### 11.6 "Final payment due" could also offer the wallet route — **(V5 3:57–4:11)**
*"Clicking Final payment due brings us here — or let it take him to **My Wallet** [to top up], then he
makes the final payment."* Minor routing nicety, not a defect.

## Cross-cutting note

Two items in this batch are **re-reports of things previously shipped or deferred**, which is the
same signal batch 4 gave: a fix that landed on one surface but not its sibling.

- **7.1 Download Invoice** — shipped in WS-C on the consumer card and detail, but absent on the
  states the client actually looks at (UNPAID, freshly regenerated).
- **7.2 / 1.5** — batch-5 C and D1, both deferred for want of a reproduction. Both now have one:
  D1's error text is `Missing required payload field: select_service`.
- **2.8** — the two-cost labels shipped in WS-D2 C9 on `ticket-charges-board.tsx` and the finalize
  dialog, but the finalize dialog only ever got **Additional Cost**, not **Additional Service Cost**.
- **6.6** — `DocumentPreview` shipped in WS-B on three surfaces; the admin uploaded-documents list
  was not one of them.
- **6.1** — fixed for `COMPLETED` tickets, still broken for the pre-approval state the notification
  actually fires in.
- **5.8** — `computeClerkEarningsBreakdown` already returns the itemised lines; the representative **dashboard**
  KPI renders only `.total`. The detail view got the breakdown in the 2026-07-22 representative-payout work and
  the dashboard did not.
- **5.9** — WS-G B6 added `@MaxLength(16)` and a PK regex to consumer signup; the Add-Representative
  form got the max-length only, so it still accepts 9-digit numbers and shows a `0300…` placeholder.

Before implementing anything here, check every surface that consumes the same data, not just the one
in the screenshot.

## Open / needs the client

- **1.4** — confirm the intended end state for addresses: is the profile address the single source,
  with the wizard read-only, or should the wizard still allow a per-ticket override? (Batch 6 C
  deliberately made the delivery city editable and consumer-owned; do not silently undo that.)
- **2.2** — behaviour decision: settle from wallet credit at ticket creation, or keep FIFO-on-
  completion and fix only the staff wording.
- **4.1** — the aging threshold for "immature" (he said "10 days" as an example, not a rule), and
  whether it is automatic or a manual admin action.
- **6.4** — what "My Files" and "Case Files" should each be, and whether the paid monthly storage
  idea is in scope.
- **7.2** — auto-issue an invoice on completion, or surface the per-ticket receipt instead.
