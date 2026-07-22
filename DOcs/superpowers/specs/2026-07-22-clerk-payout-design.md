# Clerk payout must ignore the admin's markup — design (2026-07-22)

Source: client review batch 3 — `DOcs/superpowers/specs/2026-07-22-client-review-batch3-findings.md` items 1–4.
Reported three independent times (video-1 voiceover, the "400 + 100 photocopy" note, and an explicit rule statement).

## The rule

> "super admin jo cost krta hy add wo clerk k liye nai hy. clerk ka wohi invoice hy jo us ny bana di.
> super admin 5000 ki ticket ko 10,000 kr de. clerk ki amount wohi rahy gi"
>
> Whatever the super admin adds is NOT for the clerk. The clerk's invoice is exactly what the clerk
> created. If the super admin turns a Rs 5,000 ticket into Rs 10,000, the clerk's amount stays the same.

## Current behaviour (the defect)

Demonstrated live: clerk submitted 50 non-attested pages @ Rs 5 = **250**. Admin marked the rate to
Rs 10 → **500**. Ticket total 1,200 (base 500 + non-attested 500 + delivery 200).

- Shown: **clerk PKR 1,100 / Wusuq PKR 100**
- Correct: clerk 400 + 200 delivery + **250** = **850**; Wusuq = **350**

Second instance: clerk dashboard showed EARNED (REALIZED) **PKR 600**; should be 400 + 100 photocopy
= **500**, because "100 super admin ny extra" must not reach the clerk.

### Root cause (verified)

- `computeClerkEarnings()` — `packages/shared/src/index.ts:908` — sums the **final** charge columns
  (`attestedCharges`, `nonAttestedCharges`, `printingCharges`, `deliveryCharges`).
- `finalizeRemainderCore` — `apps/api/src/tickets/tickets.service.ts:2772` — **overwrites those same
  columns** with the admin's edited values.
- Therefore the admin's markup is paid to the clerk, and `computeWusuqMargin` (total − clerk) collapses.

### Secondary defect, same cause

There is no separate clerk-submitted column. The `"Clerk submitted: PKR 250"` comparison line in the
Review & Complete dialog (`apps/web/components/ticket-board.tsx:2404`) reads those **same live
columns**; it only looks stable because `finalizeDetail` is a pre-edit snapshot. Once finalized, the
clerk's original figure is destroyed and the line is wrong on any later open.

### Blast radius

Five consumers of the clerk-earnings figure, all reading the overwritten columns:

| Site | File |
|---|---|
| Clerk dashboard | `apps/api/src/dashboard/dashboard.service.ts:192` |
| Finance payout report (×2) | `apps/api/src/finance/finance.service.ts` ~100, ~340 — **hand-rolls** the sum |
| Review & Complete dialog | `apps/web/components/ticket-board.tsx:327` |
| Staff ticket detail panel | `apps/web/components/ticket-detail-panel.tsx:355` |
| "Clerk submitted" line | `apps/web/components/ticket-board.tsx:2404` |

`finance.clerkPayout` is the actual money-out report — it has the identical bug and hand-rolls the
formula instead of using the shared function (debt already flagged in CLAUDE.md).

## Decisions taken

| Question | Decision |
|---|---|
| Admin edits a clerk line **downward** | **Cap, don't freeze.** Clerk pay = `min(clerk submitted, admin final)`. Markup ignored; genuine corrections (clerk typos 500 pages for 50) still reduce pay. |
| Already-finalized tickets | **No backfill.** Wusuq is **not in production**; test tickets are deleted as needed. No historical reconciliation, no payout recovery. |
| Itemized earnings display | **In scope.** The client asked for "400 + 100 photocopy", and a silent math fix would look unchanged on his screen. |
| `finance.clerkPayout` | **In scope**, and routed through the shared function rather than left hand-rolled. |

## Design

### Storage

Four nullable columns on `Ticket`, named to match the existing `clerkCost`:

```prisma
clerkAttestedCharges     Decimal?  @db.Decimal(10, 2)
clerkNonAttestedCharges  Decimal?  @db.Decimal(10, 2)
clerkPrintingCharges     Decimal?  @db.Decimal(10, 2)
clerkDeliveryCharges     Decimal?  @db.Decimal(10, 2)
```

Mirrors the existing `noOfPages` / `costPerPage` provenance pattern already on `Ticket`. Additive
migration, no data change. **Apply to Neon via `prisma db execute` + `migrate resolve --applied`, NOT
`migrate dev`** — the documented constraint for this database.

Rejected alternatives: a single JSON blob (not queryable; `clerkPayout` aggregates across tickets),
and deriving from `TicketStatusHistory` (those rows never captured charge columns, so it is not
actually possible).

### Write boundary — the whole fix

- `submitClerkCosts` writes the clerk set **in addition to** the working columns. Existing behaviour
  otherwise unchanged, including the B4 rule that it must never write `totalAmount`.
- `finalizeRemainderCore` writes **only** the working columns and **never** touches the clerk set.

On clerk resubmission (permitted while `WAITING_APPROVAL`), the clerk set is rewritten — the latest
submission is the clerk's invoice.

### Payout rule

Per line:

```
clerkLine = clerkSubmitted == null ? final : min(clerkSubmitted, final)
```

`NULL` means no clerk submission was recorded — the admin filled the charges directly — and falls back
to today's behaviour. This is a live path, not just a legacy one.

`clerkCost` (the agreed clerk fee, admin-set at assignment) and the `PDF_CLERK_FEE` cut are unchanged.
`additionalCharges` remains excluded from clerk earnings, as today.

### Shared function

`computeClerkEarningsBreakdown(input)` returns:

```ts
{ base, attested, nonAttested, printing, delivery, pdfFee, total }
```

`computeClerkEarnings(input)` becomes a thin wrapper returning `.total`, preserving every existing
call site. Itemization is then a property of the single source rather than hand-rolled at three
display sites — the same reasoning that made `computeClerkEarnings` the single source originally.

### Display

Clerk dashboard, staff ticket detail panel, and the Review & Complete dialog render the per-line
breakdown from `computeClerkEarningsBreakdown`. The `"Clerk submitted: PKR X"` line reads the real
clerk set, which fixes the stale-comparison defect as a side effect.

### Redaction

The clerk set is internal:

- **Stripped** by `redactTicketForConsumer` (consumers never see clerk economics).
- **NOT stripped** for representatives — a clerk must see their own figures.

Getting this backwards in either direction is the highest-risk part of the change and must be
explicitly verified in review, per the established rule that a redaction gate is checked on
`isStaffRole`/`isConsumerRole` helpers and never a literal role string.

## Testing

Shared unit tests:
- markup ignored — submitted 250, final 500 → line 250
- correction applied — submitted 500, final 250 → line 250
- `NULL` clerk set → falls back to final
- breakdown fields sum to `total`; wrapper matches `.total`

API tests:
- submit → admin marks up → finalize → clerk earnings unchanged, Wusuq margin absorbs the markup
  (reproduces the client's exact 850 / 350 case)
- submit → admin corrects down → clerk earnings drop to the corrected value
- clerk-set-absent ticket → legacy fallback
- `finance.clerkPayout` reflects the capped figures
- consumer redaction strips the clerk set; representative redaction does not

## Known consequence

Clerk dashboard "pending earnings" reflects what the clerk submitted; "realized" reflects the capped
value. When an admin corrects downward, a clerk sees their number fall after review. This is correct
under the chosen rule, but it is visible to clerks and they may ask about it.

## Out of scope

The remaining 22 items in the batch-3 findings document, including the USD/PKR conversion gap (the
other architectural piece in this batch).
