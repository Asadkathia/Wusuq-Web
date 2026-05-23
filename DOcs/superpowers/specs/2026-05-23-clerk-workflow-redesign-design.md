# Clerk Workflow Redesign — Design Spec

- **Date:** 2026-05-23
- **Status:** Approved (design)
- **Scope:** Spec 3 of 3. Clerk-facing ticket workflow: a clerk-scoped detail
  view, the intake-type display bug, case-details ordering, document categories
  (work docs vs deliverable PDF) with multi-file upload, multi-ticket
  assignment, and the clerk next-hearing capture + admin follow-up generation.
- **Builds on:** Spec 1 (intake/forms) and Spec 2 (payment/wallet) — both on
  the same branch lineage. Reuses Spec 2's `defaultClerkCost` and the existing
  "future tickets" prefill (`apps/web/lib/future-tickets.ts`).

## Context

Findings from exploration:
- `apps/web/components/ticket-detail-panel.tsx` renders 7 sections (consumer
  info, service details, charges breakdown, assigned rep, clerk report,
  documents, status timeline). It already knows `currentUserId` and whether the
  viewer is the assigned representative (`ticket.assignments?.[0]?.representative?.id === currentUserId`).
- `Ticket.intakeFlow` is stored (`tickets.service.ts` createIntakeTicket) and
  returned by the API, but **never rendered** — the "intake type missing" bug.
- The case-details (`formPayload`) render iterates JSON keys in arbitrary order.
- `TicketDocument` has `type` (MIME) + `visibleToConsumer` only — **no category**.
  Upload: `POST /tickets/:id/documents/upload` (`tickets.controller.ts`).
- Assignment is single-ticket: `POST /tickets/:id/assign` (`AssignTicketDto`).
- `Ticket` already has `scheduledDate / hearingType / outcome / nextDate`
  (from the cases-workflow redesign). The consumer dashboard reads
  `scheduledDate` as "my next hearing."
- "Future tickets" already exist: `apps/web/lib/future-tickets.ts` builds a
  prefilled wizard payload for a follow-up ticket at a case's next hearing
  (copies city/court/case fields, rolls `future_date`→`case_date`, resets to
  Pending, stamps `parent_ticket_id`). Consumer-initiated today via a banner.

---

## 1. Clerk-scoped ticket detail (role-gate the existing panel)

- Add a viewer-context flag to `ticket-detail-panel.tsx` — e.g. `viewerRole`
  derived from the logged-in user (representative/clerk vs admin/staff). The
  panel already receives `currentUserId`; pass the role alongside it.
- When the viewer is a **clerk/representative** (decision 2026-05-23: role-gate,
  not a separate component): render **only**
  - the **Case Details** section (the ordered case info, §3), and
  - that clerk's **Clerk Cost** (the single `clerkCost` line — what they're paid),
  and **hide** consumer PII, the full charges breakdown, payment status, and the
  status timeline.
- Admin/staff continue to see the full panel unchanged.
- Gate each section behind `if (!isClerkView) { … }` (or render a minimal
  clerk subtree) so there is one component with one source of truth.

---

## 2. Intake-type display bug

- Render `ticket.intakeFlow` in the detail panel (both clerk and admin views),
  humanized via `FLOW_LABELS` from `@wusuq/shared` (fallback to the raw key).
- Place it in the Service/Case header area so the "type of intake" is always
  visible. No backend change — the field is already returned.

---

## 3. Case-details ordering

Replace the arbitrary JSON-key render in `ticket-detail-panel.tsx`
(`renderPayload`) with an explicit canonical order, unknown keys appended
alphabetically after:

```
1. City            (select_court_city / city / serviceCity)
2. Court           (select_court / select_court_type)
3. Service         (service name / intakeFlow label)
4. Case type       (case_type / case_type_other)
5. Case no         (case_petition_no / case_no)
6. Year            (case_year / year)
7. Case title      (case_title)
8. Bench / Judge   (bench, judge_designation, judge_name)
9. Case date / Next hearing (case_date, future_date, scheduledDate)
10. … remaining payload fields (appended)
```

Implement as an ordered key list resolved through `PAYLOAD_FIELD_ALIASES` so
aliased keys land in the right slot. Applies to both clerk and admin views.

---

## 4 & 5. Document categories: work docs vs deliverable PDF, multi-file

### Schema
Add a `DocumentCategory` enum and a column on `TicketDocument`:

```prisma
enum DocumentCategory {
  WORK_DOCUMENT
  DELIVERABLE_PDF
}

model TicketDocument {
  // …existing…
  category  DocumentCategory @default(WORK_DOCUMENT)
}
```

(Migration required.)

### Semantics
- **`WORK_DOCUMENT`** — internal verification that the clerk did the work; **not
  consumer-visible** by default (`visibleToConsumer=false`).
- **`DELIVERABLE_PDF`** — the document the consumer receives (the PDF they paid
  the standard fee for); **consumer-visible** (`visibleToConsumer=true`), subject
  to the existing post-completion visibility rule.

### Upload
- `POST /tickets/:id/documents/upload` accepts a `category` field (default
  `WORK_DOCUMENT`). When `DELIVERABLE_PDF`, set `visibleToConsumer=true`.
- Support **multiple files** per upload action (the model already allows many
  `TicketDocument` rows per ticket; the clerk UI sends each file, tagged with
  its drop-zone category).

### Clerk UI
Two labelled drop zones in the clerk view:
- "Work documents" → `WORK_DOCUMENT` (multi-file).
- "Deliverable PDF(s)" → `DELIVERABLE_PDF` (multi-file).
The documents list groups by category.

---

## 6. Multi-ticket assignment

- Add checkbox selection to the pending-tickets list (`ticket-board.tsx`).
- A "Assign selected to clerk" action opens a representative picker and calls a
  new **bulk endpoint**: `POST /tickets/assign-bulk` with
  `{ ticketIds: string[], representativeId: string, forceAssign?: boolean }`.
- For each ticket, apply **its own `defaultClerkCost`** (decision 2026-05-23) —
  no single override in bulk; the override toggle stays a single-ticket action.
- Backend reuses the existing single-assign logic per ticket (assignment record,
  payment gating per ticket, supersede prior active assignment). Tickets that
  fail gating are reported back as skipped (partial success), not a hard fail.
- Single `POST /tickets/:id/assign` stays for the per-ticket override flow.

---

## 7. Clerk next-hearing capture + admin follow-up generation

### Clerk records the next hearing (at completion)
- When a clerk completes a **pending** ticket (mainly **Case Information**),
  expose an optional **next-hearing** field (toggle + date, optionally
  `hearingType`). The clerk obtains it from the court while doing the work.
- Persist to `Ticket.scheduledDate` (the field the consumer dashboard already
  reads as "next hearing"), plus `hearingType` if provided. Captured as part of
  the completion / clerk-charges submission.

### Admin generates the follow-up ticket
- On a completed pending ticket with a recorded next hearing, an admin action
  **"Generate next-hearing ticket"** creates a new follow-up ticket via a
  server-side endpoint `POST /tickets/:id/generate-next-hearing`:
  - Mirror the **future-ticket prefill** (`future-tickets.ts` logic) server-side,
    adapted so the **clerk-recorded next-hearing date seeds the new ticket's
    hearing date** (rather than only rolling the consumer's original
    `future_date`).
  - **The new ticket is consumer-owned and consumer-payable:** `consumerId` =
    the original consumer, **`createdBy = CONSUMER`** (NOT `ADMIN_STAFF`), so
    Spec 2's payment gating applies and the consumer pays it as a normal new
    ticket. (Admin-created tickets are gating-exempt — this must be CONSUMER so
    the consumer is billed.) Status starts `PENDING`, `paymentStatus=UNPAID`.
  - Stamp `parent_ticket_id` for backlinking. Primarily the
    `judicial_case_information` flow.
- This is admin-triggered "on customer demand"; it does not auto-create.

> Relationship to existing future tickets: the consumer still provides the
> *first* next hearing at intake (unchanged). This adds the **subsequent**
> hearings, which only the clerk learns at the courthouse — captured at
> completion, regenerated by the admin.

---

## Components & boundaries

**API**
- `prisma/schema.prisma` — `DocumentCategory` enum + `TicketDocument.category`.
- `tickets.controller.ts` / `tickets.service.ts` — `category` on upload;
  `assignBulk`; next-hearing capture on completion; `generateNextHearingTicket`.
- Reuse `future-tickets` prefill logic server-side (or mirror it) for the
  admin generate path.

**Web**
- `ticket-detail-panel.tsx` — role-gating, intake-flow display, ordered
  case-details, grouped documents.
- `ticket-board.tsx` — multi-select + bulk-assign; clerk two-zone upload;
  clerk next-hearing field at completion; admin "Generate next-hearing ticket".
- A small `ticket-detail` ordering helper (shared key order).

**Shared**
- Reuse `FLOW_LABELS`, `PAYLOAD_FIELD_ALIASES`. A canonical case-details key
  order can live in `@wusuq/shared` so both panel and any future consumer view
  agree.

---

## Testing

- Unit: case-details ordering helper (known keys ordered, aliases mapped,
  unknown keys appended).
- Unit: `assignBulk` assigns each ticket with its own `defaultClerkCost`;
  gating-failing tickets are skipped and reported, not fatal.
- Unit: upload sets `visibleToConsumer` per category; clerk view hides
  consumer/charges/payment sections.
- Unit: `generateNextHearingTicket` prefills from the parent + seeds the
  clerk-recorded `scheduledDate`; stamps `parent_ticket_id`; new ticket is
  consumer-payable.
- Manual: clerk login sees the minimal detail; intake type shows; two upload
  zones; bulk-assign; clerk records next hearing at completion; admin generates
  the follow-up; consumer sees/pays it.
- Regression: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

---

## Out of scope / notes

- No new clerk *portal* — clerks use the existing portal; the detail view is
  role-gated. (If a dedicated clerk role/route is later wanted, that's separate.)
- Migrations (`DocumentCategory` + `TicketDocument.category`) need
  `prisma:migrate:dev` against the DB (run by the owner / outside sandbox).
- The deliverable-PDF ↔ PDF-charge link is informational here; billing for PDF
  is handled in Spec 2 (standard, opt-in at finalize).
