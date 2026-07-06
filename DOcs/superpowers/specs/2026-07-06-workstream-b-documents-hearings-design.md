# Workstream B — Documents, Deliverables & Hearings — Design

**Date:** 2026-07-06
**Status:** Draft — pending user review (three assumptions flagged below)
**Batch:** Owner walkthrough batch 2. Roadmap workstream **B** (after A). Grounded backlog: `…/scratchpad/batch2-consolidated.md`; code trace grounds every item below.

## Scope (5 items)

- **B1** — delivered document can't be downloaded ("Download failed") and has no in-app viewer.
- **B2** — clerk's document appears unlinked to the ticket (My Files vs My Documents confusion).
- **B3** — next-hearing date not shown on the ticket detail; dashboard "Next hearing" widget shows "none".
- **B10** — after the clerk submits costs, they can no longer upload the work/TCS document.
- **C14** — consumer can't download a receipt/invoice. Builds the **shared consumer-safe invoice generator** that WS-C ("Download Invoice") reuses.

## Assumptions to confirm on review

1. **Consumer invoice = on-the-fly PDF** (`GET /tickets/:id/invoice`), no new persisted `Invoice` row; ownership-checked; consumer-safe (no clerk cost; with tax/promo).
2. **Inline viewer included** for B1 — consumer + admin document surfaces get an in-app preview (iframe/`<object>` for PDF, `<img>` for images) fed by the authenticated streaming endpoint, in addition to download.
3. **Clerk `Ticket.scheduledDate` is authoritative** for "next hearing"; the case card + dashboard prefer it, falling back to intake `formPayload.future_date` only when unset. No double-writing of `formPayload`.

---

## B1 + B2 — Documents: fix the download + linkage (one backend fix)

### Current behavior (grounded)
- Upload works: clerk `POST /tickets/:id/documents/upload` → multer disk (`./uploads/ticket-documents`) → `TicketDocument { fileUrl, visibleToConsumer(default false), category(default WORK_DOCUMENT), … }` (`tickets.service.ts:1555-1612`, `schema.prisma:465-477`).
- Serving works and is correctly scoped: `GET /tickets/:id/documents/:docId/download` streams the file, but `resolveDocumentDownload` (`tickets.service.ts:1648-1682`) requires consumer-owns-ticket **AND** `doc.visibleToConsumer` **AND** `ticket.status ∈ {COMPLETED, DELIVERED}`, else 403.
- **Root cause of "Download failed":** the My-Documents page calls `GET /documents?consumerId=self` → `DocumentsService.list` (`documents.service.ts:10-67`) has **no `visibleToConsumer` filter and no ticket-status filter** — it returns every `TicketDocument` on the consumer's tickets, incl. internal `WORK_DOCUMENT`s and docs on `IN_PROGRESS` tickets. Each row renders a Download button (`consumer-documents-board.tsx:159-184`); clicking a non-downloadable one 403s at `resolveDocumentDownload` → `toast.error('Download failed')`.
- The ticket-detail Documents section is **already correct** — `redactTicketForConsumer` (`tickets.service.ts:553-560`) returns only visible docs on completed tickets. So B2's "shown against the ticket" already works there.
- `DocumentsController.export` (CSV) has the same missing filter → leaks internal doc metadata.
- Three distinct stores (explains the confusion): `TicketDocument` (clerk deliverables, tied to ticket), `PersonalFile` (consumer's own `/consumer/files`, optional `attachedTicketId`), `Case` (usually null). Clerk deliverables land in `TicketDocument` → shown in ticket-detail + My Documents, **never** in My Files (different table).

### Change
- **`DocumentsService.list` + `export`:** add the same gate the ticket detail uses — `visibleToConsumer: true` AND the ticket's `status ∈ {COMPLETED, DELIVERED}` — **for consumer-role callers only** (staff still see all, for their document boards). Determine caller role in the controller (it already has the JwtUser) and pass a `forConsumer` flag to the service (mirror the `findAll`/`findOne` pattern). This makes every row the consumer sees actually downloadable → no more "Download failed".
- **Stream robustness:** add `.on('error', …)` to the `createReadStream(...).pipe(res)` in the download handlers (`tickets.controller.ts:654,679`) so a missing-on-disk file returns a clean `404`/`410` instead of an unhandled stream error.
- **B2 UI clarity (optional, small):** confirm the consumer "My Documents" empty/label copy makes clear these are deliverables tied to tickets (distinct from My Files). No schema change.

*Operational note (not code):* deliverables rely on the Render persistent disk actually being mounted (`render.yaml` flags the blueprint "NOT CONNECTED"). If the disk isn't attached, files 404 after redeploy — flag to the owner; out of code scope.

### Inline viewer (assumption 2 — included)
A new `<DocumentPreview>` component (`apps/web/components/document-preview.tsx`): given a doc's download URL + name, it authenticated-fetches the blob (`apiClient.getBlob`), makes an object URL, and renders **PDF in an `<iframe>`/`<object>`** and **images in an `<img>`** (branch on content-type/extension), with a Download fallback for other types and a loading/error state. Revokes the object URL on unmount. Wire it (as an inline expandable panel or a modal) into the three document surfaces: consumer ticket-detail Documents (`consumer-ticket-board.tsx`), consumer **My Documents** (`consumer-documents-board.tsx`), and admin `ticket-detail-panel.tsx`. The existing streaming endpoint already returns the correct `Content-Type`, so no backend change is needed for the viewer — it reuses the same download route (which, post-fix, only lists downloadable docs).

---

## B3 — Hearings: read the clerk-set column + fix the dashboard query

### Current behavior (grounded)
- Two sources: `Ticket.scheduledDate`/`hearingType` (set by `recordNextHearing`, `tickets.service.ts:3185-3204`) vs `formPayload.case_date`/`future_date` (intake, never updated).
- `buildCaseView`'s `hearingsOf` (`apps/web/lib/case-view.ts:104-109`) reads `val(p, 'future_date', 'scheduledDate')` where `p` is `formPayload` only → the `'scheduledDate'` fallback is **dead code** (it's a Ticket column, not a payload key). All 3 call sites pass only `ticket.formPayload`. So the case card permanently shows the stale intake `future_date`.
- The list `TicketCard` DOES read `ticket.scheduledDate` (`consumer-ticket-board.tsx:369`) → list and detail can disagree (the 17-Jul vs 3-Jul in the recordings).
- Dashboard "Next hearing": `dashboard.service.ts:87-99` queries `{ scheduledDate: {gte:now}, consumerId, caseId: { not: null } }` — the `caseId: { not: null }` excludes standard intake tickets (which have `caseId=null`), so it returns null → widget shows "none" even when a hearing exists.

### Change
- **`buildCaseView` signature** → `buildCaseView(payload, tier, opts?: { scheduledDate?: string | null })`. `hearingsOf` uses `opts.scheduledDate` for **Next** when present, else `future_date`; **Previous** stays `case_date`. Update all 3 call sites (`consumer-ticket-board.tsx`, `ticket-detail-panel.tsx` ×2 clerk/admin) to pass `{ scheduledDate: ticket.scheduledDate }`. Remove the dead `'scheduledDate'` payload fallback.
- **Dashboard query** (`dashboard.service.ts:87-99`): drop `caseId: { not: null }`; keep `consumerId` + `scheduledDate: {gte:now}`, `orderBy scheduledDate asc`. If it selects `case.title`, make that a left-join/optional select (title may be null) and fall back to the ticket's case title from payload or the service name.
- No double-write of `formPayload` (assumption 3): `scheduledDate` is the single authoritative "next hearing"; the case card prefers it.

---

## B10 — Clerk can upload after submitting costs (frontend gating)

### Current behavior
`submitClerkCosts` advances `IN_PROGRESS → WAITING_APPROVAL` (`tickets.service.ts:2289-2290`). The FE shows "Upload Work Documents" **only** under `status === 'IN_PROGRESS'` (`ticket-board.tsx:1104-1123`); the `WAITING_APPROVAL` branch has no upload action. The backend `uploadDocument` has **no** status gate (`tickets.service.ts:1555-1577`, only `ensureClerkActionAllowed`).

### Change
Frontend only: render the "Upload Work Documents" button when `status ∈ {IN_PROGRESS, WAITING_APPROVAL}` in `ticket-board.tsx`. No API change (endpoint already permits it). This lets the clerk attach the TCS/work document after submitting costs, before admin review.

---

## C14 — Consumer receipt/invoice (the shared generator)

### Current behavior
A pdfkit invoice generator exists but is **staff-only**: `finance.service.ts:413-576 buildInvoicePdf`, endpoints under `/finance/*` gated `finance.read`/`finance.write` (no consumer/rep holds these). Critically it prints **`Clerk Cost`** (`finance.service.ts:541`) — internal-only per CLAUDE.md — and predates the WS-A money model (no tax/promo lines). So it cannot be reused unmodified for consumers.

### Change — new consumer-safe generator + endpoint
- **New PDF builder** `buildConsumerInvoicePdf(ticket, settings)` (new file `apps/api/src/tickets/consumer-invoice.pdf.ts`, or a method on a small `ConsumerInvoiceService`): reuse pdfkit + the header/table/line-item layout style from `buildInvoicePdf`, but source **consumer-safe** lines only:
  - Header: Wusuq branding, Invoice/Receipt no = ticket `batchNo`, date, status.
  - Bill To: consumer name/email.
  - Line items (mirror the on-screen consumer breakdown, respecting WS-A phase-2 gating): **Service** (serviceCost + additionalServiceCost), and the phase-2 lines (Delivery/Printing/Attested/Non-attested/Additional) **only when `remainderFinalizedAt`** is set; **Discount** (if any); **Tax** (`taxAmount`, labeled with rate). **Never** clerk cost.
  - Totals: Total = `ticket.totalAmount`, Amount Paid, Due.
  - Payment info from `PaymentSettings` (bank/JazzCash/EasyPaisa) — reuse the same singleton the pay page uses.
  - Prefer `Ticket.priceBreakdown` snapshot when present for provenance; fall back to the flat charge columns minus clerkCost.
- **New endpoint** `GET /tickets/:id/invoice` (perm `tickets.read`) — ownership-checked (consumer owns the ticket, or staff), returns `{ filename, contentType:'application/pdf', content: base64 }` mirroring the finance download shape; consumer-class callers restricted to their own ticket (same pattern as `resolveDocumentDownload`).
- **Consumer UI:** a "Download invoice" (or "Download receipt") action on the consumer ticket detail (`consumer-ticket-board.tsx`) that hits the endpoint and triggers a client download (reuse the existing blob→`<a download>` pattern). WS-C ("Download Invoice" on the consumer ticket card) will reuse this same endpoint.

## Files

- `apps/api/src/documents/documents.service.ts` + `documents.controller.ts` — consumer visibility filter (B1/B2).
- `apps/api/src/tickets/tickets.controller.ts` — stream `.on('error')` (B1) + new `GET :id/invoice` route (C14).
- `apps/api/src/tickets/consumer-invoice.pdf.ts` (new) + a service method — consumer-safe PDF (C14).
- `apps/api/src/dashboard/dashboard.service.ts` — drop `caseId` filter (B3).
- `apps/web/lib/case-view.ts` — `buildCaseView` scheduledDate opt (B3).
- `apps/web/components/document-preview.tsx` (new) — inline PDF/image viewer (B1).
- `apps/web/components/consumer-ticket-board.tsx` — pass scheduledDate + "Download invoice" button + wire viewer (B3, C14, B1).
- `apps/web/components/consumer-documents-board.tsx` — wire viewer (B1).
- `apps/web/components/ticket-detail-panel.tsx` — pass scheduledDate to buildCaseView ×2 + wire viewer (B3, B1).
- `apps/web/components/ticket-board.tsx` — Upload button under WAITING_APPROVAL (B10).
- Tests below.

## Testing

- **API unit:** `DocumentsService.list` for a consumer returns only `visibleToConsumer` docs on COMPLETED/DELIVERED tickets (and staff still get all); `export` same. `GET :id/invoice` — consumer gets own ticket's PDF, a foreign ticket 404s; the PDF's line-item builder excludes clerkCost and includes tax (unit-test the `buildConsumerInvoicePdf` line-item assembly as a pure function returning the rows, separate from pdfkit rendering). Dashboard next-hearing returns a ticket with `caseId=null` (was excluded).
- **Web unit:** `buildCaseView(..., { scheduledDate })` → Next uses scheduledDate over future_date; falls back when unset.
- **Web unit/e2e:** `<DocumentPreview>` renders an `<iframe>` for a PDF blob and an `<img>` for an image blob (mock `getBlob`); consumer ticket detail shows a working "Download invoice"; My Documents shows only downloadable rows and opens the inline preview.
- **Manual:** clerk uploads a doc after submitting costs (WAITING_APPROVAL); consumer on a COMPLETED ticket previews inline + downloads the deliverable + the invoice (no clerk cost, tax shown); dashboard shows the next hearing.

## Out of scope
- Persisted numbered consumer Invoice rows (assumption 1 — on-the-fly).
- Fixing the Render disk mount (operational, flag to owner).
- WS-C's consumer Regenerate/Pay-Later buttons (separate workstream; the invoice endpoint here is the shared piece it reuses).
