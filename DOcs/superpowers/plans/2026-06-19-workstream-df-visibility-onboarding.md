# Workstreams D / F — Visibility & Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (D) richer consumer ticket detail, clerk listing detail, clerk name+earnings, and sidebar count badges; (F) capture consumer address at profile completion and richer case-file upload fields.

**Architecture:** D1 is frontend-only (the consumer `findOne` already returns `history` + `formPayload`; only the UI is missing). D2 eager-loads the `Case` relation + assignment status into the ticket list and surfaces them in the clerk view. D3 relabels generic "Clerk" with the assigned rep's name and shows an internal-only earnings aggregate. D4 adds a role-scoped `GET /tickets/counts` and renders per-status nav badges. F1 extends the post-login profile step + `completeProfile` to persist a structured address. F2 adds intake-style case fields to the case-file upload form + DTO + `PersonalFile` metadata.

**Tech Stack:** NestJS 11 + Prisma, Next.js 16 / React 19, TypeScript monorepo (`shared → api → web`), Jest (plain mocks, `import { jest } from '@jest/globals'`), Playwright.

## Global Constraints

- Build order `shared → api → web`. API tests: `cd apps/api && pnpm test -- <pattern>` (ESM); `jest.fn` specs need `import { jest } from '@jest/globals'`; no `Test.createTestingModule`.
- Permissions decorator `../roles-permissions/decorators/permissions.decorator`; acting user `@CurrentUser() actor: JwtUser | undefined` (id `actor?.sub`).
- React 19: effect setState wrapped in `startTransition`; stale-response guard via a generation ref.
- **Consumer redaction is sacred.** `redactTicketForConsumer` strips `clerkCost/defaultClerkCost/clerkReport/dispatchProofUrl` + rep phone + hides documents pre-COMPLETED. D3's clerk earnings is INTERNAL-ONLY — it must never reach the consumer board (`ConsumerTicketDetail`), only the admin/clerk `TicketDetailPanel`/finance views.
- `TicketsService` constructor is 8 params (settingsService?, promosService? optional).
- Migrations additive; dev DB uses the manual `migrate diff → db execute → migrate resolve` workflow (drift + no shadow DB), NOT `migrate dev`.
- Nav: `nav.tsx` has static `navItems` + `clerkNavItems` + `useStaffNavItems()`; `NavItem` type is in `ui/shell-nav.tsx`. Portal nav has no per-item permission gating (portal guard + API enforce).

---

### Task D1: Consumer ticket detail — timeline + case details + delivery (web only)

**Files:** Modify `apps/web/components/consumer-ticket-board.tsx` (`ConsumerTicketDetail` at `:578`). Reference patterns: `apps/web/components/ticket-detail-panel.tsx` (`renderPayload` at `:113`, status timeline at `:562-587`).

**Context:** The consumer `GET /tickets/:id` response ALREADY includes `history` (status transitions) and `formPayload` (the case data the consumer entered) — `redactTicketForConsumer` does not strip them. This task is pure rendering; no API change.

- [ ] **Step 1:** Add a **status timeline** section to `ConsumerTicketDetail` rendering `ticket.history` (from→to→createdAt) as a vertical progress timeline. Do NOT show internal staff `note` text that could leak ops detail — show the transition + timestamp (mirror the admin `StatusTimeline` shape but omit any clerk-only note).
- [ ] **Step 2:** Add a **"Case details"** section rendering the consumer's submitted `formPayload` via a consumer-safe key→label map (case no, year, title, court level, bench, etc.) — reuse/adapt the admin `renderPayload` helper but only show the consumer's own intake fields (these are the consumer's own data, safe to show). Skip empty values.
- [ ] **Step 3:** Add a **delivery address & method** section for physical-document flows (parse `formPayload.delivery_address`/`delivery_mode`/`delivery_method`) confirming where/how documents are delivered. Hide for digital flows.
- [ ] **Step 4:** `pnpm --filter web typecheck && pnpm --filter web build` → pass. Manual note: a consumer ticket shows timeline + case details + (physical) delivery.
- [ ] **Step 5:** Commit `feat(web): complete consumer ticket detail (timeline + case details + delivery)`.

---

### Task D2: Clerk listing — case number, hearing date, sub-states (api + web)

**Files:** Modify `apps/api/src/tickets/tickets.service.ts` (`findAll` at `:190`, the list `include` at `:261` + the returned row mapping). Modify `apps/web/components/ticket-board.tsx` (clerk columns). Test: `apps/api/src/tickets/findall-case.spec.ts`.

**Context:** `findAll` already returns `clerkApprovalStatus`, `deliveryStatus`, `assignedRepresentative`. It does NOT include the `Case` relation (caseNo/court/caseYear) or the assignment `status` sub-state (ACTIVE/ACCEPTED).

- [ ] **Step 1 (failing test):** assert `findAll` returns, per row, `case: { caseNo, court, caseYear }` (when `caseId` set) and `assignmentStatus` (the active assignment's `status`). Mock `prisma.ticket.findMany` to return a ticket with a `case` relation + an assignment with `status:'ACCEPTED'`; assert the mapped row exposes them.
- [ ] **Step 2:** `pnpm test -- findall-case` → FAIL.
- [ ] **Step 3:** In `findAll`, add `case: { select: { caseNo: true, court: true, caseYear: true } }` to the `include` (only fetched when `caseId` is set — Prisma returns null otherwise), and select the assignment `status`. Map into the returned row: `case: ticket.case ?? null`, `assignmentStatus: ticket.assignments[0]?.status ?? null`. Keep `scheduledDate`/`nextDate`/`hearingType` in the row (next-hearing date).
- [ ] **Step 4:** `pnpm test -- "findall-case|tickets"` → GREEN. `pnpm typecheck` → PASS.
- [ ] **Step 5 (web):** In the clerk view of `ticket-board.tsx`, add columns/badges: **next-hearing date** (`scheduledDate`/`nextDate`), **case number** (`case?.caseNo`), **assignment acceptance** (`assignmentStatus` ACTIVE vs ACCEPTED), and **clerk-approval + delivery sub-status** (`clerkApprovalStatus`, `deliveryStatus`). Keep `clerkCost` hidden in the list (audit rule). `pnpm --filter web build` → pass.
- [ ] **Step 6:** Commit `feat(tickets): clerk listing surfaces case no, hearing date, and sub-states`.

---

### Task D3: Clerk name + earnings (web)

**Files:** Modify `apps/web/components/ticket-detail-panel.tsx` (the "Clerk Cost" section `:253-259`, the charges breakdown `:341`) and `apps/web/components/ticket-board.tsx` (the Review & Complete / finalize dialog).

**Context:** The assigned rep's name is `ticket.assignments[0]?.representative?.name`. Clerk earnings = `clerkCost` + the clerk-reported amounts (`attestedCharges + nonAttestedCharges + printingCharges + deliveryCharges`). Both are INTERNAL-ONLY (already redacted from consumers).

- [ ] **Step 1:** In `TicketDetailPanel` (admin/clerk view), replace the generic "Clerk Cost" heading/label with the assigned rep's **name** (e.g. "Clerk: <name>") where available, falling back to "Clerk" when unassigned. Keep the cost value.
- [ ] **Step 2:** Add a **"Clerk earnings"** line (internal-only, in the admin/clerk view — NOT the consumer board) = `clerkCost + attestedCharges + nonAttestedCharges + printingCharges + deliveryCharges`, attributed to the named clerk. Show it in the charges breakdown section and in the **Review & Complete** finalize dialog (`ticket-board.tsx`) so the admin sees what the clerk will earn at finalize.
- [ ] **Step 3:** Verify the consumer board (`ConsumerTicketDetail`) does NOT render earnings/clerk name beyond what's already shown (it uses the redacted response — confirm no leak).
- [ ] **Step 4:** `pnpm --filter web typecheck && pnpm --filter web build` → pass.
- [ ] **Step 5:** Commit `feat(web): show clerk name + earnings in ticket detail and finalize`.

---

### Task D4: Sidebar status count badges (api + web)

**Files:** Create `apps/api/src/tickets/...` count endpoint (in `tickets.controller.ts` + `tickets.service.ts`). Modify `apps/web/components/nav.tsx` + `apps/web/components/ui/shell-nav.tsx` (NavItem count rendering). Test: `apps/api/src/tickets/counts.spec.ts`.

- [ ] **Step 1 (failing test):** `TicketsService.countsByStatus(scope)` returns `{ [status]: number }` — role-scoped (clerk → assignments for the rep; staff/admin → all non-archived; consumer → own). Mock `prisma.ticket.groupBy` (or count per status) and assert the shape.
- [ ] **Step 2:** `pnpm test -- counts` → FAIL.
- [ ] **Step 3:** Implement `countsByStatus` using `prisma.ticket.groupBy({ by: ['status'], where: <scope, archivedAt: null>, _count: true })`. Add `GET /tickets/counts` (perm `tickets.read`) that derives the scope from the caller (clerk → `representativeId = actor.sub`; consumer-class → `consumerId = actor.sub`; staff → all) and returns the map.
- [ ] **Step 4:** `pnpm test -- "counts|tickets"` → GREEN. `pnpm typecheck` → PASS.
- [ ] **Step 5 (web):** Extend `NavItem` (in `shell-nav.tsx`) with an optional `count?: number` (and/or a per-sub-item count). In `nav.tsx`, fetch `GET /tickets/counts` on mount (`startTransition`), and render a live count badge on each ticket-status nav item (the `/tickets/<status>` sub-items) + a total on the Tickets group. Refresh on navigation. `pnpm --filter web build` → pass.
- [ ] **Step 6:** Commit `feat(tickets): sidebar status count badges`.

---

### Task F1: Capture address at profile completion (api + web)

**Files:** Modify `apps/web/app/(auth)/consumer/login/steps/profile-step.tsx`; the login-flow hook that calls `completeProfile`; `apps/api/src/auth/auth.service.ts` (`completeProfile` at `:220`) + its DTO. Test: `apps/api/src/auth/complete-profile-address.spec.ts`.

**Context:** `User.address` exists but is never populated. `completeProfile` currently accepts `name`, `cityName`, `consumerKind`. The profile step already has a city picker + consumer-kind.

- [ ] **Step 1 (failing test):** assert `completeProfile(userId, { ..., address, province, district, postalCode })` persists those fields onto the User (`prisma.user.update` data includes `address`). Mock prisma; capture the update data.
- [ ] **Step 2:** `pnpm test -- complete-profile-address` → FAIL.
- [ ] **Step 3:** Add optional `address?`, `province?`, `district?`, `postalCode?` to the `completeProfile` DTO and persist them (`...(dto.address ? { address: dto.address } : {})`, etc.) in `auth.service.completeProfile`.
- [ ] **Step 4 (web):** In `profile-step.tsx`, add structured address inputs: reuse the existing geo pickers (province/district/city — find the components the city picker uses) + a street/area text line; compose into `address` and pass the geo fields. Send them in the `completeProfile` call (extend the login-flow hook). Validation: address optional or required per the existing step's validity rule — keep it optional unless the owner wants it required.
- [ ] **Step 5:** `pnpm test -- complete-profile-address` GREEN; `pnpm typecheck` + `pnpm --filter web build` → pass.
- [ ] **Step 6:** Commit `feat(onboarding): capture consumer address at profile completion`.

---

### Task F2: Richer case-file upload fields (api + web)

**Files:** Modify `apps/api/src/personal-files/dto/upload-case-file.dto.ts`; the personal-files service/controller that handles the upload; `apps/web/components/case-files-board/upload-drawer.tsx` (+ its cohort/caption form). Schema: add case-meta to `PersonalFile`. Test: `apps/api/src/personal-files/upload-case-meta.spec.ts` (if the service is unit-testable; else verify via typecheck).

**Context:** The case-file upload currently captures `serviceId/cityId/courtName/courtType/caption`. The owner wants intake-wizard-style case fields (year, case no, case title, court level, etc.).

- [ ] **Step 1:** Decide the metadata shape. Add to `PersonalFile` a nullable `caseMeta Json?` column (single additive field holding the extra case fields) — simpler than many columns. Migration via the manual workflow.
- [ ] **Step 2:** Extend `UploadCaseFileDto` with the new optional case fields (`caseNo?`, `caseYear?`, `caseTitle?`, `courtLevel?`, `caseType?` — mirror the intake field names) and persist them into `PersonalFile.caseMeta` on upload.
- [ ] **Step 3 (web):** In `upload-drawer.tsx`, add inputs for the case fields (year, case no, title, court level, case type) alongside the existing cohort selection, and send them in the multipart form. Reuse intake field styling where practical.
- [ ] **Step 4:** `pnpm typecheck` (api + web) + `pnpm --filter web build` → pass; `cd apps/api && npx prisma migrate status` → up to date.
- [ ] **Step 5:** Commit `feat(case-files): richer case metadata on upload (year, case no, court, …)`.

---

## Self-Review
- **D coverage:** D1 (consumer detail, FE-only), D2 (clerk listing api+web), D3 (clerk name+earnings), D4 (sidebar badges api+web). ✓
- **F coverage:** F1 (address), F2 (case-file fields). ✓
- **Redaction safety:** D3 earnings is internal-only (D3 Step 3 verifies no consumer leak); D1 only renders data already in the consumer response.
- **Type consistency:** the `case`/`assignmentStatus` row shape (D2) is produced in the API and consumed in the clerk columns; `count` on NavItem (D4) defined in shell-nav and consumed in nav.tsx; `address` field (F1) identical across DTO/service/web.

## Open items / notes
- D4: a `GET /tickets/counts` endpoint — keep it cheap (one `groupBy`); the nav refreshes on navigation, not via polling, to avoid load.
- F1: whether address is REQUIRED at onboarding is an owner choice — default optional. If required, also gate the profile-step validity.
- F2: `caseMeta Json?` keeps the schema simple; if the owner later wants to query/filter by these fields, promote to columns.
- D3: the exact earnings components (`clerkCost + attested + nonAttested + printing + delivery`) match the brainstorm decision; confirm with the owner if they want delivery excluded.
