# Structured Case Card + Full Edit-Ticket — Design

**Date:** 2026-06-28
**Status:** Approved (brainstorming) — pending spec review
**Origin:** The two remaining unimplemented asks from the owner's 2026-06-25 walkthrough videos (the "DJS-portal-style" ticket detail screen and a true full Edit-ticket). Plan that shipped the rest: `DOcs/superpowers/plans/2026-06-26-walkthrough-fixes.md`.

## Context / problem

1. **Ticket detail is a flat key/value dump.** The owner showed the Punjab DSJ Lahore case-detail page (bold title, colour-coded status, a summary grid, a Proceeding-History table) and asked for that structured look, with fields ordered by importance per court tier. We currently render the payload as a plain list.
2. **"Edit ticket" can't actually edit.** It opens the `TicketRepriceDialog`, which only exposes a few case fields + manual charge overrides. The owner wants to edit the full form (category, court, method, document requirements) and have the ticket **re-priced and its total updated in place** — on the same ticket, not a clone (Regenerate already clones).

**Intended outcome:** a structured, tier-aware case card on both staff and consumer ticket-detail screens, and a full-form in-place ticket editor that re-prices the same ticket.

## Key constraints (decided in brainstorming)

- **Proceeding history:** we do NOT capture multi-row court proceeding history at intake (only one previous hearing date `case_date` and one next `future_date`/`scheduledDate`). The card **renders what we have** — a small "Hearings" block — and does NOT fake a multi-row table or scrape the court portal.
- **Both screens** get the card: staff `TicketDetailPanel` (admin + clerk views) and consumer `ConsumerTicketDetail`. Consumer keeps its existing redaction.
- **Edit = in place, same ticket**, re-priced (total bill updated). Distinct from Regenerate (clone-as-new).
- **The `TicketRepriceDialog` is retired** — "Edit ticket" is the single full-form editor.

## Feature 1 — Structured case card

### `buildCaseView(payload, tier)` — `apps/web/lib/case-view.ts` (new, pure)

Reads a **fixed allowlist** of case keys only (never iterates arbitrary payload keys → no `*_id`/`source`/enum leak by construction; safer than the current consumer allowlist loop). Returns:

```ts
type CaseTone = 'pending' | 'decided' | 'unknown';
type CaseView = {
  title: string | null;                                    // case_title
  status: { label: string; tone: CaseTone } | null;        // from case_status
  summary: Array<{ label: string; value: string }>;        // tier-ordered, blanks dropped
  bench: { designation: string | null; judges: string[] } | null; // judge_designation + bench/judge_name
  hearings: { previous: string | null; next: string | null } | null; // case_date + future_date/scheduledDate
};
export function buildCaseView(
  payload: Record<string, string | undefined> | null | undefined,
  tier: CourtTier | null,
): CaseView;
```

- **Status tone** (matching the owner's DSJ reference): `case_status` containing "pending" → `pending` (red/rose), "decided" → `decided` (green), else → `unknown` (gray).
- **Tier-ordered summary** (`tier = courtTierFromCourtType(payload.select_court_type)`):
  - `lower`: Case Title → Judge → Hearings → Case No → Case Type → Court
  - `high` | `supreme` | `fcc` | `shariat` | `special`: Case No → Case Title → Case Type → Bench → Hearings → Court
  - FIR fields (`fir_no`, `fir_year`, `police_station`, `offence`) appended when present.
  - (Title/judge/bench/hearings render in their own card blocks; the *summary grid* carries Case No, Case Type, Court, Institution/filing date if present, FIR fields. The tier order governs block order top-to-bottom.)
- Values humanized via the shipped `docBundleLabel` (tier-aware) + the existing label map; bench via the existing `parseBench`.

### `<CaseRecordCard view={…} />` — `apps/web/components/case-record-card.tsx` (new, presentational)

Pure component, no data access:
- **Header:** bold case title + status badge (toned).
- **Summary grid:** label/value rows.
- **Bench block:** judge designation + judge name(s).
- **Hearings block:** "Previous hearing" / "Next hearing" dates (omitted entirely when both absent).

### Integration

- **`ticket-detail-panel.tsx`:** replace the `renderPayload(...)` case-details section (admin "Case Payload" + clerk "Case Details") with `<CaseRecordCard view={buildCaseView(payload, tier)} />`. The Charges / Clerk earnings / Delivery / Notes / Documents sections are unchanged. Non-case payload keys that were shown (e.g. `notes`) keep their existing dedicated sections; the card owns the case-identity fields. `humanizePayloadValue`/`renderPayload` may be removed if no longer referenced.
- **`consumer-ticket-board.tsx`:** render the same card in the "Case details" section, fed the already-redacted payload. The current `isCaseDetailKey`/`payloadValueLabel` case loop is replaced by the card; non-case sections (delivery, timeline, charges) unchanged.

### Redaction safety

`buildCaseView` only reads named case keys, so it cannot surface ids/system keys regardless of caller. Consumer redaction (`redactTicketForConsumer`) is unaffected. No new server data is exposed.

## Feature 2 — Full edit-ticket (front-end only)

Backend is already complete: `PATCH /tickets/:id/reprice` (`RepriceTicketDto.payload?` → `mergedPayload` merges over `formPayload` → re-resolves via `buildPricingResolveInput` → `computeTicketTotal` → persists merged payload + charges + total + taxAmount + priceBreakdown; reconciles money via wallet auto-credit on downward corrections; rejects `DELIVERED`; status never changes; USD flat). No API change.

### Wizard edit mode — `apps/web/components/intake-wizard.tsx`

- **New entry param `editTicketId`.** Precedence (each prefill effect early-returns when a higher-priority param is set): `editTicketId` > `regenerateFromTicketId` > `futureFromTicketId` > resumed-draft.
- **Route:** `/paralegal-services/<category>/<flowKey>?editTicketId=<id>` (category from `intakeFlow.startsWith('judicial_')`, slug via `flowKeyToSlug` — same mapping the staff Regenerate button uses).
- **Hydration:** load the ticket (`GET /tickets/:id`), copy its full `formPayload` into `draft.payload`; set `draft.consumerId = ticket.consumerId`; skip the admin `consumerId = currentUser.id` default (same guard as regenerate).
- **Edit-mode UI/behavior:**
  - Banner above the step rail: *"Editing TKT-… — changes update this ticket and re-price the total."*
  - **Skip** draft autosave and the submit idempotency `requestId` (not a new sale).
  - Live checkout shows the re-priced total via the existing `checkoutSummary` memo (unchanged).
  - **Submit:** call `apiClient.patch('/tickets/${editTicketId}/reprice', { payload: withDerivedYear(draft.payload) })` instead of `createIntakeTicket`. No manual `overrides` (let the resolver recompute). On success → navigate to the ticket detail.
- **Submit guards:** reuse the wizard's per-step validation (required fields). If reprice returns `!matched` (unavailable combination) surface the error inline (same as intake).

### Edit button wiring & dialog retirement

- **`ticket-detail-panel.tsx`:** the "Edit ticket" button navigates to the edit-mode wizard route (for non-`DELIVERED` tickets) instead of opening `TicketRepriceDialog`. **Hide the button when `status === 'DELIVERED'`.**
- **Retire `TicketRepriceDialog`:** remove its import, the `repriceOpen` state, and the dialog render from `ticket-detail-panel.tsx`. Delete `apps/web/components/ticket-reprice-dialog.tsx` if it has no other consumers (grep first). The `/reprice/preview` + `/reprice` endpoints stay (the edit wizard uses `/reprice`).

### Edge cases

- `DELIVERED` ticket: Edit hidden; reprice would reject anyway.
- New total < amountPaid → wallet auto-credit (existing). New total > amountPaid → larger balance due (consistent with pay-at-end).
- USD ticket → flat re-resolve (existing); set-type/PDF/promo inputs already hidden for USD in the wizard.
- Status unchanged; history + payments preserved.
- Permission: staff only (`tickets.write`).

## Files

**New:**
- `apps/web/lib/case-view.ts` — `buildCaseView` + `CaseView`/`CaseTone` types.
- `apps/web/components/case-record-card.tsx` — `<CaseRecordCard>`.
- `apps/web/lib/case-view.test.ts` (or co-located spec) — unit tests.

**Modified:**
- `apps/web/components/ticket-detail-panel.tsx` — use the card; Edit button → edit route; retire reprice dialog; hide Edit for DELIVERED.
- `apps/web/components/consumer-ticket-board.tsx` — use the card for case details.
- `apps/web/components/intake-wizard.tsx` — `editTicketId` mode (hydrate, banner, skip autosave/idempotency, submit to reprice).

**Removed:** `apps/web/components/ticket-reprice-dialog.tsx` (if unreferenced after the change).

**Backend:** none.

## Testing

- **Unit (`buildCaseView`):** tier ordering (lower vs apex), status tone mapping, hearings present/absent, allowlist excludes `*_id`/`source`/`required_documentations` value humanized, empty payload → null-ish view.
- **Component (`CaseRecordCard`):** renders title/badge/grid/bench/hearings; omits empty blocks.
- **E2E (mock-API pattern, `tests/e2e/`):** Edit-ticket — open edit wizard from a ticket, change a field, submit → asserts `PATCH /reprice` called with the merged payload and the detail shows the new total. (Follows the existing `pricing-tax-promo.spec.ts` mock pattern.)
- **Manual:** card renders on staff + consumer detail for a lower-court and a high-court ticket; Edit re-prices and updates the total; Edit hidden on a DELIVERED ticket.

## Out of scope

- Multi-row proceeding-history capture or court-portal scraping (decided: render what we have).
- Any backend reprice change (already supports full-payload edit).
- Consumer-initiated editing (staff only).
