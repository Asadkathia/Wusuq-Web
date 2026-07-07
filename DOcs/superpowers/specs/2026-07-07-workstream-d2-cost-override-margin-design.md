# Workstream D2 — Cost Override & Margin Visibility — Design

**Date:** 2026-07-07
**Batch:** Owner walkthrough batch 2. Roadmap workstream **D**, sub-chunk **D2** (order D2 → D1 → D3). Grounded by the WS-D code trace.
**Status:** Approved (design confirmed 2026-07-07).

## Scope

Three small, low-risk items — most of the machinery already exists:
- **C9** — labeling only: clarify *Additional Service Cost* (folds into base, **taxed**) vs *Additional Cost* (separate line, **untaxed**) on the admin cost surfaces. The two-cost model is already correct in `computeTicketTotal`.
- **C10** — the per-ticket admin cost override is already built (`finance.updateCharge` + `ticket-charges-board.tsx`). Close the one gap: `updateCharge` doesn't snapshot `Ticket.priceBreakdown` like `repriceTicket` does, so an override there leaves the invoice's line-item provenance stale. Add the snapshot write.
- **C15** — add a **"Wusuq earnings"** margin line (`totalAmount − clerkEarnings`), **admin/staff-only**, in the ticket-detail Charges Breakdown + the Review & Complete dialog. Never shown to consumers.

## Grounding (from the WS-D trace)

- `computeTicketTotal` (`packages/shared/src/index.ts` ~802-821): `serviceBase = round2(serviceCost + additionalServiceCost)`; `taxableBase = max(0, serviceBase − discountTotal)`; `additionalCharges` is summed into `chargesSubtotal`/`totalAmount` but **excluded** from `taxableBase`. Model already matches the owner's two-cost intent → C9 is labeling only.
- `finance.updateCharge` (`apps/api/src/finance/finance.service.ts` ~214-294, `UpdateChargeDto`): `serviceCost`, `additionalServiceCost`, `additionalCharges`, delivery/printing/attested/nonAttested, discount all overridable; recomputes `totalAmount`/`taxAmount` via `computeTicketTotal`; guard `total >= amountPaid`; writes `AuditLog` `FINANCE_CHARGE_UPDATE`. **Does NOT write `Ticket.priceBreakdown`.**
- `repriceTicket` DOES write `priceBreakdown` (the resolver-line snapshot). This is the pattern to mirror.
- `Ticket.priceBreakdown Json?` snapshots resolver lines + applied discount/promo/tax for invoice/audit provenance (flat columns remain the math source).
- `computeClerkEarnings` (`packages/shared/src/index.ts` ~850-861) = `base(clerkCost ?? defaultClerkCost) + attestedCharges + nonAttestedCharges + printingCharges + deliveryCharges + (pdfPurchased ? PDF_CLERK_FEE : 0)` — the single source. Rendered admin-only in `ticket-detail-panel.tsx` (~354-367) and the Review & Complete dialog (`ticket-board.tsx` ~1843-1860); both already have `totalAmount`/`clerkEarnings` in scope.

## Design

### C9 — labeling (frontend only)
On `apps/web/components/ticket-charges-board.tsx` (the `/manage-cost/ticket-charges` admin board) and the Review & Complete dialog charge inputs (`ticket-board.tsx`), give the two fields unambiguous labels + a one-line hint:
- **Additional Service Cost** — hint: "Added to the taxable service base."
- **Additional Cost** — hint: "Separate line; not taxed."
No logic/DTO change. Keep existing field keys (`additionalServiceCost`, `additionalCharges`).

### C10 — `updateCharge` writes `priceBreakdown`
In `finance.updateCharge`, after computing the new totals (and inside the same update), build a `priceBreakdown` snapshot from the resulting charge columns + the applied discount/tax and persist it to `Ticket.priceBreakdown` — mirroring the shape `repriceTicket`/`finalizeRemainderCore` write. Reuse the existing snapshot builder if one is shared; otherwise assemble the same JSON shape from the flat columns (service, additionalServiceCost, delivery, printing, attested, nonAttested, additional, discount, promoDiscount, taxAmount, taxRate, total). Currency-safe: read the ticket's stored `currency`/`taxRate` (USD → taxRate already 0; no special-casing beyond using the stored values). No behavior change to the totals themselves (already correct); this only records provenance so the invoice's snapshot stays consistent with an admin override.

**Guard note:** keep the existing `total >= amountPaid` guard; do not add a USD hard-block (an admin overriding a USD flat price is valid — it just sets the flat total).

### C15 — Wusuq earnings margin line (admin/staff-only)
Add a small pure helper (or inline, but prefer a shared pure fn for testability):
```ts
// packages/shared — beside computeClerkEarnings
export function computeWusuqMargin(totalAmount: number, clerkEarnings: number): number;
// = round2(totalAmount − clerkEarnings)
```
Render a **"Wusuq earnings"** row using it:
- `ticket-detail-panel.tsx` Charges Breakdown — beside the existing clerk-earnings/total rows (admin + clerk view; this panel is already internal-only, never `ConsumerTicketDetail`).
- Review & Complete dialog (`ticket-board.tsx`) — beside the clerk-earnings summary, using the live finalize-derived total.
- **Never** in `consumer-ticket-board.tsx` (`ConsumerTicketDetail`).

## Files

- `apps/web/components/ticket-charges-board.tsx` — C9 labels/hints.
- `apps/web/components/ticket-board.tsx` — C9 labels on Review & Complete inputs + C15 margin row.
- `apps/web/components/ticket-detail-panel.tsx` — C15 margin row.
- `apps/api/src/finance/finance.service.ts` — C10 priceBreakdown snapshot write.
- `packages/shared/src/index.ts` — `computeWusuqMargin` (C15).
- Tests below.

## Testing

- **API unit** (`finance.service` spec): after `updateCharge` overrides a ticket's `serviceCost`, `Ticket.priceBreakdown` is written and reflects the new total (assert the update payload includes a `priceBreakdown` with the expected total). Existing `updateCharge` behavior (totalAmount/taxAmount/guard) unchanged.
- **Shared unit:** `computeWusuqMargin(total, clerkEarnings)` = `round2(total − clerkEarnings)` incl. a case where clerk earnings exceed total (negative margin) and rounding.
- **Web:** a guard/assertion that `ConsumerTicketDetail` does NOT render "Wusuq earnings" (grep-style test or a render assertion in the existing web test style); the margin math helper is covered by the shared unit test.
- **Manual:** admin overrides a ticket's Service Cost on `/manage-cost/ticket-charges` → totalAmount + the consumer invoice reflect it, and `priceBreakdown` is refreshed; the "Wusuq earnings" line shows in the admin ticket detail + Review & Complete, and is absent from the consumer ticket detail.

## Out of scope
- **C11 / B11 / C12** (clerk charge-entry split, editable page counts, TCS receipt) → **D1**.
- **C16** editable rate screen + turnaround field → **D3**.
- **PricingController RBAC guard** — deferred per owner (accepted risk; tracked for D3).
- Audit-history UI for prior overrides (updateCharge already writes `AuditLog`; surfacing it is not requested).
