# Workstream C — Consumer Ticket Actions & Hardening — Design

**Date:** 2026-07-07
**Status:** Draft — pending user review (two decisions flagged, both defaulted to the Recommended option while the user was away; confirm on review).
**Batch:** Owner walkthrough batch 2. Roadmap workstream **C** (after A, B). Grounded backlog: `…/scratchpad/batch2-consolidated.md`; code trace grounds every item.

## Scope

- **C7 + C8** — the consumer ticket surface gains **Regenerate**, **Download-invoice**, and **Pay-later** actions (today the card shows only "Pay now"; the detail has "Download invoice" from WS-B). Consumer Regenerate mirrors the staff pre-filled regenerate — which already works for a consumer regenerating their own ticket.
- **Hardening (2 IDORs, same theme as WS-B's review finding):**
  - **H1** — `/documents` list lets a `representative` pass `?consumerId=<anyone>` and read any consumer's documents. Scope reps to their assigned tickets; ignore client `consumerId` for reps.
  - **H2** — `createIntakeTicket` never asserts `dto.consumerId === actor.sub` for consumer-class callers, so a consumer can forge a ticket billed to another consumer. Assert it.

## Decisions (defaulted to Recommended; confirm on review)

1. **B8 (consumer case-create) — DEFERRED.** `Case` rows are staff/lawyer-curated containers that don't auto-derive from tickets; giving consumers case-create needs an RBAC change (`cases.write` to `consumer`) + a new form, with unclear value. Not in this workstream; flag to the owner for confirmation. Consumers keep read-only "My Cases".
2. **Hardening H1 + H2 both included** in WS-C (same area; both are real cross-consumer leaks; H2 also underpins the new Regenerate's server-side safety).

## C7 + C8 — Consumer ticket actions

### Current behavior (grounded)
- **List card** (`consumer-ticket-board.tsx` `TicketCard`, ~334-533): only "Pay now" (two states: final-payment and pay-at-end base). No Regenerate, no invoice, no Pay-later.
- **Detail** (`ConsumerTicketDetail`, ~608-953): "Pay now" + the WS-B "Download invoice" button (detail-only, in the Charges section, gated on `total > 0`, hits `GET /tickets/:id/invoice`).
- **Pay-later** exists only on the pay page (`/consumer/tickets/[id]/pay`, `handlePayLater` ~187-199): a no-op against the ticket (stays UNPAID) that toasts "added to your wallet as due" and routes to the dashboard; the wallet's dynamic `net = credit − due` surfaces the debt.
- **Regenerate:** the staff button (`ticket-board.tsx` `regenerateTicket` ~562-580) navigates to `/paralegal-services/${category}/${slug}?regenerateFromTicketId=${id}` (`category = intakeFlow.startsWith('judicial_') ? 'judicial' : 'non-judicial'`, `slug = flowKeyToSlug(intakeFlow)`). The **same `IntakeWizard`** is mounted under the consumer route `/consumer/paralegal-services/{judicial|non-judicial}/[flowKey]`. The regenerate prefill effect (`intake-wizard.tsx` ~899-983) is not gated on variant/role, sets `consumerId = source.consumerId` (correct for self-regen), and `GET /tickets/:id` is consumer-scoped (404 on foreign). Submit needs `tickets.create`, which consumers hold. **So a consumer can already regenerate their own ticket — only the button is missing.**

### Change (frontend-only for the happy path)
Extract a small shared helper for the regenerate route + the invoice download so the card and detail don't duplicate:
- **`regenerateHref(ticket)`** (new small util, `apps/web/lib/regenerate-route.ts` or colocated): returns `/consumer/paralegal-services/${category}/${slug}?regenerateFromTicketId=${ticket.id}` using the same `flowKeyToSlug` + category logic as `ticket-board.tsx` (extract `flowKeyToSlug` if not already shared).
- **`downloadTicketInvoice(ticketId, setBusy)`** — lift the existing `ConsumerTicketDetail.downloadInvoice` logic into a reusable function so `TicketCard` reuses it (don't copy-paste).
- **Consumer `TicketCard`** — add three actions (alongside "Pay now"):
  - **Regenerate** → `Link`/`router.push(regenerateHref(ticket))`. Show for consumer-created tickets (`createdBy === 'CONSUMER'`).
  - **Download invoice** → `downloadTicketInvoice(ticket.id, …)`, shown when `Number(ticket.totalAmount) > 0`.
  - **Pay later** → shown wherever "Pay now" shows (same gate); clicking toasts "`{due}` added to your wallet as due" (reuse the pay page's copy) — a client-only acknowledgment (the ticket already sits UNPAID with the due surfaced by the wallet). No backend call. Keep "Pay now" as the immediate-payment path to the pay page.
- **`ConsumerTicketDetail`** — add the same **Regenerate** and **Pay-later** buttons next to the existing "Pay now" / "Download invoice" (invoice already present).
- No backend or wizard change for the happy path (H2 below is the defense-in-depth for it).

### Edge cases
- Regenerate on a legacy ticket without `intakeFlow` → hide the button (can't build the route).
- Non-judicial consumer wizard route must exist (`/consumer/paralegal-services/non-judicial/[flowKey]`) — verify in the plan; if only judicial is mounted, hide Regenerate for non-judicial or add the route.
- USD tickets regenerate/invoice fine (existing behavior).

## H1 — `/documents` representative scoping

### Current behavior
`DocumentsController.list` (`documents.controller.ts:14-25`) sets `forConsumer = isConsumerRole(user.role)` and, only then, forces `query.consumerId = user.sub`. `representative` is NOT consumer-class, so `forConsumer=false` and the client-supplied `?consumerId=` flows verbatim into `DocumentsService.list`'s where-clause (`documents.service.ts:10-54`) → a rep reads any consumer's documents. (`documents.read` is held by all staff + `lawyer`/`consumer`/`representative`/`company`.)

### Change
Add a representative branch: `forRepresentative = user.role === 'representative'`. For a rep, **ignore any client `consumerId`** and scope the query to documents whose ticket is one of the rep's own assignments — mirror however tickets `findAll` restricts reps (`ticket: { assignments: { some: { representativeId: user.sub } } }`). Pass a `forRepresentative` option (+ the rep's userId) to `DocumentsService.list`/`export`; staff stay unfiltered; consumer-class stays as-is (`forConsumer`). Add a test: a rep passing `?consumerId=other` gets only their assigned tickets' docs (not `other`'s).

## H2 — `createIntakeTicket` consumer attribution

### Current behavior
`createIntakeTicket` (`tickets.service.ts:603+`) trusts `dto.consumerId` outright (only uses it to look up currency); the controller passes `actor` for audit only. A consumer-class caller can POST an intake with any `consumerId` → a ticket billed to another consumer.

### Change
At the top of `createIntakeTicket` (or in the controller before delegating), when the actor is consumer-class (`isConsumerRole(actor.role)`), assert `dto.consumerId === actor.sub` (or force `dto.consumerId = actor.sub`) — reject/override otherwise. Staff/lawyer (creating on behalf) keep passing an explicit `consumerId`. This makes the consumer Regenerate/intake attribution server-guaranteed, not client-trusted. Add a test: a consumer forging a foreign `consumerId` is rejected (or coerced to self); staff-on-behalf still works.

## Files

- `apps/web/lib/regenerate-route.ts` (new) — `regenerateHref` + shared `flowKeyToSlug`/category (extract from `ticket-board.tsx` if needed).
- `apps/web/components/consumer-ticket-board.tsx` — Regenerate + Download-invoice + Pay-later on `TicketCard`; Regenerate + Pay-later on `ConsumerTicketDetail`; lift `downloadInvoice` to a reusable fn.
- `apps/api/src/documents/documents.controller.ts` + `documents.service.ts` — rep scoping (H1).
- `apps/api/src/tickets/tickets.service.ts` (and/or `tickets.controller.ts`) — consumer `consumerId` assertion (H2).
- Tests below.

## Testing

- **API unit:** H1 — a rep listing `/documents?consumerId=other` gets only their assigned tickets' docs; a consumer still self-scoped; staff unfiltered. H2 — a consumer POSTing intake with a foreign `consumerId` is rejected/coerced; staff-on-behalf unaffected.
- **Web unit:** `regenerateHref(ticket)` builds the correct consumer route per flow (judicial/non-judicial); returns null/hidden for a flowless ticket.
- **Web e2e (mock-API):** consumer ticket card shows Regenerate (nav to the regenerate route), Download-invoice (fires `GET :id/invoice`), Pay-later (toast). Mirror `tests/e2e/pricing-tax-promo.spec.ts`; `test.fixme` deep-nav parts as needed.
- **Manual:** a consumer regenerates their own ticket → pre-filled wizard → submits a new ticket owned by them; downloads its invoice from the card; Pay-later shows the wallet due; a rep can't read another consumer's documents.

## Out of scope
- **B8 consumer case-create** (deferred, decision 1 — flag to owner).
- Any change to the staff regenerate / invoice (already shipped).
- The `Case` auto-derive-from-ticket idea (separate design if the owner wants it).
