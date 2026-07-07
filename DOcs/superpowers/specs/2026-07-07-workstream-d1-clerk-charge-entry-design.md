# Workstream D1 — Clerk Charge-Entry (Pages × Rate, Editable, TCS Receipt) — Design

**Date:** 2026-07-07
**Batch:** Owner walkthrough batch 2. Roadmap workstream **D**, sub-chunk **D1** (order D2 ✅ → D1 → D3). Grounded by the WS-D code trace.
**Status:** Approved (design confirmed 2026-07-07: C11 = pages×rate per category with separate page + per-page-rate fields, no flat "additional"; C12 = capture receipt in the charge dialog).

## Scope

- **C11** — split the clerk's charge entry into **three independent page×rate pairs**: printing (`noOfPages`/`costPerPage`, exists) + **attested** (new) + **non-attested** (new). Each total = pages × per-page rate. No separate flat "additional attested/non-attested" charge.
- **B11** — the admin "Review & Complete" page counts become **editable** (today read-only), covering printing + attested + non-attested, and the persisted page counts stay truthful after an admin edit.
- **C12** — the **TCS/delivery receipt** upload + tracking# move INTO the clerk "Update payments" dialog (next to the delivery charge, at IN_PROGRESS), for physical-delivery flows. The DISPATCHED flip + admin "Confirm delivered" gate stay unchanged — proof is just captured earlier.

## Grounding (from the WS-D trace + code)

- `submitClerkCosts` (`tickets.service.ts` ~2346-2357): `printingCharges = dto.printingCharges ?? computePrintingCharges(dto.noOfPages, dto.costPerPage) ?? Number(ticket.printingCharges)`. `attestedCharges`/`nonAttestedCharges` are currently `dto.<x> ?? Number(ticket.<x>)` — flat lumps. `computePrintingCharges(pages, rate)` (~3126) = generic `pages × rate` (reusable).
- Schema (`schema.prisma`): `attestedCharges`/`nonAttestedCharges Decimal @default(0)`; `noOfPages Int?`; `costPerPage Decimal? @db.Decimal(10,2)`. `dispatchProofUrl`/`trackingNo`/`deliveryStatus` already exist (walkthrough-fixes).
- `computeTicketTotal`/`computeClerkEarnings` read the flat `attestedCharges`/`nonAttestedCharges`/`printingCharges` columns → **money model + earnings unchanged**; the page columns are inputs/provenance.
- **Consumer redaction** already strips `noOfPages`/`costPerPage`/`dispatchProofUrl`/`clerkReport`/rep-phone (`redactTicketForConsumer`). Must extend the strip to the 4 new page columns.
- Migration reality (CLAUDE.md): `prisma migrate dev` is unusable on the Neon DB — apply new migrations via `prisma db execute` + `migrate resolve --applied`. The SQL migration file is committed; applying to Neon is a deploy step.

## Design

### Schema (one migration)
Add 4 nullable `Ticket` columns mirroring `noOfPages`/`costPerPage`:
```
attestedPages          Int?
attestedCostPerPage    Decimal? @db.Decimal(10, 2)
nonAttestedPages       Int?
nonAttestedCostPerPage Decimal? @db.Decimal(10, 2)
```
New migration dir `apps/api/prisma/migrations/20260707000000_add_ticket_attested_page_breakdown/migration.sql` (`ALTER TABLE "Ticket" ADD COLUMN ...`). Update `schema.prisma`; `prisma generate`. Applying to Neon = deploy step (`db execute` + `migrate resolve --applied`), documented, not run here.

### C11 — clerk cost entry (`submitClerkCosts`)
- `SubmitClerkCostsDto` gains `attestedPages?`, `attestedCostPerPage?`, `nonAttestedPages?`, `nonAttestedCostPerPage?` (all `@IsOptional @IsNumber @Min(0)`), plus `dispatchProofUrl?` (`@IsString`, app-relative path) + `trackingNo?` (`@IsString`) for C12.
- Compute attested/non-attested the SAME way printing already computes, reusing `computePrintingCharges` (rename to `computePageCharges` for clarity, or reuse as-is):
  ```
  attestedCharges = dto.attestedCharges ?? computePageCharges(dto.attestedPages, dto.attestedCostPerPage) ?? Number(ticket.attestedCharges)
  nonAttestedCharges = dto.nonAttestedCharges ?? computePageCharges(dto.nonAttestedPages, dto.nonAttestedCostPerPage) ?? Number(ticket.nonAttestedCharges)
  ```
  Precedence `explicit lump ?? pages×rate ?? persisted` keeps legacy tickets (lump, no page data) working and lets B11's admin lump-override win.
- Persist the 4 page columns (`attestedPages: dto.attestedPages ?? ticket.attestedPages`, etc., mirroring how `noOfPages`/`costPerPage` persist at ~2385-2386 and ~2472-2473) + the computed charges + `dispatchProofUrl`/`trackingNo` (C12).

### B11 — editable page counts in Review & Complete
- `FinalizeRemainderDto` gains `noOfPages?`, `costPerPage?` + the 4 attested/non-attested page fields (all optional numbers).
- `finalizeRemainderCore` recomputes `printingCharges`/`attestedCharges`/`nonAttestedCharges` from pages×rate with the same `explicit ?? pages×rate ?? persisted` precedence, and persists the (possibly admin-corrected) page columns back onto the ticket so the breakdown stays truthful.
- Review & Complete dialog (`ticket-board.tsx`): convert the read-only page divs into editable `Input`s for printing + attested + non-attested (each: pages + cost-per-page + a "computed" line), bound into `finalizeForm`. The finalize-preview total already goes through `computeTicketTotal` (WS-D2 fix), so it reflects the edits.

### C12 — TCS receipt in the clerk cost dialog
- Clerk "Update payments" dialog (`ticket-board.tsx` `costsTicket`): for physical-delivery flows (`caps.delivery`), add a **receipt file upload** + **tracking#** input next to the delivery-charge field. Upload the file via the clerk's existing receipt/document upload endpoint (reuse whatever the current Mark-Dispatched dialog / clerk-receipt upload uses — verify the endpoint in the plan), get the app-relative URL, and include `dispatchProofUrl` + `trackingNo` in the `submitClerkCosts` POST.
- State machine UNCHANGED: capturing the proof here only persists `dispatchProofUrl`/`trackingNo`; it does NOT flip `deliveryStatus`. The clerk still marks dispatched (or the admin confirms delivered) as today; the DELIVERED gate (`deliveryStatus = DISPATCHED` AND fully paid, physical flows) is untouched. The existing Mark-Dispatched dialog no longer re-requires the file when `dispatchProofUrl` is already set (file becomes optional there).

### Redaction (must-do)
- Extend `redactTicketForConsumer` to strip the 4 new page columns (`attestedPages`/`attestedCostPerPage`/`nonAttestedPages`/`nonAttestedCostPerPage`) alongside the existing `noOfPages`/`costPerPage` strip — consumers must never see the clerk page breakdown.
- The `submitClerkCosts` return is already redacted via `redactMutationResultForCaller`; reps legitimately see clerk fields, consumers don't. Verify the new fields follow the same path (no new leak).

## Files

- `apps/api/prisma/schema.prisma` + new migration SQL — 4 columns.
- `apps/api/src/tickets/dto/submit-clerk-costs.dto.ts` — +4 page fields + dispatchProofUrl + trackingNo.
- `apps/api/src/tickets/dto/finalize-remainder.dto.ts` — +noOfPages/costPerPage + 4 page fields.
- `apps/api/src/tickets/tickets.service.ts` — `submitClerkCosts` + `finalizeRemainderCore` compute/persist; `redactTicketForConsumer` strip; (optional) rename `computePrintingCharges`→`computePageCharges`.
- `apps/web/components/ticket-board.tsx` — clerk cost dialog (4 page inputs + receipt upload + tracking#) + Review & Complete editable page inputs.
- Tests below.

## Testing

- **API unit:** `submitClerkCosts` computes `attestedCharges = attestedPages × attestedCostPerPage` (and non-attested) when page fields sent; falls back to the persisted lump when absent (legacy); persists the 4 page columns + `dispatchProofUrl`/`trackingNo`. `finalizeRemainderCore` recomputes the three charges from admin-edited page counts + persists them. `redactTicketForConsumer` strips the 4 new columns.
- **Web:** clerk cost dialog renders the attested/non-attested page+rate inputs with computed lines; Review & Complete renders editable page inputs; receipt upload shows only for physical-delivery flows. (Node-env unit where feasible; deep interaction via existing e2e patterns / `test.fixme` as needed.)
- **Manual:** clerk enters attested 10 pages × 50 + non-attested 4 × 30 → charges compute; uploads a TCS receipt + tracking# in the same dialog; admin edits the page counts in Review & Complete and the total updates; consumer view shows no page breakdown / no proof.

## Out of scope
- **C16** editable rate screen + turnaround + PricingController RBAC → **D3** (RBAC deferred per owner).
- Changing the DELIVERED money/dispatch gate or the dispatch state machine (only the proof-capture *timing* moves).
- Any change to `computeTicketTotal`/`computeClerkEarnings` (they keep reading the flat charge columns).
- The pre-existing `finance.service.ts` `clerkPayout` hand-roll (flagged in D2; separate cleanup).
