# Cases module workflow redesign — design

**Status:** Proposed
**Author:** AI-assisted (brainstormed with project owner)
**Date:** 2026-05-04
**Repo:** Wusuq-Web

## Goal

Make the Cases module a genuine **collection-and-recommendation hub** for tickets that share legal context, while keeping the ticket-creation experience identical to standalone intake. Eliminate the parallel ticket-creation pipeline, the fragile `inferFlow` heuristic, and the `Hearing` table whose function collapses cleanly into Ticket.

## Non-goals

The following are explicitly out of scope for this spec; track as separate follow-ups:

- Expanded `CaseStatus` state machine (`ON_HOLD`, `PAUSED`, `CLOSING`, etc.) and `statusReason`.
- Event-sourced `CaseEvent` (current append-only log retained as-is).
- `CasePlanItem` / next-actions queue.
- Granular permission split (`cases.update_status`, `cases.proceedings.*`, etc.).
- Consumer self-serve verbs beyond what already exists.
- Provenance sidecar on Case fields (`{ value, sourceTicketId, capturedAt }`).
- Hard-purge admin tool to complement soft-delete.

## Decisions log

Captured during brainstorming, locked in by user:

| # | Decision | Rationale |
|---|---|---|
| 1 | Hearing and Proceeding are unified — no separate model. Tickets carry optional scheduling/outcome fields. | "They are the same thing." Ticket is the unit of work. |
| 2 | Case-linked ticket creation uses the **exact same** `IntakeWizard` as standalone. Only difference: a single new "Case" selector at the top. | Consistency, single source of truth, no parallel UI. |
| 3 | Recommendations surface in **three places**: Case detail page, completion notification, dashboard Action Center. | Most useful for ops; reuses existing surfaces. |
| 4 | Recommendation rules are **static, code-defined** in `@wusuq/shared`. No DB table, no admin UI. | Only 7 flows; rules rarely change; trivially testable. |
| 5 | Wizard prefill from Case uses **canonical-named Case columns + `PAYLOAD_FIELD_ALIASES`** as the single translation layer. | One source of naming truth; symmetric for read/write. |
| 6 | Ticket completion writes back to Case **fill-only**. Conflicts emit `CONTEXT_DRIFT_DETECTED` events; admin resolves via Action Center. | Avoids silent data corruption and silent data loss. |
| 7 | Case creation supports **both paths**: manual creation form (kept) and wizard-driven creation via the new "Case" selector. | Case is a collection; either entry point is legitimate. |
| 8 | Recommendations are filtered out when the case has any non-cancelled ticket of that flow. Cancelling re-opens the recommendation. | Ticket state is the dismissal signal; no new table. |
| 9 | Spec scope: workflow + soft-delete consistency. State machine and event sourcing are deferred. | Single mergeable spec; soft-delete naturally rides along with `Hearing` removal. |

## 1. Schema changes

### 1.1 `Hearing` model deletes

- Drop the `Hearing` table and `Ticket.hearingId`.
- Drop `Hearing.id` references in `CaseEvent` (`hearingId` column).
- Add optional scheduling/outcome columns directly to `Ticket`:
  - `scheduledDate: DateTime?`
  - `hearingType: String?`
  - `outcome: String?`
  - `nextDate: DateTime?`
- Existing `Ticket.caseId` stays (already nullable, already `onDelete: SetNull`).
- **Status (2026-05-04):** done. Migration `20260504170000_drop_hearing_model` applied to dev DB. Pre-flight check confirmed zero `Hearing` rows; no data migration needed. `HEARING_SCHEDULED` and `HEARING_UPDATED` enum values dropped via the rename → recreate → swap → drop pattern.

### 1.2 `Service.flowKey`

- New column on `Service`: `flowKey: String?` (nullable).
- Backfill via one-shot migration script (`apps/api/scripts/backfill-service-flowkey.ts`).
- **Revision (post-implementation, 2026-05-04):** the column stays **nullable** instead of `NOT NULL`. Inspecting the seed data showed services map by court level (one service like "High Court Paralegal Service" serves multiple flows — Case Files, Case Search, Case Information, Case Filing, Power of Attorney). Only the two non-judicial services (`svc_non_judicial_fir`, `svc_non_judicial_registry_deed`) have a true 1:1 mapping. Forcing `NOT NULL` would have required inventing a flow per judicial service, masking the fact that the user picks the flow at the wizard.
- Backfill scope: only services with an unambiguous 1:1 mapping (the two non-judicial ones).
- `inferFlow` is **retained** in `cases.service.ts` as a defensive fallback for case-linked ticket creation when neither `dto.flow` nor `service.flowKey` is set. The fallback chain is: `dto.flow` (wizard-supplied) → `service.flowKey` (1:1 services) → `inferFlow` (heuristic default per case type).

### 1.3 `Case.deletedAt`

- Add `deletedAt: DateTime?` to `Case`.
- Replace `prisma.case.delete` with soft-delete (set `deletedAt`); gate every Case query by `deletedAt: null`.
- Hard-purge admin tool is out of scope; track as follow-up.

### 1.4 No new tables

- No `Proceeding`, no `RecommendationDismissal`, no `CasePlanItem`. All recommendation state derives from existing ticket state.

### 1.5 New `CaseEvent` types

- `CONTEXT_DRIFT_DETECTED` — payload `{ field, caseValue, ticketValue, ticketId }`
- `CONTEXT_RESOLVED` — payload `{ field, chosenValue, source: 'CASE' | 'TICKET', ticketId? }`
- `RECOMMENDATION_TRIGGERED` — payload `{ flowKey, reason, surface }`. Logged for analytics; not required for the user flow.

## 2. API changes

### 2.1 Unified ticket-creation pipeline

- `CreateTicketIntakeDto` gains:
  - `caseId?: string`
  - `scheduledDate?: string` (ISO)
  - `hearingType?: string`
- `tickets.service.ts#createIntakeTicket` writes `caseId` + scheduling fields **in the same `prisma.ticket.create`** — no second `update`. Single audit entry.
- `cases.service.ts#createCaseTicket` becomes a thin convenience that:
  1. Looks up the Case (must be non-deleted, status `OPEN`).
  2. Builds `payload = aliasMap.applyForFlow(case.canonicalContext, flowKey)` (read direction of `PAYLOAD_FIELD_ALIASES`).
  3. Forwards into `ticketsService.createIntakeTicket({ ...dto, caseId, payload })`.
- `continueCaseTicket` and `CreateCaseTicketDto` delete entirely. Continuation is now "Attach to existing case" in the wizard, which prefills from the Case (which already holds whatever the previous tickets contributed).

### 2.2 Case context columns

- Keep flat columns on `Case` (judicial + non-judicial) but treat them as **the canonical naming layer**:
  - Judicial: `caseNo`, `caseYear`, `court`, `courtCity`, `caseCategory`, `courtCaseStatus`, `judgeDesignation`, `petitioner`, `respondent`.
  - Non-judicial: `province`, `district`, `policeStation`, `firNo`, `offence`, `docNo`, `officeCity`.
- Move `PAYLOAD_FIELD_ALIASES` (today in `tickets.service.ts:113`) into `@wusuq/shared` so both API and web import the same map. Extend it with any case-column-to-wizard-key gaps discovered during implementation.

### 2.3 Fill-only write-back with drift detection

- New helper `cases.service.ts#applyTicketCompletionToCase(ticket)` runs as a side effect in the existing ticket-completion path (the place that today fires `TICKET_COMPLETED` `CaseEvent`).
- Behaviour for each canonical Case field that the ticket payload provides:
  - **Case field is `null`** → write the ticket value.
  - **Case field has a value matching the ticket value** → no-op.
  - **Case field has a value differing from the ticket value** → write a `CONTEXT_DRIFT_DETECTED` `CaseEvent`. **Do not overwrite.**
- Drift events feed an Action Center row "N cases need context review."
- Resolution UI on the Case page lets an admin pick "Use ticket value" or "Keep current"; either choice writes the chosen value with a `CONTEXT_RESOLVED` event.

### 2.4 Recommendation endpoint

- `GET /cases/:id/recommendations` returns `Array<{ flowKey, label, reason, priority }>`.
- Pure function of current state:
  1. Read all tickets on the case → derive `triggerFlows` (COMPLETED) and `blockingFlows` (everything except CANCELLED/REJECTED). See §3.2 for definitions.
  2. Build candidate list = `flatMap(triggerFlows, f => RECOMMENDATIONS_BY_FLOW[f])`.
  3. Filter out any candidate whose `next ∈ blockingFlows` (Option D dismissal).
  4. Deduplicate (same target flow can be recommended by multiple completions; pick the highest-priority reason).
  5. Sort by priority ascending.
- No persistence layer. The endpoint is reproducible from the database state.

### 2.5 Aggregate endpoint for dashboard

- `GET /dashboard/case-recommendations-summary` returns `{ count: number, oldestCaseId: string | null, oldestActivatedAt: Date | null }`.
- Dashboard's `pendingActions[]` (already structured, see prior dashboard work) gets a new entry:
  ```
  { key: 'case_recommendations', label: 'Cases with suggested next steps',
    count, oldestAgeHours, deepLink: '/cases?filter=has_recommendations',
    severity: 'info' }
  ```
- Computed by: for each open, non-deleted case, run the recommendation logic; count cases with ≥1 active recommendation. Cache TTL 60s, same as existing dashboard cache.

## 3. Recommendation engine

### 3.1 Static rule map

Lives in `@wusuq/shared`:

```ts
export type FlowKey =
  | 'judicial_case_files'
  | 'judicial_case_information'
  | 'judicial_case_search'
  | 'judicial_case_filing'
  | 'judicial_power_of_attorney'
  | 'non_judicial_copy_of_fir'
  | 'non_judicial_registry_deed';

export type RecommendationRule = {
  next: FlowKey;
  priority: 1 | 2 | 3;
  reason?: string;
};

export const RECOMMENDATIONS_BY_FLOW: Record<FlowKey, RecommendationRule[]> = {
  judicial_case_search: [
    { next: 'judicial_case_information', priority: 1, reason: 'Case located — order case information next.' },
    { next: 'judicial_case_files',       priority: 2, reason: 'Order certified file copies.' },
  ],
  judicial_case_information: [
    { next: 'judicial_case_files',        priority: 1, reason: 'Order full file copies.' },
    { next: 'judicial_power_of_attorney', priority: 3, reason: 'Authorize representation if proceeding to filing.' },
  ],
  judicial_case_files: [
    { next: 'judicial_power_of_attorney', priority: 2 },
    { next: 'judicial_case_filing',       priority: 3 },
  ],
  judicial_power_of_attorney: [
    { next: 'judicial_case_filing',       priority: 1, reason: 'PoA in place — proceed to filing.' },
  ],
  judicial_case_filing: [],
  non_judicial_copy_of_fir: [],
  non_judicial_registry_deed: [],
};
```

### 3.2 Filtering rule (Option D)

Two flow sets, computed from the case's tickets:

- **`triggerFlows`** — the set of `flowKey`s for tickets on this case that have status `COMPLETED`. Each completed flow contributes its entries from `RECOMMENDATIONS_BY_FLOW` to the candidate recommendations.
- **`blockingFlows`** — the set of `flowKey`s for tickets on this case whose status is **anything except `CANCELLED` or `REJECTED`** (i.e. `PENDING`, `ASSIGNED`, `IN_PROGRESS`, `WAITING_APPROVAL`, `COMPLETED`). Note this is a superset of `triggerFlows`.

A recommendation `R` is **shown** if and only if `R.next ∉ blockingFlows`. A previously hidden recommendation re-appears automatically when its blocking ticket transitions to `CANCELLED` / `REJECTED` (or is soft-deleted, depending on the cancellation model decided in implementation — see §8).

The filter logic is a single pure function exported from `@wusuq/shared`:

```ts
function recommendationsForCase(args: {
  triggerFlows: FlowKey[];
  blockingFlows: FlowKey[];
}): RecommendationRule[];
```

Both API and web call this. No DB access; trivially unit-testable.

### 3.3 Trigger surfaces (Option C)

1. **Case detail page** — always-visible "Suggested next steps" panel rendered above existing tabs. Recomputed via `GET /cases/:id/recommendations` on each page load and after any ticket state change in that case.
2. **Toast/notification on ticket completion** — fired by the same write-back hook that runs `applyTicketCompletionToCase`. One notification per completion, summarizing the top 1–2 recommendations.
3. **Dashboard Action Center row** — pulls from the aggregate endpoint described in §2.5. Slots into the existing `pendingActions[]` array.

## 4. UI changes

### 4.1 IntakeWizard — Case selector

- Single new step at the top of the wizard (call it **Step 0: Case**), with three options:
  - **Standalone ticket** — no case linkage. Default when wizard is opened from `/paralegal-services/...` with no `?caseId=` param.
  - **Attach to existing case** — typeahead picker over the user's accessible cases. Selecting a case sets `caseId` and prefills the wizard from the case's canonical context via the alias map.
  - **Create new case from this ticket** — case auto-created on submit, populated fill-only from this ticket's payload.
- When the wizard is launched from a Case page (`/cases/:id`), the selector is **locked** to "Attach to case X" and rendered as a non-interactive header (no extra clicks).
- The rest of the wizard is **unchanged**. No flow-specific case-only fields. No special steps.

### 4.2 Case detail page

- New "Suggested next steps" panel above the existing Tickets/Hearings/Timeline tabs. Cards from `GET /cases/:id/recommendations`. Click → navigates to the IntakeWizard (or opens it inline) with the flow preselected, the case attached, and prefill applied.
- "Hearings" tab renames to **"Schedule"**. Renders the case's tickets that have a `scheduledDate`, sorted by date. Same column shape as today's hearings tab, plus a column for ticket status.
- "Timeline" tab gains rendering for `CONTEXT_DRIFT_DETECTED` and `CONTEXT_RESOLVED` events (yellow / green dot, human-readable label).
- **Context drift banner**: when the case has unresolved drift events (count of `CONTEXT_DRIFT_DETECTED` minus count of `CONTEXT_RESOLVED` for that field > 0), a yellow strip at the top links to a small modal listing affected fields with **Use ticket value / Keep current** buttons.

### 4.3 Cases list page

- New filter chip "Has suggestions" that shows cases with at least one active recommendation. Driven by the same logic as the dashboard aggregate.

### 4.4 Files deleted

- `apps/web/components/case-ticket-wizard.tsx` (216 lines)
- `apps/web/app/(portal)/cases/[id]/new-ticket/page.tsx` becomes a redirect to `/cases/:id` (the suggested-steps panel and the in-page "New ticket" button now drive it). Alternatively, this route mounts the unified `IntakeWizard` with the case attached — implementation detail; either works.

## 5. Migration plan

Each step is independently shippable, reversible, and produces a passing build.

1. **Add `Service.flowKey`** (nullable) → backfill via script reusing `inferFlow` → enforce `NOT NULL`. Delete `inferFlow`.
2. **Move `PAYLOAD_FIELD_ALIASES` to `@wusuq/shared`**; update both API and web imports.
3. **Add `caseId` + scheduling fields to `CreateTicketIntakeDto`** and unify the create call. `cases.service.ts#createCaseTicket` becomes a forwarder. Delete `CreateCaseTicketDto`, `continueCaseTicket`, the `prisma.ticket.update` for case linkage.
4. **Replace `case-ticket-wizard.tsx`** with the unified `IntakeWizard` mount + Case selector. Delete the old file.
5. **Delete `Hearing` model.** Migration: copy each `Hearing.{scheduledDate, hearingType, outcome, notes, nextDate}` into the most-recently-linked Ticket. For hearings with no linked ticket, write to a synthetic Ticket of flow `judicial_case_information` (decision deferred to implementation pending data inspection).
6. **Add `Case.deletedAt`** + replace hard delete with soft delete + gate queries.
7. **Add `RECOMMENDATIONS_BY_FLOW` constant + `GET /cases/:id/recommendations` endpoint** + Suggested-next-steps UI panel + recommendation filter chip.
8. **Add fill-only write-back + drift detection** + `CONTEXT_DRIFT_DETECTED` / `CONTEXT_RESOLVED` events + Case page banner + dashboard aggregate row.

## 6. Acceptance criteria

- Identical wizard for standalone vs case-linked. Visual diff: only the new Case selector at the top, locked when entering from a Case page.
- A standalone Case Search ticket completing creates/updates a Case with `caseNo`, `court`, `caseYear`, etc. populated. Opening that case shows "Suggested next: Case Information, Case Files."
- A second ticket created against that case via the suggestion has every previously-known field prefilled in the wizard.
- Cancelling that second ticket restores the suggestion.
- A Case Information completion that reports a different `caseNo` does **not** overwrite the case; surfaces a `CONTEXT_DRIFT_DETECTED` event, an Action Center entry, and the Case page banner. Admin clicks "Use ticket value" → field updates, `CONTEXT_RESOLVED` event written.
- `Hearing` model gone. `inferFlow` gone. `case-ticket-wizard.tsx` gone. `CreateCaseTicketDto` gone. `continueCaseTicket` gone.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, existing E2E suites pass.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Hearing-to-Ticket migration fails for hearings with multiple linked tickets or none. | One-shot migration script with a dry-run mode that prints exactly which `Hearing` rows would be merged into which `Ticket` row, run in staging first, manual review of edge cases, fail-fast on ambiguous rows. |
| `Service.flowKey` backfill picks the wrong flow for some services (today's `inferFlow` is fragile). | Backfill script writes a CSV of `(serviceId, name, category, type, inferredFlowKey)` for review before applying. Manual override list supported. |
| `PAYLOAD_FIELD_ALIASES` move from API to shared causes import drift during the transitional commit. | Move + update both call sites in a single PR. Type system catches missed imports. |
| Drift detection produces false positives (case-sensitivity, whitespace, year-as-string-vs-number). | Normalize values (trim, lowercase for free-text fields, parseInt for year fields) before comparison. Helper lives next to `applyTicketCompletionToCase` with unit tests. |
| Recommendation panel adds DB load on every Case page load. | Endpoint is a single `prisma.ticket.findMany({ where: { caseId } })` plus pure-function filtering. Cache per-case for 30s if pressure observed. |
| Deleting `Hearing` model breaks the dashboard's "Today's Hearings" panel built in earlier phase. | Update that panel to query `prisma.ticket.findMany({ where: { scheduledDate: { gte, lte } } })` instead of `prisma.hearing.findMany`. Trivial swap; same fields. |
| Soft-delete on `Case` but hard-delete behaviour expected by callers. | Audit all `prisma.case.findUnique` / `findFirst` / `findMany` call sites; add `where.deletedAt = null` in a single PR before flipping the delete behaviour. |

## 8. Open questions for implementation

- For step 5 (Hearing migration), the exact mapping for hearings without a linked ticket — synthetic ticket of `judicial_case_information`, or skip and accept data loss with audit log? Decide after data inspection.
- For the Case selector "Create new case" path: do we apply ticket-completion write-back logic at *creation* time as well, or only on completion? Recommendation: at creation (the case is born from this ticket's payload), reuse the same `applyTicketCompletionToCase` helper with `isInitialFill: true` to skip drift detection (no existing values to drift from).
- Which existing `TicketStatus` values count as "cancelled" for the recommendation filter? Today the schema has no explicit `CANCELLED`. Need to inspect the enum and either add a `CANCELLED` state or treat `REJECTED` + a soft-delete on Ticket as equivalent.
