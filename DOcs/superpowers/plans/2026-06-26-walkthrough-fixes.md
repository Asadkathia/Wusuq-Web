# Wusuq Walkthrough Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task below names exact files/lines, the change, and how to verify; at execution time expand each into TDD steps (failing test → implement → pass → commit).

**Goal:** Fix the defects and ship the UX/behavior changes the owner demonstrated in the 2026-06-25 four-part screen-recording walkthrough of the full ticket lifecycle (consumer intake → admin assign → clerk complete → admin complete).

**Architecture:** Source-of-truth tightening. Three themes recur: (1) surfaces hand-roll totals/redaction instead of trusting `Ticket.totalAmount` + proper server-side redaction; (2) the lifecycle is artificially payment-gated at *assign* when the owner wants pay-at-end (money gate belongs only at DELIVERED); (3) clerk-entered data and case payloads are either dumped raw (ids/enums) or dropped silently (page counts). Fixes are mostly small and localized; two are larger features (structured case-record card; JazzCash/EasyPaisa payment settings + schema).

**Tech Stack:** NestJS 11 + Prisma (apps/api), Next.js 16 (apps/web), shared TS (packages/shared). Jest (API unit), Playwright (E2E).

## Global Constraints

- **Never read-then-write `Ticket.status`** — every transition stays a conditional `updateMany({ where: { id, status: expectedFrom } })` with history in the same `$transaction`; `count===0 → ConflictException` (audit 2.1). Widening *allowed source states* is fine; the conditional-write contract must not change.
- **Clerk cost is internal-only** — never include `clerkCost`/clerk earnings in any consumer-facing total or surface.
- **`computeTicketTotal` (@wusuq/shared) is the only ticket-total formula**; `Ticket.totalAmount` is the only value any UI renders as "Total". Never hand-sum components into a displayed Total.
- **`deriveCurrency` / `buildPricingResolveInput` / `computeTicketTotal`** are single sources — add inputs there, never at call sites.
- Currency-touching paths must thread `currency`; ledger rows carry the ticket's currency, never hardcoded PKR.
- Run `pnpm lint && pnpm typecheck` before every commit; respect the React 19 `set-state-in-effect` rule (use `startTransition` for setState-in-effect, per CLAUDE.md).
- Root-cause evidence for every item is in the session audit `root-causes.md` (scratchpad) — file:line references below are from it.

---

## Workstream 1 — Money correctness & redaction (HIGHEST PRIORITY)

Security/correctness-flavored. Do this first.

### Task 1.1 — Stop leaking consumer totals + blended earnings to representatives (Bug #2)
**Files:**
- Modify: `apps/api/src/tickets/tickets.service.ts` — `findAll` redaction branch (~`:304-326`) and `findOne` representative branch (~`:418-434`)
- Modify: `apps/web/components/ticket-board.tsx` (~`:893-905` money line) and `apps/web/components/ticket-detail-panel.tsx` (~`:271-293` earnings)
- Test: `apps/api/test/tickets.redaction.spec.ts` (extend existing redaction tests)

**Change:**
- API `findAll`: when caller is a representative (`forConsumer` true for reps per controller `:77-84`), strip consumer money fields from each row — `totalAmount`, `amountPaid`, `serviceCost` and the per-charge columns — leaving only the rep's own `clerkCost`. Mirror the existing `clerkCost`/`assignmentStatus` redaction already there.
- API `findOne`: add a representative redaction path (the branch currently does `return ticket;` unredacted at ~`:434`). Strip consumer PII + money/charge fields + clerk-earnings inputs, keep the rep's own `clerkCost`.
- FE list: gate the `${rs(total)} · ${rs(due)} due` line behind `!isClerk` (the row already has `isClerk` at `ticket-board.tsx:152`).
- FE detail: in the clerk view show only the **Clerk Cost** line; do not render `computeClerkEarnings` (`ticket-detail-panel.tsx:114-125,271-289`).

**Verify:** Jest asserts a representative-scoped `findAll`/`findOne` response has no `totalAmount`/`amountPaid`/consumer PII but retains `clerkCost`. Manually: impersonate a rep → Waiting Approval list shows no "Rs 2,750 · due"; detail shows only Clerk Cost, not "earnings".

### Task 1.2 — Admin ticket-detail "Total" must use `totalAmount`, not a hand-sum incl. clerk cost (Bug #5)
**Files:** Modify `apps/web/components/ticket-detail-panel.tsx` (~`:101-111` `totalCharges`, `:393` Total render, `:399` Remaining)
**Change:** Render `ticket.totalAmount` as the customer-facing "Total" (and base "Remaining" on it). Remove `+ clerkCost` from any displayed total; keep clerk cost only in the separate internal earnings line (`computeClerkEarnings`, `:114-125`). Tax is already inside `totalAmount`, so this also fixes the omitted-tax side.
**Verify:** For the demo ticket admin Total shows **3,510** (matching consumer), not 3,700. Clerk earnings still shown as its own internal line.

### Task 1.3 — Show the tax line on the consumer receipt (Bug #6)
**Files:** Modify `apps/web/components/consumer-ticket-board.tsx` (~`:666-675` charges array, `:818-833` render)
**Change:** Add a `['Tax (${taxRate*100}%)', Number(ticket.taxAmount || 0)]` row to the `charges` array, gated on `taxAmount > 0`, rendered before the Total. `taxAmount`/`taxRate` are already returned to the consumer (not redacted, `tickets.service.ts:459-462`).
**Verify:** Consumer receipt line items (Service 2,300 + Delivery 400 + Printing 100 + Attested 200 + **Tax 510**) now sum to Total 3,510.

### Task 1.4 — Stop notifying the impersonated user on admin support session (Bug #3)
**Files:** Modify `apps/api/src/auth/auth.service.ts:209-211`
**Change:** Remove (or re-target to admins only) the `dispatcher.authImpersonationStarted(targetUserId, actor.email)` call that creates an in-app notification + email addressed to the impersonated user ("Admin access to your account — … started a support session on your account", template `notification-templates.ts:136-139`, dispatcher `notification-dispatcher.service.ts:538-549`). The `AuditLog` row written at `auth.service.ts:200-207` already preserves the compliance trail, so transparency is not lost.
**Verify:** Starting an impersonation session no longer produces a notification/email to the impersonated user; the `AUTH_IMPERSONATE` audit row is still written.

---

## Workstream 2 — Currency (Bug #1)

The demo account is a **legacy** consumer self-signup created before the 2026-06-23 country-pricing commit, so signup never stamped currency → schema default PKR. `deriveCurrency` itself is correct.

### Task 2.1 — Confirm + remediate the affected account(s)
**Files:** Modify `apps/api/scripts/backfill-user-currency.ts`
**Change:** Add an opt-in branch (e.g. `--rederive-legacy`) that, for users created before `2026-06-23`, re-derives currency from their stored `phone` **even if active** (current script grandfathers active users at `:19-32`). Log every change. Keep the default run safe (no behavior change without the flag).
**Verify (do first):** DB check this user's `createdAt` + `currency` + `phone` to confirm the pre-feature inference; then dry-run the script and confirm it flips the `+1…` account to USD.

### Task 2.2 — Forward fix: phone-less international signup must not silently become PKR
**Files:** Modify `apps/web/lib/countries.ts:9` (`DEFAULT_COUNTRY_CODE`) and/or `apps/web/app/(auth)/consumer/signup/page.tsx`
**Change:** Don't default the signup country picker to `PK` for everyone. Either require an explicit country selection, or geo-default it. This prevents a phone-less signup from deriving PKR via `deriveCurrency`'s country fallback (`packages/shared/src/index.ts:213`).
**Verify:** A signup with US country + no phone results in `User.currency='USD'`.

### Task 2.3 (hardening) — derive currency on admin-create paths
**Files:** Modify `apps/api/src/users/users.service.ts` (`create` ~`:70-83`, `createRepresentative` ~`:100-115`, `update` ~`:134-147`)
**Change:** Set `currency: deriveCurrency({ phone, country })` on create; on `update`, re-derive only while the account is inactive (respect "lock once active"). Not the cause of the demo record but a real gap.
**Verify:** Jest: admin-creating a consumer with a `+1` phone yields `currency='USD'`.

---

## Workstream 3 — Lifecycle: pay-at-end, assignment scoping, accept, dispatch, rep landing

### Task 3.1 — Pay-at-end: allow assign directly from UNPAID (owner requirement)
**Files:** Modify `apps/api/src/tickets/tickets.service.ts:167` (transition map) and `apps/web/components/ticket-board.tsx:1051` (Assign button render)
**Change:**
- Transition map: `UNPAID: ['PAID', 'ASSIGNED'],` (single source used by the `assign` precheck `:1188` and `updateStatus` `:969`). The conditional `updateMany` (`:1235`, `where:{id,status:ticket.status}`) is unchanged → audit 2.1 safety preserved.
- FE: render the single Assign button for `status === 'UNPAID' || status === 'PAID'`. Bulk-assign already shows on UNPAID; with the map change those tickets stop landing in `assignBulk`'s `skipped`.
- No payment precondition is added to `assign` (it has none). The money gate stays at DELIVERED (`updateStatus` `:976`, `overrideStatus` `:1126-1140`, auto-deliver `reviewAndComplete` `:1897-1901`). Wallet dues + FIFO auto-settlement already handle unpaid-but-completed tickets (`wallet.service.ts:366-379,519-619`) — no change.
**Verify:** Jest: `assign` succeeds from an UNPAID ticket; `updateStatus`→DELIVERED still throws "Final payment required" when unpaid. Manually: assign an UNPAID ticket without overriding to PAID; complete it; consumer still owes; DELIVERED blocked until paid.

### Task 3.2 (cosmetic follow-up to 3.1) — lifecycle strip handles skipped PAID
**Files:** Modify `apps/web/components/consumer-ticket-board.tsx:362-364`
**Change:** Treat any status whose `LIFECYCLE.indexOf` ≥ ASSIGNED as having passed PAID, so the PAID pip doesn't render as "not reached" on a UNPAID→ASSIGNED jump. Timeline (`:911-924`) needs no change (it truthfully shows "assigned from Unpaid").
**Verify:** A pay-at-end ticket's consumer lifecycle strip shows PAID as passed.

### Task 3.3 — Scope the clerk dropdown to the ticket's city (Bug #4, owner requirement)
**Files:** Modify `apps/api/src/tickets/tickets.service.ts:1301-1326` (`representativeCandidates`) and `apps/web/components/ticket-board.tsx` (Assign modal, ~`:1157`)
**Change:** Honor the `city` filter the FE already sends (`:434`). Default the list to reps whose `courtCity`/`city` matches the ticket location (case-insensitive includes-both-ways, the same matching `assign` uses at `:1198-1205`). **Keep the existing "Override city restriction and assign anyway" checkbox** to reveal the full pool when no local clerk exists (this is why the earlier hard filter was reverted — it emptied the dropdown). Optionally still return non-matching reps but flagged/disabled.
**Verify:** Assigning an Islamabad ticket lists only Islamabad reps by default; ticking override reveals all; assigning a non-local rep without override still 409s.

### Task 3.4 — Fix accept-assignment race + green-styled error (Bug #10)
**Files:** Modify `apps/web/components/ticket-detail-panel.tsx:71-82` (`handleAccept`) and `apps/web/components/ticket-board.tsx:505-514` (`acceptTicket`), `:1805-1807` (banner color)
**Change:** After the drawer's accept succeeds, notify the parent board to `loadTickets()` (callback/onChange) so the list row leaves ASSIGNED and the user can't double-fire. Treat the "Only ASSIGNED tickets can be accepted" 400/409 as a benign "already accepted — refreshing" rather than an error. Replace the substring color heuristic (`includes('failed')||includes('select')`) with an explicit success/error flag set by each handler.
**Verify:** Accept from the drawer → list updates, no stale ASSIGNED row, no false error; a genuine error renders red.

### Task 3.5 — Give clerks a surface to dispatch completed physical tickets (Bug #7)
**Files:** Modify `apps/web/components/nav.tsx` (`buildClerkItems` ~`:87-114`)
**Change:** Add a clerk nav item to `/tickets/completed` (e.g. "Ready to Dispatch", count `counts['COMPLETED']`). The board already renders "Mark Dispatched" for `isClerk && status==='COMPLETED' && delivery && deliveryStatus!=='DISPATCHED'` (`ticket-board.tsx:1038-1047`); the API already returns COMPLETED tickets to reps and `dispatchDelivery` is correct (`tickets.service.ts:2000-2025`). Only the nav link is missing.
**Verify:** As a clerk with a COMPLETED physical ticket, the new nav item shows it and "Mark Dispatched" works → `deliveryStatus=DISPATCHED`.

### Task 3.6 — Land representatives on their work queue, not the admin dashboard (rep-dashboard 403)
**Files:** Modify `apps/web/app/page.tsx:40` (post-login redirect) and `apps/web/components/nav.tsx:88-89` (rep nav)
**Change:** Add a representative branch that routes reps to `/tickets/assigned` (My Assigned Tickets) instead of `/dashboard`; remove/redirect the rep "Dashboard" nav item. The `/dashboard/summary` 403 itself is correct RBAC (reps lack `reports.read`) and stays.
**Verify:** Logging in as a representative lands on Assigned Tickets with no "Insufficient permissions" screen.

---

## Workstream 4 — Clerk ↔ admin visibility

### Task 4.1 — Admin "Review & Complete" shows ALL clerk-entered values (Bug #14, owner requirement)
**Files:**
- Schema: `apps/api/prisma/schema.prisma` (Ticket or TicketClerkReport) — add `noOfPages Int?`, `costPerPage Decimal?`
- Modify: `apps/api/src/tickets/tickets.service.ts` (`submitClerkCosts` persist ~`:2116-2125`; ensure `findOne` returns the new cols + existing `clerkReport`/`documents`/`clerkReceiptUrl`)
- Modify: `apps/api/src/tickets/dto/finalize-remainder.dto.ts` (+`additionalCharges`) and `finalizeRemainderCore` (~`:2553`) so admin can view/edit it
- Modify: `apps/web/components/ticket-board.tsx` Finalize dialog (~`:1638-1709`, `FinalizeForm` `:213-218`)
- Migration: non-destructive `db execute` + `migrate resolve --applied` (Neon caveat per CLAUDE.md)
**Change:**
- Persist `noOfPages`/`costPerPage` (currently computed-then-discarded, `tickets.service.ts:2076-2079`); return them in `findOne`.
- In the Review & Complete dialog: render the **page breakdown** read-only ("10 × 5 = PKR 50"), add **Additional Cost** (view+edit, thread through `FinalizeRemainderDto`), make the **clerk receipt** a clickable link (currently boolean text `:1651-1653`), and list the uploaded **documents** + **clerk report** (already in the `findOne` response, just not rendered).
**Verify:** Admin completing the demo ticket sees pages=10, cost/page=5, additional cost, the receipt link, and uploaded docs — all the clerk's inputs.

### Task 4.2 — Hide raw ids/enum keys on ticket-detail screens (Bug #11, owner confirmed)
**Files:** Modify `apps/web/components/ticket-detail-panel.tsx:127-140` (`renderPayload`) and `apps/web/components/consumer-ticket-board.tsx:591,748-752` (enum value)
**Change:** Give the admin/clerk `renderPayload` an allowlist + label map + value humanizer (reuse the consumer `PAYLOAD_LABEL` pattern). Exclude id/system keys (`*_id`, `source`, `request_id`, `parent_ticket_id`). Humanize enum values so `doc_petition_plus_complete_order` → a readable bundle name on both admin and consumer.
**Verify:** Ticket-detail screens no longer show "City Id: cmpkl…", "Select Court Id…", "Source: next-web-intake", or raw bundle enum values.

### Task 4.3 — Remove duplicate "City" row (Bug #12)
**Files:** Modify `apps/web/components/consumer-ticket-board.tsx:570-592,740-753` (and confirm admin side via 4.2's allowlist)
**Change:** Don't surface `select_court_city` as a separate Case-Details row when `city` is present (drop it from the label map, or de-dup by resolved label in the render loop). Intake writes both keys at `intake-wizard.tsx:1131-1132`.
**Verify:** Case Details shows "City: Islamabad" once.

---

## Workstream 5 — Intake wizard & delivery

### Task 5.1 — Fix regenerate wizard hanging on "Loading courts…" (Bug #9)
**Files:** Modify `apps/web/components/intake-wizard.tsx` regenerate prefill effect (~`:876-936`)
**Change:** After setting `geoIds.cityId` in the regenerate path, fire the `/geo/cities/${city_id}/courts` fetch with the `cityCourtsReqRef` stale-guard and flip `cityCourtsLoading`/`cityCourtsLoaded` (mirror the resume-draft loader `:1049-1066`, which early-returns for regenerate at `:1018`). 
**Verify:** Opening the wizard with `?regenerateFromTicketId=…` loads the court list and Continue works (no "Please select a court").

### Task 5.2 — Uber delivery: add a city field + validate coordinates (Bug #13, owner requirement)
**Files:** Modify `apps/web/lib/intake-flows.ts` (Uber blocks ~`:704-710` and `:1070-1074`) and `apps/web/components/intake-wizard/field-renderer.tsx` (TCS city ~`:480-547`)
**Change:** Add a city selector to the Uber delivery branch; add a `pattern` (lat,lng regex) to the `coordinates` field so "11111" is rejected (the validator already enforces `field.pattern` when present, `intake-wizard.tsx:1344-1351`). Make the TCS "Delivering to" city editable (currently hard-pinned read-only from `payload.city`).
**Verify:** Uber mode requires a city and rejects malformed coordinates; TCS city is editable.

### Task 5.3 — Suppress placeholder PKR-20 base until Set Type chosen (Bug #14-pricing)
**Files:** Modify `apps/web/components/intake-wizard.tsx` `checkoutSummary` (~`:1620-1700`); data fix in `apps/api/scripts/seed-pricing.ts` / `pricing-sheet.xlsx`
**Change:** For Case Files, don't show the Base fee/Total preview until `payload.set_type` is selected (the empty setType matches the `setType=null` headline rule whose seeded base is ~Rs 20). Separately, the real data fix is to re-align `seed-pricing.ts` to the xlsx and re-seed (CLAUDE.md notes it currently aborts) so no bogus Rs-20 base exists.
**Verify:** No "Base fee PKR 20 / Total 23" appears before a Set Type is picked.

---

## Workstream 6 — Payment configuration (Bug #8 + owner: JazzCash/EasyPaisa)

### Task 6.1 — Populate bank details + add mobile-wallet fields
**Files:**
- Schema: `apps/api/prisma/schema.prisma` `PaymentSettings` — add `jazzCash`, `easyPaisa` (and any other channel) fields
- Modify: `apps/api/src/payment-settings/dto/update-payment-settings.dto.ts`, `payment-settings.service.ts`, `apps/web/lib/payment-settings-client.ts:3-12`
- Modify: `apps/web/components/finance-board.tsx` (admin form ~`:80,:383`) and `apps/web/app/(consumer)/consumer/tickets/[id]/pay/page.tsx` (render block ~`:332-378`)
**Change:** The manual-transfer feature is fully built but the `payment-settings` singleton was never populated → "Bank details are not configured yet." Add JazzCash/EasyPaisa columns + DTO + client interface; render them on the pay page; the admin populates them once via the Finance board.
**Verify:** After the admin saves settings, the consumer pay page shows bank + JazzCash/EasyPaisa details and enables Submit/receipt upload.

---

## Workstream 7 — Structured case-record view (larger feature; design first)

### Task 7.1 — Replace the flat "Case Payload" dump with a structured court-case card
**Files:** `apps/web/components/ticket-detail-panel.tsx` (admin/clerk), `apps/web/components/consumer-ticket-board.tsx` (consumer), shared label/section helpers
**Change (needs a short design pass before tasks):** Model the layout on the Punjab DSJ court-detail page the owner showed: bold case title; **colour-coded status badge (Pending=red, Decided=green)**; summary grid (Case No / Institution No & Date / Category / FIR fields); and a **Proceeding History** table (judge, date, stage, short order). Order fields **by importance per court tier** (Lower Court: title→judge→history; High Court: case no→title→category→fixed/bench). This subsumes Task 4.2's humanizing for these screens.
**Note:** This is the biggest item and largely visual/structural; recommend a brief design doc under `DOcs/superpowers/specs/` before breaking into tasks. The data needed (case fields, proceeding history) — confirm availability vs. what intake captures.

### Task 7.2 — Full "edit ticket" (not just Reprice) (feature E)
**Files:** `apps/web/components/ticket-board.tsx` ("Edit Ticket — Reprice" modal ~`:1638` area), reuse the regenerate wizard route
**Change:** The owner wants to edit category/service/method/required-documents, not just the thin Reprice modal. Simplest path: point "Edit ticket" at the pre-filled regenerate wizard (already exists, `?regenerateFromTicketId=`) which allows full re-editing, rather than expanding the Reprice modal. Decide whether "edit" should mutate in place vs. regenerate-as-new (product decision).

---

## Already done / no-op
- **Pay Later button** — implemented and working (`pay/page.tsx:184-196,477-487`). No task.

## Deferred / product decisions to confirm (not code blockers)
- Tighter pay-at-end policy (credit limits / trusted-consumer gating on `assign`) — out of scope unless the owner wants it.
- Configurable tax rate UI (20%/0%) — tax rate is already an `AppSetting` (`tax.rate`) with admin GET/PUT `/settings/tax`; confirm the admin UI exposes it (owner asked to set it to 20 or 0). If the UI is missing, add a small Settings field (likely already covered by Workstream A in CLAUDE.md — verify before adding).

---

## Suggested execution order
1. Workstream 1 (redaction + money correctness) — highest severity.
2. Workstream 2 (currency: confirm + remediate the account, then forward fix).
3. Workstream 3 (pay-at-end + assignment + accept + dispatch + rep landing).
4. Workstream 4 (clerk↔admin visibility).
5. Workstream 5 (wizard + delivery).
6. Workstream 6 (payment config).
7. Workstream 7 (structured case card + full edit) — design pass first.

## Self-review notes
- Every workstream item maps to a verified root cause in `root-causes.md` (file:line carried in each task).
- Items that need a migration (4.1 schema, 6.1 schema) must use the non-destructive Neon migration approach (CLAUDE.md country-pricing note: `prisma db execute` + `migrate resolve --applied`), since `migrate dev` is unusable on the Neon DB.
- Bugs #15/#16 (completed-while-unpaid, "unpaid again" timeline) are intentionally NOT fixed — they are the desired pay-at-end behavior (Workstream 3.1); only the cosmetic lifecycle-strip polish (3.2) applies.
