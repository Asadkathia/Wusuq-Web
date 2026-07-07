# Workstream E — Rep & Assignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the ticket amount on the Assign screen, give clerks bulk-accept, rebuild the Add-Rep form as a city-first cascade with live courts + payout details, and scope assignment by court tier.

**Architecture:** One migration (User gains `courtLevel` + 6 payout columns). C2/C18 are FE-only on `ticket-board.tsx`. C4/C5 rebuild the rep-create form + its DTO/service (court picked from live `/geo/cities/:id/courts`; tier derived via `courtTierFromCourtType(court.type)` and persisted as `courtLevel`; payout fields staff-only). C3 adds a tier filter to `representativeCandidates` + a matching/others split + auto-assign in the Assign dialog.

**Tech Stack:** NestJS/Prisma, Next.js 16/React 19, `@wusuq/shared`; Jest. Migration → Neon via `db execute` + `migrate resolve` (deploy step), NOT `migrate dev`.

**Spec:** `DOcs/superpowers/specs/2026-07-07-workstream-e-rep-assignment-design.md`.

## Global Constraints

- **Rep = `User` (role `representative`)** — no separate model. Payout + `courtLevel` are columns on `User`.
- **Tier is server-derived, never client-trusted:** rep tier = `courtTierFromCourtType(pickedCourt.type)` at create time → `User.courtLevel` (a `CourtTier` string from `@wusuq/shared` `COURT_TIERS`). Ticket tier = `courtTierFromCourtType(payload.select_court_type)` server-side in `representativeCandidates`.
- **Payout fields are staff-only PII:** `serializeUser` / the `/users` list must NOT expose them to non-staff callers (a rep viewing others, or any consumer). Reuse the shared `PaymentMode` enum (`JAZZ_CASH | EASY_PAISA | BANK_TRANSFER`) for `payoutMethod`.
- **C18 = client-side loop** over the existing `POST /tickets/:id/accept-assignment` (`tickets.clerk`, assignee-bound) — no new backend endpoint. Per-ticket errors surfaced; not silently swallowed.
- **C3 tier is additive scoping, not a hard block** — the city restriction + `forceAssign` override behave exactly as today; tier only orders/groups + auto-selects when exactly one matches.
- **Remove the free-text "Court City"** field; update `representativeCandidates`' matcher to use `city`/`district` (not `courtCity`).
- Migration: committed SQL only; `prisma generate` after schema edits; not `migrate dev`. Run `pnpm --filter @wusuq/shared build` if shared changes; `pnpm typecheck` + `pnpm lint` + tests before each commit. Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- `apps/api/prisma/schema.prisma` + migration — User `courtLevel` + payout columns (Task 1).
- `apps/web/components/ticket-board.tsx` — C2 amount line + C18 clerk accept-all (Task 2); C3 assign dialog (Task 5).
- `apps/api/src/users/dto/create-representative.dto.ts` + `update-user.dto.ts`; `users.service.ts`; user serialization (Task 3).
- `apps/web/components/representatives-board.tsx` — form rebuild + payout + rep-search (Task 4).
- `apps/api/src/tickets/tickets.service.ts` + `tickets.controller.ts` — `representativeCandidates` tier param (Task 5).

Build order: **Task 1 inline** → **Wave 1: Task 2 ‖ Task 3** (file-disjoint) → **Wave 2: Task 4 ‖ Task 5** (file-disjoint; both consume Task 3).

---

### Task 1: Schema — User `courtLevel` + payout columns (C4/C5)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`User` model)
- Create: `apps/api/prisma/migrations/20260707020000_add_user_court_level_payout/migration.sql`

- [ ] **Step 1:** Add to `User`:

```prisma
  courtLevel         String?
  payoutMethod       String?
  payoutBankName     String?
  payoutAccountTitle String?
  payoutAccountNumber String?
  payoutJazzCash     String?
  payoutEasyPaisa    String?
```

- [ ] **Step 2:** Migration SQL:

```sql
-- add_user_court_level_payout
ALTER TABLE "User" ADD COLUMN "courtLevel" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutMethod" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutBankName" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutAccountTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutAccountNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutJazzCash" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutEasyPaisa" TEXT;
```

- [ ] **Step 3:** `cd apps/api && pnpm prisma:generate` (no error).
- [ ] **Step 4:** `cd apps/api && pnpm typecheck` (clean).
- [ ] **Step 5:** Commit — `feat(db): add courtLevel + payout columns to User (C4/C5)`.

---

### Task 2: C2 ticket-amount line + C18 clerk accept-all (FE)

**Files:**
- Modify: `apps/web/components/ticket-board.tsx`

- [ ] **Step 1: C2** — in the Assign dialog (~1329-1417), add a labeled read-only line near the top: **"Ticket amount: {rs(assignTicket.totalAmount)}"** using the file's existing money helper (find how the list row formats `totalAmount` ~1080/1089 and reuse). Distinct from the editable Clerk-Cost box. No backend.
- [ ] **Step 2: C18 selection** — in the clerk view, add a checkbox column for ASSIGNED rows (reuse the `selected`/`pendingSelected` state pattern that's currently `isAdmin`-gated at ~1038-1051, but enable it for the clerk view on `status === 'ASSIGNED'` rows) + a header "select all ASSIGNED" checkbox scoped to the clerk's ASSIGNED rows.
- [ ] **Step 3: C18 accept-all** — add an **"Accept all"** button (shown to clerks when ≥1 ASSIGNED row is selected) that runs `Promise.allSettled(selectedIds.map(id => apiClient.post(\`/tickets/${id}/accept-assignment\`, {})))`, flashes a summary (`n accepted, m failed`), clears the selection, and `loadTickets()`. Reuse the single-accept call shape from `acceptTicket` (~643-660). Guard against concurrent runs with a busy flag.
- [ ] **Step 4: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`); `pnpm test` green.
- [ ] **Step 5: Commit** — `feat(web): Assign-dialog ticket-amount line + clerk Accept-all bulk-accept (C2/C18)`.

---

### Task 3: C4/C5 backend — DTOs + persist + redaction

**Files:**
- Modify: `apps/api/src/users/dto/create-representative.dto.ts`
- Modify: `apps/api/src/users/dto/update-user.dto.ts`
- Modify: `apps/api/src/users/users.service.ts` (`createRepresentative`, `update`, the user serializer)
- Test: `apps/api/src/users/representative-payout.spec.ts` (new)

**Interfaces:**
- Produces: `CreateRepresentativeDto`/`UpdateUserDto` accept `courtLevel?`, `payoutMethod?`, `payoutBankName?`, `payoutAccountTitle?`, `payoutAccountNumber?`, `payoutJazzCash?`, `payoutEasyPaisa?`. `createRepresentative`/`update` persist them. Non-staff user serialization omits the payout fields.

- [ ] **Step 1:** Add to `CreateRepresentativeDto`: `@IsOptional() @IsString() courtLevel?: string;` (optionally `@IsIn(COURT_TIERS)` from `@wusuq/shared`), and the 6 payout fields (`@IsOptional() @IsString()`; `payoutMethod` `@IsOptional() @IsIn(PAYMENT_MODES)`). Remove `courtCity` (or leave it deprecated/unwritten — the form drops it). Mirror into `UpdateUserDto` (read it first — add the same fields).
- [ ] **Step 2: Write the failing test** — read an existing users spec for the harness. Assert: `createRepresentative({ …, courtLevel: 'high', payoutMethod: 'BANK_TRANSFER', payoutBankName: 'Allied', payoutAccountNumber: '123' })` persists those in the `prisma.user.create` data; and the user serializer used by `GET /users` (find `serializeUser` / whatever maps a User to the API shape) **omits** payout fields when the caller is NOT staff (e.g. `isStaffRole(caller.role) === false`) and includes them for staff.
- [ ] **Step 2b: Run → FAIL**.
- [ ] **Step 3: Implement** — persist the fields in `createRepresentative` + `update`. In the serializer, gate the payout fields behind a staff check (thread the caller role to the serializer if it isn't already; if the `/users` list is already staff-only via `@RequirePermissions('users.read')`, confirm reps/consumers can't reach it at all — if so, the redaction requirement is satisfied by the route guard, but STILL avoid returning payout fields on any endpoint a rep can hit about themselves-plus-others; document which path is the guarantee).
- [ ] **Step 4: Run → PASS**, full API suite, `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 5: Commit** — `feat(users): representative courtLevel + payout fields, staff-only (C4/C5)`.

---

### Task 4: C4/C5 frontend — Add-Rep cascade + live courts + payout + search

**Files:**
- Modify: `apps/web/components/representatives-board.tsx`

**Interfaces:**
- Consumes: Task 3's DTO fields; `/geo/provinces|districts|cities` (already used) + `/geo/cities/:id/courts` (the intake court source); `courtTierFromCourtType` from `@wusuq/shared`.

- [ ] **Step 1: Reorder + live courts** — restructure the create/edit modal (~513-663) to the cascade order: Province → District → City/Tehsil → Service → **Court** → Name → Email → Phone → Password (+ Address + payout). Replace the hardcoded `COURTS` catalog court picker with a **`/geo/cities/:id/courts`** fetch keyed on the selected city (mirror the intake wizard's courts fetch — grep `intake-wizard.tsx` for `cities/${...}/courts`), grouping by `court.type`. Keep the hardcoded `SERVICES` list as a top-level filter/label if useful, or drop it in favor of the court `type` groups.
- [ ] **Step 2: Derive + submit tier** — when a court is picked, compute `courtLevel = courtTierFromCourtType(pickedCourt.type)` (import from `@wusuq/shared`) and include `courtLevel` (+ the court name in the existing `court` field) in the create/update payload. Persist the selected city id/name in the existing `city` field.
- [ ] **Step 3: Remove Court City** — delete the `textField('Court City', 'courtCity')` line (~567) and the `courtCity` key from `FormState`/`emptyForm`/the submit payload.
- [ ] **Step 4: Payout section** — add a payout block to the form: a method `<select>` (the 3 `PaymentMode` values) that reveals the relevant account fields (bank → bankName/accountTitle/accountNumber; JazzCash/EasyPaisa → the number). Bind to `payoutMethod`/`payoutBankName`/`payoutAccountTitle`/`payoutAccountNumber`/`payoutJazzCash`/`payoutEasyPaisa` in the form state + payload. Reuse the shape/labels of `payment-method-details.tsx` (as inputs, not read-only display).
- [ ] **Step 5: Rep-search (minor)** — extend the `filtered` predicate (~212-215) to also match `(r.court ?? '')` and `(r.serviceFocus ?? '')`.
- [ ] **Step 6: Typecheck + lint** (`cd apps/web && pnpm typecheck && pnpm lint`); `pnpm test` green.
- [ ] **Step 7: Commit** — `feat(web): Add-Rep city-first cascade + live courts + tier + payout; search by court/focus (C4/C5)`.

---

### Task 5: C3 — tier-scoped assignment

**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` (`representativeCandidates`)
- Modify: `apps/api/src/tickets/tickets.controller.ts` (candidates endpoint)
- Modify: `apps/web/components/ticket-board.tsx` (Assign dialog)
- Test: `apps/api/src/tickets/representative-tier-scope.spec.ts` (new)

**Interfaces:**
- Consumes: `User.courtLevel` (Task 1/3/4); `courtTierFromCourtType` (`@wusuq/shared`). Produces: candidates carry a `tierMatch: boolean` (or grouped `{ matching, others }`) relative to the ticket's tier.

- [ ] **Step 1: Backend** — `representativeCandidates` gains an optional `tier?: CourtTier`. When present, keep the existing city-scoping, and tag/partition each candidate by `rep.courtLevel === tier` → return a `tierMatch` boolean per candidate (also select `courtLevel`/`court`/`serviceFocus`). The controller endpoint derives the ticket's tier server-side: accept an optional `ticketId` (or the already-passed `city`) and compute `courtTierFromCourtType(payload.select_court_type)` from the ticket — do NOT accept a client tier. (If the current endpoint only takes `city`, add a `tier` query param that the FE fills from the ticket it already holds — acceptable since the FE has the ticket payload; but prefer server derivation from `ticketId` if easy.)
- [ ] **Step 2: Test** — a High-Court ticket + reps of mixed `courtLevel` → candidates for `courtLevel==='high'` reps have `tierMatch:true`, others `false`; city-scoping still applies; no tier passed → all `tierMatch` absent/false (back-compat).
- [ ] **Step 2b: Run → FAIL → implement → PASS.**
- [ ] **Step 3: FE Assign dialog** — add `court`/`courtLevel`/`tierMatch` to the FE `Representative` type (~85-90). Show **matching-tier reps first**; render an **"Show others"** toggle that reveals `tierMatch:false` reps (separate from the existing city-override toggle). Surface the rep's court/tier in the option label. **Auto-assign when exactly one matching-tier rep**: in `openAssign`/after the candidates load, if exactly one `tierMatch` candidate, pre-select its id.
- [ ] **Step 4: Typecheck + lint (both apps); full API suite + web tests green.**
- [ ] **Step 5: Commit** — `feat(tickets): tier-scoped rep assignment — matching first, show others, auto-assign-when-one (C3)`.

---

## Self-Review

**Spec coverage:** C2 → Task 2 Step 1. C18 → Task 2 Steps 2-3 (+ rep-search → Task 4 Step 5). C4 → Task 1 + Task 3 + Task 4 (Steps 1-3). C5 → Task 1 + Task 3 + Task 4 (Step 4). C3 → Task 1 (column) + Task 5. All mapped.

**Placeholder scan:** "read the intake court fetch / existing users spec / update-user.dto first" are explicit verification steps against named code, not TODOs. Test steps carry concrete assertions.

**Type consistency:** `courtLevel` (a `CourtTier` string) is the same field name across schema (Task 1), DTO (Task 3), form (Task 4), and candidates (Task 5). Payout field names identical across Task 1/3/4. `courtTierFromCourtType` is the single tier mapper on both the rep-create (Task 4) and assignment (Task 5) sides. `tierMatch` defined in Task 5 backend, consumed in Task 5 FE.

## Parallelization (subagent-driven)
- **Task 1** inline (schema foundation).
- **Wave 1:** Task 2 (ticket-board C2/C18) ‖ Task 3 (users backend) — file-disjoint.
- **Wave 2 (after Task 3 merged):** Task 4 (representatives-board) ‖ Task 5 (ticket-board C3 + tickets.service/controller). File-disjoint (representatives-board vs ticket-board/tickets.*). Task 5 also needs Task 2's ticket-board changes merged first (same file) — so **merge Wave 1 before starting Wave 2**.

## Verification (end-to-end)
1. `cd apps/api && pnpm test && pnpm typecheck` + `cd apps/web && pnpm typecheck && pnpm lint` clean.
2. **DB (deploy step):** apply `20260707020000_add_user_court_level_payout` to Neon via `db execute` + `migrate resolve --applied` (not `migrate dev`).
3. Manual: create a rep (city→service→live court → tier persisted; payout entered); the Assign dialog shows the ticket amount, lists tier-matching reps first with "Show others", auto-selects when one matches; a clerk multi-selects ASSIGNED tickets → Accept all; rep-search matches a court name; payout details don't appear to non-staff.
