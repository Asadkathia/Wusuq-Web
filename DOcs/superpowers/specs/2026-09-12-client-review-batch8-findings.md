# Client review — batch 8 findings (2026-09-12)

Feedback on the **shipped batch-7 work**. Every item below is a defect in or a gap left by that
batch — this is a regression/verification round, not new scope.

## Sources

| # | Source | Notes |
|---|---|---|
| V1 | `WhatsApp Video 2026-09-12 at 19.46.52.mp4` (1:00) | Consumer side (Ali Zain Cheema) — wallet vs. pay page |
| V2 | `WhatsApp Video 2026-09-12 at 19.55.25.mp4` (2:02) | Super Admin — the new batch-7 KPI row + wallet board |
| — | `Screen Recording 2026-09-08 at 7.33.10 PM copy.mov` | **Byte-identical to batch-7 source C1** (same MD5, 52.675 s). Recorded 8 Sep, so it carries NO 12 Sep chat content. |

Transcribed with whisper large-v3 (`-mc 0 -tp 0.4 -et 2.8`), **native Urdu pass first** then the
English translation — the batch-7 lesson that the `-tr` pass is lossy on intent. Plus a 20-frame
contact sheet per video.

> ⚠️ **There is no chat scroll for 12 Sep.** The supplied screen recording is a duplicate of the
> 8 Sep one. So these two videos carry **no captions and no item numbers** — unlike batch 7, where
> the client's own numbering drove the backlog. If he wrote anything alongside these clips, it has
> not been shared. **Ask for the thread from 12 Sep.**

---

## 1. 🔴 Representative Profit counts tickets assigned to nobody

**His words (V2):** *"یہ خودبخود ریپریزنٹیٹو کو چلا گیا — 100 روپیز۔ میں نے تو کسی کو اسائن بھی نہیں
کیا! … یہ 100 روپیز کہاں چلا گیا؟"* — "PKR 100 has gone to a representative automatically. I haven't
assigned anyone! Where did this 100 rupees go?"

**Reproduced live, same amount, still present today:**

```
TKT-23917476-635409 | assignments: 0 | wantPdf: true | base: 0  pdfFee: 100 => counted: 100
TKT-23904077-227676 | assignments: 1 | wantPdf: false| base: 400 pdfFee: 0   => counted: 900
TKT-39616730-553644 | assignments: 1 | wantPdf: false| base: 800 pdfFee: 0   => counted: 1250
```

**Root cause.** `getBusinessKpis` (batch-7 3.1) reduces `computeClerkEarningsBreakdown` over
`where: { archivedAt: null }` — **every** non-archived ticket, with no assignment check. A ticket
nobody is working on still contributes `PDF_CLERK_FEE` (= exactly PKR 100) whenever the consumer
bought a PDF, because the PDF cut is unconditional in the breakdown.

**Knock-on:** `wusuqProfit = totalBusiness − representativeProfit`, so Wusuq Profit is
**understated by the same 100**.

**Fix:** only count tickets that actually have an ACTIVE assignment.

> ⚠️ My first diagnosis — that `defaultClerkCost` was leaking in — was **wrong**, and checking it
> exposed a *second* defect (item 2). Verify before reporting.

## 2. The `?? 0` coercion defeats the `defaultClerkCost` fallback

Not client-reported; found while disproving the above.

`getBusinessKpis` passes `clerkCost: Number(t.clerkCost ?? 0)`. The shared function branches on
`t.clerkCost != null ? clerkCost : defaultClerkCost` — and `0 != null` is **true**, so the fallback
never fires. An ASSIGNED ticket whose `clerkCost` was never set reports a base of **0** instead of
the rule's `defaultClerkCost`, **under-reporting** representative pay.

This is the exact coercion CLAUDE.md already warns about for this function
(*"never coerce that null to 0 before the cap"*). Pass `null` through.

> ⚠️ **CORRECTION (pre-push review).** I originally wrote here that
> "`finance.service.ts`'s `clerkPayoutFor` gets it right". **It does not** — it passes
> `clerkCost: toNumber(ticket.clerkCost)` (i.e. `Number(null ?? 0)` = 0) and never passes
> `defaultClerkCost` **at all**, so the same fallback could never fire there either. The two
> surfaces disagreed about the same ticket. Both are fixed; see §10.

## 3. Representative Profit has no per-representative breakdown

**His words (V2):** *"اگر میں یہاں کلک کروں تو یہاں سارے یہ کلرک آ رہے ہیں۔ اب مجھے کیسے پتا چلے گا
کہ یہ پیسے کس کو گئے ہیں؟"* — "If I click here I just get all the representatives. How will I know
WHO the money went to?"

The KPI links to `/manage-users/representatives`, which carries only payout **method/bank** fields —
**no earnings or owed column at all** (verified: the board's only money fields are
`payoutMethod`/`payoutBankName`/`payoutAccountTitle`/`payoutAccountNumber`/`payoutJazzCash`/`payoutEasyPaisa`).

**Fix:** an owed/earned column per representative, or a drill-down that splits the total by person.
Their individual figures already exist — `/manage-users/[id]` (batch-7 3.6) shows a representative's
tickets and payouts; the total simply isn't decomposed anywhere.

## 4. Consumer Wallets should sort by balance, not by signup date

**His words (V2):** *"یہ پتہ نہیں کس کیٹیگری سے آ رہے ہیں۔ جس نے پیسے بھیجے ہیں وہ ٹاپ پہ آ جائیں …
پانچ ہزار اس نے بھیجا … یہ سب سے نیچے آ رہا ہے، اس کو اوپر بھیجیں۔"* — "I don't know what order these
are in. Whoever has sent money should come to the top. He sent 5,000 and he's at the very bottom."

`WalletService.list` uses `orderBy: { createdAt: 'desc' }`. Every zero-balance account outranks the
consumers who actually hold credit. **Fix:** order by `walletBalance` descending.

## 5. The pay page can't spend the wallet balance — and the net balance reads as a deduction

**His words (V1):** *"میرے پاس 5,000 بیلنس تھا … میں نے چیک باکس کو نہیں کلک کیا، لیکن یہاں سے پیسے
مائنس ہو گئے … اب سپوز یہ ان پیڈ ٹکٹ ہے، میں اس کو ابھی pay کرتا ہوں — تو یہاں کہے نا کہ والٹ سے نکال
لو۔ اب پھر مجھے دوبارہ پیسے جمع کروانے پڑیں گے؟ … تو پھر کہاں سے حساب ہو رہا ہے؟"*

**The money was NOT deducted.** Verified against the live DB:

```
Ali Zain Cheema | stored credit: 5000
  transactions: [{ TOPUP 5000 VERIFIED }]        <- no TICKET_DEBIT
  open tickets: [{ TKT-23917476-635409 UNPAID total 1100 paid 0 }]
```

The batch-7 opt-in worked exactly as intended — he did not tick the box, and nothing was spent. What
he saw is the **documented net balance**: `net = credit − dues` = 5,000 − 1,100 = **PKR 3,900**, the
figure on screen.

**But the complaint is still right, in two parts:**

1. **The net balance is indistinguishable from a deduction.** The hero reads "PKR 3,900" and he
   concluded his money had been taken. It needs to read as *5,000 credit, 1,100 committed* rather
   than as one reduced number.
2. **The pay page offers no way to pay from the wallet.** Batch-7 2.2 put the "use my wallet balance"
   choice on the *intake checkout* only. For an **already-created unpaid ticket** — which is the
   normal case here — `/consumer/tickets/[id]/pay` shows only Bank transfer / JazzCash / Easypaisa
   and a **required** payment receipt (batch-7 2.1). So a consumer holding PKR 5,000 is told to
   deposit PKR 1,100 again and upload proof of it. That is exactly what he means by
   *"then I'd have to deposit money again — so where is the accounting happening?"*

**Fix:** offer "Pay from wallet balance (PKR 5,000 available)" on the pay page whenever credit
covers the amount due, and make the receipt requirement conditional on actually paying externally.

## 6. The staff account page renders "(rate not set)" for every USD consumer

Not client-reported; visible on screen in V2 and a defect in batch-7's own new page.

`/manage-users/[id]` shows **BILLED `$15.00 (rate not set)` · PAID `$15.00 (rate not set)` ·
OUTSTANDING `$0.00 (rate not set)`**. `UserAccountBoard` calls `formatStaffMoney(billed, currency)`
with **no `fxRateToPkr`**, and a wallet has no single stamped rate by design (credit accrues across
many top-ups). It also sums mixed-currency ticket totals raw.

**Fix:** aggregate via `sumMixedCurrencyToPkr` using each ticket's own stamped rate and surface
`unconvertedCount`, the contract every other multi-ticket aggregate already follows.

---

## Summary

| # | Item | Severity | Source |
|---|---|---|---|
| 1 | Representative Profit counts unassigned tickets (PKR 100) | 🔴 wrong money on the owner's dashboard | client |
| 2 | `?? 0` defeats the `defaultClerkCost` fallback | under-reports payout | found here |
| 3 | No per-representative breakdown of the total | client can't act on the number | client |
| 4 | Consumer Wallets sorted by signup, not balance | usability | client |
| 5 | Pay page can't spend wallet credit; net balance reads as a deduction | 🔴 blocks a real payment path | client |
| 6 | Account page shows "(rate not set)" for USD consumers | wrong on a new page | found here |

**Nothing here is new scope.** Items 1, 2, 5 and 6 are defects introduced or left by batch 7;
3 and 4 are gaps in batch-7 features. **Ask the client for the 12 Sep chat thread** — these clips
arrived without the captions that carried his numbering in every previous round.

---

## 7. International clients — the standing batch-6 F item, re-examined

Not in the 12 Sep videos. Added because the live audit run for item 6 turned up both a
**correction to the batch-6 diagnosis** and a **new defect**.

### 7.1 The batch-6 F fix direction was wrong — "country over dial code" is a no-op

Batch 6 left this open: *overseas clients on Pakistani numbers are billed the domestic rate*
(client: "500 national / 2000 international / 1500 per order loss"), with three candidate fixes,
the first being "country-over-dial-code at signup".

That fix cannot work. `/consumer/signup` has **one** country field, and it is the **dial-code
source** as well as the stored `country`:

```tsx
<FormField label="Country" required><CountryPicker value={countryCode} … /></FormField>
…
const dial = findCountry(countryCode).dial;      // same field drives the phone prefix
return digits.startsWith(dial) ? `+${digits}` : `+${dial}${digits}`;
```

So `country` and the phone's dial code **can never disagree at signup**. Preferring one over the
other changes nothing. A Pakistani expat in Toronto must pick "Pakistan" to enter their +92
number, and is then billed PKR — there is no way to express *"I live in Canada, my phone is
Pakistani."* The missing input is **residence**, which the form never asks for.

### 7.2 Nobody is mispriced today — it is a latent leak, not a live one

Audited all 65 consumer-class users against the production DB:

```
country / currency        users
  (null) / PKR              16
  (null) / USD               2
  AE     / USD               1
  CA     / USD               1
  PK     / PKR              45

PKR users whose country is NOT PK:  none
```

Zero mispriced rows — exactly because the form cannot produce the divergence. The client's
per-order loss is real but has not yet materialised in this database. That also means **there is
nothing to repair right now**, so a residence field can ship before any backfill is needed.

### 7.3 When it does happen it is unrepairable through the UI

`User.currency` locks once the account is active (`ticketCount > 0 || walletBalance !== 0`), and
**`UpdateUserDto` has no `currency` field** — verified, no staff override exists anywhere. So a
mispriced account that has placed one ticket is permanently PKR. Of the three batch-6 options,
**the audited staff override is the one worth building regardless**: it is the only one that can
fix an account after the fact.

### 7.4 🔴 NEW — "Consumer Advance" silently omits every USD wallet

`getBusinessKpis` aggregates the advance KPI with `where: { role: {...}, currency: 'PKR' }`. Its
own comment says non-PKR wallets are *"counted separately rather than summed in raw"* — **but no
such count is implemented**: the return type is `{ totalBusiness, wusuqProfit,
representativeProfit, consumerAdvance, unconvertedCount }`, and that `unconvertedCount` is the
**ticket** count from `sumMixedCurrencyToPkr`, not a wallet count.

Live impact: `canada` holds **$35** and `Dubai` holds **$50** — **$85 of real prepaid credit** is
invisible on the owner's dashboard with no exclusion marker at all. Every other mixed-currency
aggregate in this codebase surfaces `unconvertedCount` ("N excluded — FX rate not set"); this one
silently drops the rows.

Excluding them from a PKR total is correct (a wallet has no stamped rate — credit accrues across
many top-ups). **Counting them is the missing half.** Return a non-PKR wallet count and render it,
honouring the exclude-and-count contract.

### 7.5 Item 6 is sharper than reported — the page contradicts itself

The audit shows the USD ticket **does** carry a stamped rate:

```
TKT-23904077-227676 | USD 15 | fx=285 | canada (CA)
exchange rate configured: USD→PKR 285
```

So on `/manage-users/[id]` the **ticket row** (line 218) passes `t.fxRateToPkr` and renders
**PKR 4,275** correctly, while the **summary cards directly above it** (lines 181/191/192/193) omit
the argument and read **`$15.00 (rate not set)`** — on the same screen, from the same data. Purely
a missing argument at four call sites, plus the raw mixed-currency sum behind `billed`/`paid`/`due`.

### 7.6 What is actually healthy

Worth stating so it is not re-investigated: the USD→PKR rate **is** configured (285), there are
**72 USD pricing rules** live, the USD ticket is properly rate-stamped at intake, and
`getBusinessKpis` converts `totalBusiness`/`wusuqProfit`/`representativeProfit` correctly over a
single convertible set (the batch-5 A cross-currency defect did **not** recur here). The
international breakage is confined to 7.4, 7.5 and the signup gap in 7.1.

### Summary — international clients

| # | Item | Severity | Status |
|---|---|---|---|
| 7.1 | Signup cannot express residence ≠ phone country | revenue leak, latent | batch-6 F, still open; **fix direction corrected** |
| 7.3 | No staff currency override; currency locks once active | unrepairable accounts | batch-6 F, still open |
| 7.4 | Consumer Advance drops USD wallets with no marker ($85 live) | 🔴 wrong money on the owner's dashboard | **new, found here** |
| 7.5 | Account page cards omit the FX rate the ticket row uses | wrong on a new page | = item 6, sharpened |

---

## 8. Second verification pass (2026-09-14) — one MISS, one MISTRANSLATION, two corrections

The first pass worked from a **single 20-frame contact sheet per video** — one frame per 6 s on the
2:02 clip. Re-ran it properly: full native-Urdu transcripts re-read line by line, plus frames at
**3 s intervals viewed individually at 1280 px** (41 frames for V2, 20 for V1). That found a
client-reported item I had missed entirely, a mistranslation that hid half of another, and two
recommendations that were wrong because the thing I proposed building already exists.

### 8.1 🔴 MISSED — the staff Wallet board lists representatives and the super admin

His first sentence about that screen is *"یہ پتہ نہیں **کس کیٹیگری** سے آ رہے ہیں"* — **"I don't know
what CATEGORY these are coming from."** I rendered that as "I don't know what order these are in"
and folded it into the sort-order item. **کیٹیگری means category, not order.** It is a separate
complaint, and it is correct:

```ts
// WalletService.list
const userWhere = query.search ? { OR: [...] } : {};
this.prisma.user.findMany({ where: userWhere, orderBy: { createdAt: 'desc' }, … })
```

**No role filter at all.** Under a heading that says *Consumer* Wallets, the board lists every user:

```
consumer         65
representative   16
super_admin       1
TOTAL            82      →  17 rows that are not consumers
```

Frame-verified: row 2 of the board is **"Supreme Court ISB"**, which the Representatives page three
frames earlier lists as a representative. "Islamabad HC", "Islamabad LC" and "Zahid" are on both
screens too.

This is **batch-7 item `6-` again** ("Manage Users should list consumers only — representatives
belong on the Representatives page"), which was fixed on Manage Users and not on the Wallet board.
The same check-every-surface failure this file already documents twice.

**Fix:** scope `WalletService.list` to consumer-class roles, as `getBusinessKpis` already does
(`role: { in: ['consumer','lawyer','company'] }`).

### 8.2 Item 4 was only half the ask

Item 4 (sort by balance) stands — frame-verified, **Ali Zain Cheema, PKR 5,000, sits near the
bottom** because of `createdAt: 'desc'`. But it is the *second* half of his sentence. Both halves
ship together or the screen is still wrong.

⚠️ One caveat on the sort I should have flagged: `orderBy: { walletBalance: 'desc' }` compares
**raw numbers across currencies** — USD 50 would rank below PKR 5,000 on magnitude alone, and a
wallet has no stamped FX rate to convert with. Correct here by luck, wrong in principle. Sort
within currency, or sort raw and keep the currency label visible.

### 8.3 Item 5 — the breakdown I proposed building **already exists**

I wrote: *"It needs to read as 5,000 credit, 1,100 committed rather than as one reduced number."*
Frame 4 of V1 shows `/consumer/my-wallet` already renders exactly that:

```
CURRENT BALANCE
PKR 3,900
[ PKR 1,100 owed · PKR 5,000 credit ]
Funds are used automatically to settle new tickets on completion.
```

So the data is present. The real problems are narrower and different:

1. **Hierarchy** — 3,900 is set huge, the breakdown is a small chip underneath, and the **topbar
   chip shows `PKR 3,900` with no breakdown at all**. The topbar is where he saw it first.
2. **🔴 The helper copy contradicts the batch-7 opt-in.** `consumer-wallet-board.tsx:142` promises
   *"Funds are used automatically to settle new tickets on completion"*, while
   `intake-wizard.tsx:2996` makes it an explicit **"Use my wallet balance"** checkbox. Strictly the
   sentence describes FIFO-settlement-on-completion rather than settle-at-creation, but a consumer
   cannot be expected to parse that distinction — it tells him his funds are spent automatically,
   which is precisely the belief he formed. **Fix the copy alongside the opt-in.**

Item 5's second half — **no "pay from wallet" on the pay page** — is fully confirmed by frames
15/19: `Amount due now PKR 1,100`, methods Bank transfer / JazzCash / Easypaisa only, **Payment
receipt \* required**, and the topbar showing `PKR 3,900` the whole time.

### 8.4 Item 6 — half of it is by design, and I should have said so

`WalletService.list` carries an explicit comment: a wallet has **no** per-wallet FX rate (credit
accrues over many top-ups, so no single rate applies), so non-PKR balances deliberately render
`$35.00 (rate not set)` rather than silently implying PKR. That reasoning is sound, and it applies
equally to the **credit chip** in the account-page header.

What is **not** covered by it: `BILLED` / `PAID` / `OUTSTANDING` on `/manage-users/[id]` are
**ticket** aggregates, and tickets *do* carry a stamped rate. Frame 35 proves it on one screen —
the three cards read `$15.00 (rate not set)` while the ticket row directly beneath them reads
**`PKR 4,275`** from `fxRateToPkr = 285`. So item 6 is specifically those three cards (and their
raw mixed-currency sums), not the "(rate not set)" marker in general.

### 8.5 Nothing else in either video

Everything narrated is now accounted for. The opening 0:00–0:20 of V2 is him *reading* the KPI row
(Total Business / Revenue / Outstanding), not complaining; the KPI drill-downs now resolve to real
routes (`/tickets/all`, `/tickets/completed`, `/finance`, `/wallet` — the batch-7 `/tickets/pending`
dead link is gone); and the garbled 1:39–1:59 window is him on the `canada` account page reading
"15 billed" before closing with *"this 100 rupees — where did it go, please look into it."* He does
**not** remark on "(rate not set)" at any point, so items 6 and 7.4 remain found-here, not
client-reported.

### Revised summary

| # | Item | Severity | Source |
|---|---|---|---|
| 1 | Representative Profit counts unassigned tickets (PKR 100) | 🔴 | client |
| 2 | `?? 0` defeats the `defaultClerkCost` fallback | high | found here |
| 3 | No per-representative breakdown | medium | client |
| 4 | Wallet board sorted by signup, not balance | medium | client |
| **4b** | **Wallet board lists 17 representatives/admins as "consumers"** | **medium** | **client — missed on pass 1** |
| 5 | Pay page cannot spend wallet credit | 🔴 | client |
| **5b** | **Wallet copy promises automatic settlement, contradicting the opt-in** | **medium** | **found on pass 2** |
| 6 | Account page's 3 ticket cards drop the stamped FX rate | medium | found here |
| 7.4 | Consumer Advance silently omits USD wallets ($85) | 🔴 | found here |
| 7.1/7.3 | Signup cannot express residence; no currency override | latent | batch-6 F |

---

## 9. Final deep pass — the screen recording, extracted in full (2026-09-14)

Re-extracted `Screen Recording …7.33.10 PM copy.mov` at **1 fps (53 frames, 3024×1964)** and read
**every caption**, rather than the single contact sheet used before.

> Note: the filename carries a **U+202F narrow no-break space** before "PM". A literal ASCII space
> makes `ls`/`ffmpeg` report "No such file or directory" on a file that plainly exists — glob it.

### 9.1 It is a duplicate, and it carries no 12 Sep content

MD5 `286a70f8e152d1307cc7d68cb6d5b4a3` — identical to `Screen Recording …7.33.10 PM.mov`, the
batch-7 source. The newest message in it is **7:34 PM on 8 Sep**. There is still **no 12 Sep chat
scroll**, so the two 12 Sep videos remain uncaptioned and unnumbered.

### 9.2 Complete item inventory (every screenshot + caption in the scroll)

| Time | Item | Content |
|---|---|---|
| 7:22 PM (5 Sep) | — | Signup screenshot, arrow on the mobile field: placeholder `03001234567` beside a `+92` chip |
| 7:30 PM | — | "Remove street address to House no. Town, Block" |
| 7:33 PM | — | "Address Issue / y 2 typers of address. Profile address or … ticket creating k time or." |
| 8:46/8:47 PM | Step 3, Step 3 A | Clerk upload documents |
| 8:52 PM | — | "please add **Read All & Clear All**" (notifications) |
| 8:58 PM | — | Wallet math 1100/2000/900 — *"All good"* … *"but"* |
| 9:01 PM | — | "**Super Admin ko nai Show ho raha.** kitna Clerk ny lia – Kitna Advance hy. or kia profit hy" |
| 9:08 PM | Step 6 | "Upload Document and **no invoice**" |
| 9:13 PM | — | "V good. super admin enters the next date after completing the ticket even." |
| 9:17 PM | Step 8 | Regenerate Ticket |
| 2:49 PM (8 Sep) | **1-** | "…never pay, never return back. We should either Delete the ticket or move to an **immature ticket**" |
| 3:02 PM | **2-** | "Dashboard and finance and Immature tickets." |
| 3:13 PM | **3-** | "Finance Issues on Super Admin and Consumer" |
| 3:33 PM | **4-** | Registration stats — "how many lawyers, non-lawyers, companies… today, this month, this year. From which area" |
| 3:44–3:49 PM | (unnumbered) | Add-Rep phone: "check on the **11 digits only**", "remove from shadow **0300 to 300**", "it gave us the error later" (*phone must be shorter than or equal to 16 characters*, rendered **under the JazzCash box**), "**it works in 9 digits too**" |
| 3:46 PM | (unnumbered) | "this has account name" / "**this should also have account name in JAZZCASH & EASYPAISA**" |
| 7:13 PM | **6-** | "there should be only **Consumers in Users** and **Representative on Representatives**" |
| 7:22 PM | **7-** | "clerk accepts the ticket and process it." |
| 7:29 PM | **8-** | "Clerk Earning is 900, Photocopy is 600 and delivery is 400. please make such **tabs**" + "also add **Graph** just like super admin on **Consumer and Representative** side" |

**Confirmed: there is no item `5-`.** He goes 4- (3:33 PM) → the unnumbered Add-Rep thread
(3:43–3:49 PM) → 6- (7:13 PM). Items 9-–12- are in the *other* recording
(`…2026-09-09 at 3.49.26 AM.mov`), not this one. Batch 7's reading was right.

### 9.3 Verified against current code — what is genuinely done

✅ `phonePlaceholder('PK') === '3001234567'` (no trunk zero), pinned by a test ·
✅ `PK_LOCAL_PHONE_REGEX = /^3\d{9}$/` rejects the 9-digit case ·
✅ Add-Rep form now validates the phone at all (`validateLocalPhone`, line 374) ·
✅ structured House/Town/Block address · ✅ Read All & Clear All · ✅ the four super-admin KPIs ·
✅ immature bucket · ✅ `getRegistrationStats()` · ✅ Account Title field added to JazzCash/EasyPaisa ·
✅ item 8-: `pendingBreakdown` rendered as Representative cost / Attested / Non-attested / Photocopy /
Delivery / PDF, **and** `TicketTrendCard` on both the consumer (page.tsx:529) and representative
(page.tsx:661) dashboards.

### 9.4 🔴 NEW — batch-7 5.10 is half-landed: the payout Account Title is wiped

`handlePayoutMethodChange` predates 5.10 and clears the title for every non-bank method:

```ts
payoutAccountTitle: method === 'BANK_TRANSFER' ? c.payoutAccountTitle : '',
```

Batch-7 5.10 then added an **Account Title** input to the `JAZZ_CASH` *and* `EASY_PAISA` branches,
reusing that same state key. So selecting or changing the method blanks the field those branches
exist to collect. Editing an existing JazzCash representative loads the stored title (line 314),
then touching the method dropdown destroys it on screen. On update the write is
`form.payoutAccountTitle || undefined`, so Prisma ignores the blank and the stored value survives —
but the admin can never see or correct it, and **create** sends the empty string outright.

**Fix:** keep `payoutAccountTitle` across BANK_TRANSFER / JAZZ_CASH / EASY_PAISA; clear only the
rail-specific number fields. Exactly the coupled-half miss this file keeps documenting.

### 9.5 The phone error still renders under the payout box

His complaint had two halves: the length error *fires only on submit*, and it *renders under the
JazzCash box while naming "phone"*. Batch 7 fixed the first (client-side `validateLocalPhone`) and
the message accuracy, but `formError` is still the single block at the **bottom of the form**
(line 836), below the payout fields — so it still appears under the JazzCash box. Minor, but it is
the half he actually pointed at. Render the message next to the phone input.

---

## FINAL consolidated list — 11 items

| # | Item | Severity | Source |
|---|---|---|---|
| 1 | Representative Profit counts unassigned tickets (PKR 100) | 🔴 | client V2 |
| 2 | `?? 0` defeats the `defaultClerkCost` fallback in the KPI | high | found |
| 3 | Representative Profit has no per-representative breakdown | medium | client V2 |
| 4 | Wallet board sorted by signup, not balance | medium | client V2 |
| 4b | Wallet board lists 16 reps + super admin as "consumers" (item 6- leak) | medium | client V2 |
| 5 | Pay page cannot spend wallet credit | 🔴 | client V1 |
| 5b | Wallet copy promises automatic settlement, contradicting the opt-in | medium | found |
| 6 | Account page's 3 ticket cards drop the stamped FX rate | medium | found |
| 7 | Consumer Advance silently omits USD wallets ($85 live) | 🔴 | found |
| 8 | Payout Account Title wiped for JazzCash/EasyPaisa (5.10 half-landed) | medium | found |
| 9 | Phone length error renders under the payout box, not the phone field | low | client (residual) |

Plus the two standing batch-6 F items (signup cannot express residence; no staff currency override),
which are latent rather than live — no account is mispriced today.

---

## 10. Pre-push code review — 10 findings, all real, all fixed

Ran at high effort over the whole branch diff. **Every finding verified against the code before
acting**; none were rejected. Three were defects in the batch-8 work itself, four were defects the
batch-8 fixes *exposed* on sibling surfaces, and one was a correction to this document.

| # | Finding | Verdict |
|---|---|---|
| 1 | `clear-ticket-data.ts --apply` had **no environment guard** | 🔴 confirmed |
| 2 | finance `clerkPayoutFor` has the same `?? 0` bug **and never passes `defaultClerkCost`** | 🔴 confirmed — worse than reported |
| 3 | finance `clerkPayout` not gated on an active assignment → contradicts the fixed KPI | 🔴 confirmed |
| 4 | Pay page shows a phase-aware due; server debited `totalAmount − amountPaid` | 🔴 confirmed (dormant: tax rate is 0) |
| 5 | `payTicketFromWallet` wrote no `AuditLog` | confirmed |
| 6 | Ledger row said `BANK_TRANSFER` + "Auto-deducted" for a deliberate spend | confirmed |
| 7 | `phoneError` never cleared on form open/close | confirmed — regression in item 9 |
| 8 | `walletBalance = credit − applied` unrounded | confirmed |
| 9 | Consumer-class roles hardcoded instead of `CONSUMER_CLASS_ROLES` | confirmed |
| 10 | `getRepresentativeEarnings` unbounded | confirmed — **deliberately not fixed**, see below |

### The two that matter most

**Finding 3 is the same failure this file documents twice already.** Item 1 fixed the KPI so an
unassigned ticket pays nobody; `finance.service.ts` — a different surface reading the same
concept — kept paying `PDF_CLERK_FEE`. The client's own reproduction was still visible on the
finance board, which is the screen he asked to show Wusuq profit on. **Fixing a shared money rule
on one surface is not fixing it.**

**Finding 4 was real but dormant.** `computeDueNow` returns the phase-1 base for a SPLIT ticket
before finalize; the server used `totalAmount − amountPaid`, which includes tax. `tax.rate` is
currently `0` in production, so the two agreed by accident — one settings change from the button
saying "covers the full PKR 3,000" while the server took PKR 3,300. The due is now derived
**server-side** (the authority), mirroring `computeDueNow`; change one and you must change the other.

### Deliberately NOT fixed

**Finding 10 (unbounded query).** `getRepresentativeEarnings` loads every live assignment with its
ticket row. Real, but it is the *same* unbounded scan `getBusinessKpis` already does, and the
drill-down must reconcile with that KPI exactly — paginating one without the other breaks the
reconciliation this batch exists to provide. Fixing it properly means moving both to a SQL
aggregate. Logged as a follow-up rather than half-done.

### Verification after the review fixes

726 API + 367 web tests (up from 715 + 366), 0 lint, 0 typecheck, build green. **All seven new
review-driven guards mutation-proven** — including one that had to be rewritten: the rounding test
originally used operands that happened to subtract cleanly, so it passed with `round2` removed. A
guard that cannot fail is not a guard; it now uses `5000.3 − 1100.1`, which genuinely drifts.

Live read-only re-check: the finance board and the dashboard KPI now **agree at 2,150**, with the
unassigned ticket contributing **0** on both.
