# Future tickets — design

Status: approved 2026-05-12.
Scope: PDF feedback item #2 — *"If the Case is pending we need to ask consumer, you want us to give you the information on next date? Add there will come the future tickets button under pending tickets."*

## Context

Pending-case tickets already capture both the previous and the next hearing date in Step 2 of the wizard (`payload.case_date` + `payload.future_date`). The data exists but is unused — nothing reads `future_date` downstream. PDF #2 asks for a "Future tickets" button that turns this captured-but-unused field into the seed of a follow-up ticket scheduled around the next hearing.

## Approach

When a pending-case ticket completes, surface a small CTA strip below the existing TicketCard on the My Tickets page. Clicking it opens the consumer wizard pre-filled with the source ticket's payload, with the next/previous hearing dates rolled forward, and jumps to the final wizard step so the consumer confirms delivery options and submits with minimum friction.

No new Prisma model, no new API endpoint, no scheduler. Reuses existing `GET /tickets/:id`, the existing intake POST endpoints, and the existing draft-persistence machinery.

## UI surface — My Tickets

`apps/web/components/consumer-ticket-board.tsx`'s `TicketCard` is a full-card `<button>`. Rather than nesting a button inside, render the future-tickets CTA as a **thin strip below the card** wrapped in its own `<Link>`:

```
┌─────────────────────────────────────────────────────┐
│  TICKET CARD (existing)                             │
│  Service · Lahore · Case No 1234                    │
│  Status: Completed                  PKR 1,000       │
└─────────────────────────────────────────────────────┘
  ┌───────────────────────────────────────────────┐
  │ ⏭  Next hearing 13 May 2026                    │
  │    Order Future Tickets →                      │
  └───────────────────────────────────────────────┘
```

The strip is only rendered when **all** of:
- `ticket.status === 'COMPLETED'`
- `payload.case_status === 'Pending Case'`
- `flow` is one of `judicial_case_files` or `judicial_case_information`
- `payload.future_date` is set (otherwise we have nothing useful to show or roll forward)

The strip lives as a sibling of the existing card `<button>`, not nested inside it (button-in-button is invalid HTML).

## Click target — query-param-driven prefill

The strip is a `<Link>` to the consumer wizard slug matching the source ticket's flow:

```
/consumer/paralegal-services/judicial/case-files?futureFromTicketId=<id>
/consumer/paralegal-services/judicial/case-information?futureFromTicketId=<id>
```

A single query parameter. No new route, no new POST endpoint.

## Wizard prefill effect

`apps/web/components/intake-wizard.tsx` — new mount effect runs **before** the existing draft-active hydration, gated on `searchParams.get('futureFromTicketId')`:

1. Fetch source ticket via existing `GET /tickets/<id>`.
2. Build a fresh in-memory draft from the source payload:
   - **Keep**: `city`, `city_id`, `select_court`, `select_court_id`, `select_court_type`, `select_court_city`, `case_type`, `case_no`, `case_title`, `case_year`, `bench`, `judge_name`, `judge_designation`.
   - **Roll dates forward**: `case_date` (previous) ← source's `future_date` (the hearing that just happened). `future_date` ← `''` (consumer fills the new upcoming hearing).
   - **Reset**: `case_status` ← `'Pending Case'` (still pending by definition; the source was pending so the new one is too).
   - **Clear** so the consumer chooses fresh delivery preferences for the new ticket: `required_documentations`, `set_type`, `attested_qty`, `non_attested_qty`, `delivery_mode`, `delivery_address`, `want_pdf_before_dispatch`, `notes`.
   - **Tag for staff backlinking**: `parent_ticket_id` ← source ticket id (metadata in the JSON payload only — no new DB column).
3. Set `draft.step` to the **final step** of the active flow (Documents & Delivery for Case Files; Information Delivery for Case Information).
4. Skip the existing `GET /tickets/intake-drafts/active` call — when `futureFromTicketId` is set, the prefill is the source of truth and we don't want a stale active draft hijacking it.

The first time the user clicks Save Draft or autosave fires after a payload change, a fresh draft is created via the existing `POST /tickets/intake-drafts` upsert — same as a brand-new wizard session.

## In-wizard banner

When `futureFromTicketId` is in the URL the wizard renders a contextual banner above Step 4:

```
┌─────────────────────────────────────────────────────────┐
│ ⏭ Reordering for the next hearing (TKT-12345)          │
│    Confirm the upcoming hearing date and submit.        │
│                                            ← Back       │
└─────────────────────────────────────────────────────────┘
```

The "← Back" link routes to `/consumer/my-tickets`. The banner stays until the user submits or navigates away.

## Backend

Reuses existing endpoints:
- `GET /tickets/:id` — already exists for the ticket detail drawer.
- `POST /tickets/intake/judicial/case-files` and `…/case-information` — existing intake endpoints.

No new Prisma fields, no migration, no new permission. `parent_ticket_id` is purely a JSON-payload field; staff queries are unaffected.

## Edge cases

- **Source payload missing `future_date`**: button hidden by the visibility guard (Section 1). Nothing to roll forward.
- **Source ticket is for `Decided Case`**: button hidden by the same guard. Decided cases have no next hearing.
- **Source ticket older than 1 year**: button still shown — older cases may have many hearings; the consumer knows their own case state. No v1 warning.
- **User clicks twice on different completed tickets**: the second click overwrites the in-memory prefill. If an active draft already exists for the target flow, the prefill replaces it (the existing `POST /intake-drafts` upserts by `(consumerId, flow)`). Acceptable — there can only be one active draft per flow per consumer anyway.
- **Concurrent in-progress draft for the target flow**: the prefill bypasses the active-draft hydration, so the user's in-progress draft is overwritten the next time autosave fires. Mitigation: the banner makes the new context obvious; the user can `← Back` to abandon and the autosave would only fire after they touch a field. If they do touch a field, the draft is replaced. Worst case is recoverable (they re-enter what they had). v1 acceptable.

## Out of scope (v1)

- **True scheduled tickets** — a "SCHEDULED" status that auto-activates near the hearing date. Heavier; rejected during brainstorming.
- **Notifications** — banner / email / SMS when the next hearing is approaching. Blocked on the deferred notification infrastructure.
- **Bulk "schedule all my future tickets"** view.
- **Staff-side "linked tickets" widget** — the `parent_ticket_id` is stored but not rendered as a clickable backlink in this iteration.
- **Allowing future-ticket creation for `Decided Case`** — hidden by Section 1's guard.
- **Cross-flow follow-ups** — clicking on a Case Files ticket always produces a Case Files follow-up. v1 doesn't offer "follow up with Case Information instead".

## Risks

- **Stale in-progress draft overwritten** — see the edge case above. Mitigation is the banner + `← Back` link. If complaints come in, a confirm dialog can be added.
- **Roll-forward semantics may surprise** — the consumer's old "Next hearing date" becomes the new "Previous case date". The wizard label change is automatic (the same `CaseDateBlock` displays the field based on `case_status`). The banner explicitly says "Confirm the upcoming hearing date" to anchor the user.
- **Case state may have changed** — between the previous ticket's submission and the next hearing, the case could have been decided. The consumer can flip `case_status` to Decided in the wizard if needed; no automatic detection.
