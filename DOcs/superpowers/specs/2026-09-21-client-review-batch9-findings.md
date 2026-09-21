# Client review — batch 9 findings (19–21 Sep 2026)

Feedback on the **shipped batch-7/8 work**, plus the first **real mobile-device review**
this project has ever received. The client's verdict is positive — *"we are ready to go
live, the remaining changes can happen on the live system"* — so this is a punch list, not
a blocker list. Two items are money bugs and should not ship as-is.

## Sources

| # | Source | Duration | Author | Notes |
|---|---|---|---|---|
| C | `Screen Recording 2026-09-21 at 6.25.34 PM.mov` | 70 s, silent | us | Scroll of the "Wusuq dev" WhatsApp thread, 19 Sep 02:12 → 21 Sep |
| V1 | `WhatsApp Video 2026-09-19 at 15.36.59.mp4` | 1:20 | client (Wusuq 2) | Super Admin — Review & Complete, international vs local |
| V2 | `WhatsApp Video 2026-09-19 at 16.04.04.mp4` | 1:31 | client (Wusuq 2) | Super Admin — what survives a ticket delete |
| V3 | `WhatsApp Video 2026-09-19 at 23.28.01.mp4` | 1:37, **silent** | Ali Zain Cheema | **iPhone Safari**, USD consumer, full intake |
| V4 | `WhatsApp Video 2026-09-20 at 16.53.25.mp4` | 1:30, **silent** | Ali Zain Cheema | **iPhone Safari**, PKR consumer, full intake |

Method: native Urdu whisper large-v3 (`-mc 0 -tp 0.4 -et 2.8`) **before** any English pass;
dense frames read individually; every caption in the chat scroll read end-to-end.

> **V3 and V4 are the first phone recordings this project has received.** Batch-6 item E
> (mobile focus-zoom) was deferred for want of a device repro. It now has one — see §7.
> Both clips carry **no speech** (music only), so they are visual evidence only; the asks
> that go with them are the numbered list the client typed at 5:06 PM (§6).

---

## 1. 🔴 Regenerate carries the OLD set type's copy counts into the new ticket

**Thread, 19 Sep 02:24–02:42.** Client: *"i ordered a non attested copy. why attested is
appearing."* Screenshot shows `Set Type: Non Attested` and, two rows below,
`Attested Copies: 1`. He diagnosed it himself: *"because i regenerated it from an Attested
ticket form"*, then settled it: *"Jee bilkul, So it should be Non Attested only, As this is
New ticket."* Talha: *"@Muhammad Asad Please remove kar de."* 👍

**Two independent defects, both confirmed in code.**

**(a) `buildRegeneratePayload` is a full copy** (`apps/web/lib/regenerate-ticket.ts`) — every
payload key survives except `parent_ticket_id`. The set-type quantity keys are
`attested_qty` / `non_attested_qty` / `both_attested_qty` / `both_non_attested_qty`
(`intake-flows.ts:459-481`), each gated by `showWhen: { field: 'set_type', … }`. Changing
`set_type` on the regenerated ticket hides the old input but does **not** clear its value,
so the stale quantity is submitted.

**(b) `case-view.ts:60` renders `attested_qty` unconditionally** —
`{ keys: ['attested_qty'], label: 'Attested Copies' }` with no `set_type` check. Worse,
`non_attested_qty`, `both_attested_qty` and `both_non_attested_qty` are **absent from
`SUMMARY_FIELDS` entirely**, so a Non-Attested or Both order's copy count is displayed
nowhere at all — on any ticket, regenerated or not.

**Fix:** clear the quantity keys that don't match the chosen `set_type` when `set_type`
changes (not only on regenerate — the same staleness hits a user who switches set type
mid-wizard), and make the case card render the quantity that matches the set type.

## 2. 🔴 Regenerating into a DIFFERENT service keeps the old service's price

**Thread, 19 Sep 02:44.** Client: *"Also there are rates issue. If the current ticket Case
Files cost is 2000 & we regenerate it as Case Information and the cost is 350, Cost doesn't
change."*

This is the other half of batch-7 item 1.5. That item made Regenerate open at the **service
picker** so a consumer can order a different service on the same case. The price does not
follow the service change.

Needs a reproduction against the code path before a fix is written: `createIntakeTicket`
re-resolves through `buildPricingResolveInput`, so a genuinely re-submitted wizard should
re-price. The likely culprit is the regenerated draft carrying the source's
`select_service` / court-tier keys so the resolver is handed the OLD service. Treat §1(a)
and this as the same class: **a full payload copy across a changed choice.**

## 3. Representative charge dialog — the charge rows must be DYNAMIC

**Thread, 19 Sep 03:00–03:03**, with two annotated screenshots. Red ✗ on **Photocopy Pages**
and **Photocopy Cost Per Page**; green ✓ on Attested Pages / Attested Cost Per Page and
Non-Attested Pages / Non-Attested Cost Per Page.

Client: *"when client says Attested, it comes fine. when non attested it coms fine. but the
Red spots are useless. just to confuse"* → *"when order both Attested + Non Attested its
fine. but Red ones are useless."* → *"But these are useless. Rest is fine. Attested py
attested field a rahi hy, Non attested py non attested."* Talha (who notes the client asked
for them in the first place — *"ap ne add karwayi thi. They were not there initially"*):
**"Please remove kar de."** 👍

**OWNER DECISION (2026-09-21):** *"This functionality needs to be dynamic where depending on
the intake and service creation the rows need to appear accordingly. For attested copy
nothing related to non attested should show up, and vice versa for non attested copy."*

So this is **not** a field deletion — it is conditional rendering driven by what was actually
ordered.

**Root cause confirmed.** `clerkCostFields` (`ticket-board.tsx:551-567`) is a **flat,
unconditional array of 8 entries**. Every representative sees every charge row on every
ticket, regardless of flow or set type.

**The rule, derived from the two inputs the ticket already carries:**

| Input | Source | Gates |
|---|---|---|
| `chargeCapabilitiesFor(intakeFlow, currency)` | `@wusuq/shared` | `.attestation` → the attested/non-attested pairs · `.printing` → the Photocopy pair · `.delivery` → Delivery Charges |
| `formPayload.set_type` | intake | within an attestation-capable flow: `attested` → attested pair only · `non_attested` → non-attested pair only · `both` → both |

Applied, that yields:

- **Case Files** (`attestation: true`) → only the set-type-matching attested / non-attested
  pair(s).
- **The 3 non-judicial copy flows** (`attestation: false`) → the attested and non-attested
  pairs vanish entirely. This alone removes four of the rows the client called useless.
- **USD / digital flows** → nothing, already correct via `NO_CHARGES`.

⚠️ **One open question, and it is a money-model change — do not assume it.** A pure
capability gate still shows the **Photocopy** pair on Case Files, because
`SERVICE_CHARGE_CAPABILITIES.judicial_case_files` sets `printing: true` — and Case Files is
exactly where the client drew the red ✗. The coherent reading is that Case Files bills its
pages through the attested/non-attested counts, so photocopy is a redundant third counter
there and belongs only to the printing-only non-judicial flows. If the owner confirms that,
the correct fix is **flipping `judicial_case_files.printing` to `false` in
`SERVICE_CHARGE_CAPABILITIES`** — one line that propagates automatically to the dialog,
`finalizeRemainderCore` and `saveClerkCharges`.

**It must NOT be a UI-only hide.** A hidden input whose column stays writable is precisely
the defect in §4: `finance.updateCharge` would keep writing `printingCharges`, the consumer
would never be billed it, and `computeClerkEarningsBreakdown` would still pay the
representative for it. Whatever is hidden must also be zeroed by capability, on the server.

**Consequence of flipping it:** any existing Case-Files ticket carrying `printingCharges > 0`
has that line zeroed at its next finalize. Needs the owner's explicit sign-off before
building.

## 4. 🔴 Overseas (USD) tickets: the admin cannot add phase-2 charges — but CAN pay a representative for them

Two sides of the same asymmetry, reported by the client from one side and found in the code
from the other.

**What the client reported (V1, 3:36 PM + caption "international consumers ki Photocopies
cost nai add kr sakta Super Admin"):** *"I have two tickets to approve — one international,
one local. When I do Review & Complete on the international one I only get this, right?
Conditional cost, photocopies etc. — those costs don't come. Whereas for the local one
everything comes. … I can't apply rates for the international client, and I can apply rates
for the national client."* Confirmed on screen: the USD ticket's dialog offers only
Additional Service Cost / Additional Cost / Next hearing date and says *"No phase-2 charges
for this service"*; the PKR ticket's offers the full Attested / Non-Attested / Printing /
Delivery grid with the representative's submitted figures beside each.

**This is by design** — `chargeCapabilitiesFor(flow, 'USD')` returns `NO_CHARGES` because
USD is an all-inclusive flat price list, and `finalizeRemainderCore` correctly zeroes all
four charge columns for it. A product decision is needed, not a bug fix: either USD stays
flat (and the answer is "quote the higher flat rate"), or USD gains a phase-2 remainder,
which contradicts the whole USD pricing model.

**What is a genuine bug:** the same USD ticket's dialog showed
**"Representative cost 900 + Non-attested 700 + Delivery 500 = PKR 2,100"** against a
consumer total of PKR 7,125 (= $25 × 285) that billed **zero** phase-2 charges.
`computeClerkEarningsBreakdown` is currency-blind, and **`finance.updateCharge`
(`finance.service.ts:305-328`) has no `chargeCapabilitiesFor` gate at all** — an admin
editing charges on `/manage-cost/ticket-charges` writes `nonAttestedCharges` /
`deliveryCharges` straight onto a USD ticket, where they never reach the consumer's flat
total but **do** count toward representative pay. **Wusuq pays out for work it never
billed.** Same failure shape as batch-4 A and batch-5 A: a shared money rule enforced on
one surface and not its sibling.

Adjacent, confirmed while checking: **`saveClerkCharges` (`tickets.service.ts:3069-3076`)
is internally inconsistent** — when the capability is off it forces `attestedCharges` and
`nonAttestedCharges` to `0`, but passes `undefined` for `printingCharges` and
`deliveryCharges`. In Prisma, `undefined` means *leave unchanged*, not *zero*. Four sibling
fields, two behaviours, in one object literal.

## 5. Deleting a ticket leaves its money trail behind

**V2 + two captions, 19 Sep 4:04 PM.** *"after deleting. things that not being deleted."*
and *"invoices bi delete nai hoti"*.

Verified on screen after deleting all 5 tickets: every dashboard KPI reads 0 (Total Tickets,
Completed, Revenue, Outstanding, Total Business, Wusuq Profit, Representative Profit ✓),
and `/manage-users/<id>` shows *"No tickets yet"* — but underneath it the **Transaction
history still lists 5 rows** (Ticket debit −3,000 / −2,500 / −2,000 / −3,750, Ticket payment
−15,000), and **Invoices still lists 000003–000007**.

He explicitly **accepts** that the prepaid advance survives (*"the advance didn't get
deleted — that's fine, that's a good thing"*; Consumer Advance PKR 13,750 stands). His
question is narrower and fair: *"if his ticket itself has been deleted, then what happens to
his money?"*

**OWNER DECISION (2026-09-21): leave the ledger rows — no code change.** The archive
behaviour is correct as designed (audit 4.2: money rows survive, FKs stay intact). What the
client actually wants is for the **data to be cleared**, not for the functionality to change.

**That makes this an operational action, not a fix:** run
`apps/api/scripts/clear-ticket-data.ts` (dry-run by default; `--apply --reset-wallets` to
execute, which requires `ALLOW_DESTRUCTIVE_WIPE=true` and refuses under `NODE_ENV=production`).
⚠️ **This repo's `.env` points at the production Neon database**, and the script deletes the
entire money ledger — Payment, WalletTransaction, Invoice, InvoiceItem — in one transaction.
It needs an explicit go-ahead, and it has still never been run.

Also spotted on that screen and worth checking: the row **"Ticket payment −15,000"** renders
negative, yet the balance only reconciles (15,000 − 11,250 = 3,750 ✓) if it is a *credit*.
Either the sign or the label is wrong.

## 6. The client's own numbered list (20 Sep, 5:06 PM)

Sent with the representative's **Update ticket payments** dialog annotated: "PHONE" drawn
beside the Deliver-to address, "UPDATE" drawn beside the Record-next-hearing checkbox.

1. **"we need client Phone number with the address."** The dialog shows only the street
   address; the representative dispatching via TCS has no number to call.
2. **"No Next Hearing of the decided cases."** **RESOLVED by the owner (2026-09-21):**
   *"Next hearing will be only available for pending cases — decided cases are already closed
   and don't need a new hearing."* So the representative's **"Record next hearing date"**
   control must not render on a decided ticket.

   **Confirmed in code, and it is a clean fix.** `ticket-board.tsx:2315` carries the comment
   *"Clerk: optional next-hearing capture (PENDING tickets only)"* — but the guard beneath it
   is only `isClerk && costsTicket.status === 'IN_PROGRESS'`. **The comment documents the
   intended rule and the code never implemented it.** The helper already exists:
   `isPendingCase(ticket)` (`ticket-board.tsx:545`) reads `formPayload.case_status` and also
   excludes COMPLETED/DELIVERED. It has exactly one call site today (the card strip, line
   1630); this is its second. Add it to the guard.
3. **"Once clerk update the Pages and amount. it's no way back. so we need here an update
   button."** Once `submitClerkCosts` advances `IN_PROGRESS → WAITING_APPROVAL` the
   representative cannot correct a typo — only the admin's send-back reopens it. He wants an
   edit path before admin review.

## 7. Mobile (iPhone Safari) — first device review

### 7.1 🟠 Focus-zoom, reproduced — batch-6 item E can now be closed

Both clips show the page magnifying and clipping the moment any text field is focused
(city search in V3/V4, Case No and Judge name in V3). Root cause confirmed in source:
`inputClass` (`intake-wizard.tsx:2294`) sets **`sm:text-sm` with no base size**, so below
640 px the input inherits a sub-16px size, and there is **no `export const viewport`
anywhere in `apps/web/app`**. iOS Safari zooms any focused input under 16px.

**Fix:** base `text-base` (16px), `sm:text-sm` above 640px. **Do not** add
`maximum-scale=1` — it fixes the symptom by disabling pinch-zoom, which is an accessibility
regression.

### 7.2 🟠 Empty date fields are invisible on mobile

In V4 the Case Details block renders the labels *"Previous case date"* and *"Next hearing
date"* over what looks like blank space — no visible box, no placeholder — while the
sibling *"Enter case no"* field shows a normal bordered input with grey placeholder text.
`type="date"` inputs carry `ring-1 ring-inset ring-border-soft` but iOS renders **no
placeholder at all** when empty, and `placeholder:text-slate-400` cannot help a date input.
The user cannot see where to tap on a required field.

### 7.3 Set-type chip renders lowercase

Selected chips read **"attested"** / **"non attested"** while the picker offers "Attested" /
"Non Attested". Cosmetic, both flows.

### 7.4 Checkout shows a red "No pricing rule matched for this combination"

Seen in V3 at step 1→2, before Set Type and Required Documents were chosen. It resolves to a
correct `$25.00` once the wizard is complete, so it is an **intermediate** state — but it
reads as a hard error on a half-filled form. Suppress it until enough is entered to resolve.

### 7.5 Confirmed WORKING on mobile (no action)

Delivery city seeded from the consumer's profile and editable (batch-6 C) ✓ · street address
prefilled (WS-F B9) ✓ · USD flat checkout `$25.00`, no tax ✓ · USD tile gate (3 flows) ✓ ·
Lower-Court decided-case set type correctly offering only Attested / Both (the "Can't Get"
availability sentinel) ✓ · consumer "What's next?" + timeline cards, which the client and
Ali Zain both praised unprompted.

## 8. Representative's DELIVERED tickets are unreachable from the nav

**Thread, 20 Sep 2:40 AM**, screenshot circling both the KPI and the sidebar:
*"this is Representative. he delivered 2 tickets but not coming on LEFT BOX"* — the rep
dashboard tile reads **Delivered 2** while the left nav shows nothing.

Confirmed: **`buildClerkItems` (`nav.tsx:98-134`) has no Delivered entry at all** — not as a
nav item, not as a count. Its "Ready to Dispatch" item points at `/tickets/completed` with
the `COMPLETED` count, and a ticket that reaches `DELIVERED` leaves `COMPLETED`, so it
vanishes from the representative's navigation entirely. Their own finished work is
unreachable.

## 9. "Submissions to verify" KPI drills to the wrong page

**V1, ~0:51.** *"'Tickets awaiting approval' — if I click it, it goes exactly there;
it's checking correctly, it wasn't going before. And if I click 'Submissions to verify' it
brings me here — whereas it should have gone to the same place."*

So the batch-7 3.4 drill-down fix landed on one KPI and not its neighbour.

## 10. Not an app defect — flag to the owner

**21 Sep 8:00 PM**, Ali Zain: *"All my Godaddy emails deleted from my email. I think I've
been hacked, for GoDaddy"*, with GoDaddy one-time-support-code emails at 7:10 and 7:13 PM
and an account-recovery thread. **The domain registrar account for a platform about to go
live may be compromised.** Not code — but it gates the launch. Recommend registrar MFA + a
registrar-lock check before pointing DNS at production.

---

## Summary

| # | Item | Severity | Kind |
|---|---|---|---|
| 1 | Regenerate keeps the old set type's copy counts; case card never shows non-attested counts | 🔴 High | Bug, confirmed in code |
| 2 | Regenerate into a different service keeps the old price | 🔴 High | Bug, needs repro |
| 4 | USD ticket pays a representative for charges never billed (`updateCharge` ungated) | 🔴 High | Money bug, confirmed in code |
| 8 | Representative has no Delivered view or count | 🟠 Medium | Bug, confirmed in code |
| 7.1 | Mobile focus-zoom (closes batch-6 E) | 🟠 Medium | Bug, confirmed in code |
| 7.2 | Empty date fields invisible on mobile | 🟠 Medium | Bug |
| 9 | "Submissions to verify" KPI drills to the wrong page | 🟠 Medium | Bug |
| 3 | Charge rows must be dynamic per flow + set type | 🟠 Medium | Change — one open question on Case-Files printing |
| 6.1 | Consumer phone beside the delivery address | 🟢 Low | Change |
| 6.3 | Representative "update" path after submitting costs | 🟠 Medium | Change |
| 4b | `saveClerkCharges` zeroes 2 of 4 capability-gated columns, no-ops the other 2 | 🟢 Low | Bug, confirmed in code |
| 5 | Ledger rows + invoices survive a ticket delete | ✅ Closed | No code change — run the data wipe instead |
| 6.2 | Hide "Record next hearing date" on decided cases | 🟠 Medium | Bug — comment says PENDING-only, guard never checked |
| 7.3 | Set-type chip lowercase | 🟢 Low | Cosmetic |
| 7.4 | "No pricing rule matched" shown mid-wizard | 🟢 Low | Cosmetic |
| 10 | Possible GoDaddy account compromise | ⚠️ Ops | Not code |

**Client's own status: "Almost over. We are ready to go live. Baki changes live system my
hoti rahy gi in case."** Items 1, 2 and 4 are the ones worth holding for.

**Owner decisions folded in 2026-09-21:** §6.2 resolved (pending-only), §3 scoped as dynamic
rendering rather than deletion, §5 closed as a data-clear rather than a code change. The one
remaining question is whether Case Files should keep its Photocopy pair (§3).
