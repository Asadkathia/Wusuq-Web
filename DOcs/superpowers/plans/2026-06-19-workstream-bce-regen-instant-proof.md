# Workstreams B / C / E — Regenerate, Instant Rate, Payment Proof — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (B) staff regenerate-with-edit via the pre-filled wizard; (C) instant checkout rate on year change via shared client-side pricing math; (E) payment-proof upload on the admin reconcile screen + the clerk cost/payment submission.

**Architecture:** B reuses the proven `futureFromTicketId` wizard-hydration pattern (full-copy variant) and the existing `createIntakeTicket` path, stamping a new `Ticket.regeneratedFromTicketId`. C extracts the two year-sensitive pure pricing functions into `@wusuq/shared` (single source for API resolver + client estimate) and patches the checkout base instantly while the debounced server resolve stays authoritative. E adds `receiptUrl` to the admin reconcile path (reusing the existing `/wallet/receipt` upload + `WalletTransaction.receiptUrl`) and ensures the clerk's cost submission carries proof (the clerk-receipt upload already exists; wire it to the cost step where missing).

**Tech Stack:** NestJS 11 + Prisma, Next.js 16 / React 19, TypeScript monorepo (`shared → api → web`), Jest (plain mocks, `import { jest } from '@jest/globals'`), Playwright.

## Global Constraints

- Build order `shared → api → web`; after editing `packages/shared` run `pnpm --filter @wusuq/shared build` before api/web typecheck.
- API unit tests: plain Jest, manual Prisma mocks, **no** `Test.createTestingModule`; any spec using `jest.fn` MUST `import { jest } from '@jest/globals'`.
- Run tests via `cd apps/api && pnpm test -- <pattern>` (ESM, NODE_OPTIONS=--experimental-vm-modules). Do NOT trust bare `npx jest`.
- `TicketsService` constructor is 8 params: `(prisma, auditLogsService, pricingService, geoService, dispatcher, walletService, settingsService?, promosService?)`.
- Permissions decorator: `../roles-permissions/decorators/permissions.decorator`. Acting user: `@CurrentUser() actor: JwtUser | undefined` (decorator `../auth/decorators/current-user.decorator`, type `../auth/types/jwt-user.type`); id is `actor?.sub`.
- React 19: setState inside an effect must be wrapped in `startTransition`; discard stale async responses with a generation-counter ref (the `cityCourtsReqRef` pattern).
- `buildPricingResolveInput` stays the only resolver-input builder; do not change the server pricing math semantics in C — only relocate the pure functions.
- Migrations are additive (nullable/defaulted). The dev DB has migration drift + no shadow DB → use the manual `migrate diff → db execute → migrate resolve` workflow (see `DOcs/superpowers/plans/2026-06-18-workstream-a-pricing-money.md` Task 2 history), NOT `migrate dev`.
- Money/receipt uploads reuse the existing `diskStorage` + `FileInterceptor` pattern (`wallet.controller.ts:91` `@Post('receipt')`); do not invent a new storage mechanism.

---

### Task B1: Schema — `Ticket.regeneratedFromTicketId`

**Files:** Modify `apps/api/prisma/schema.prisma` (Ticket model); new migration.

- [ ] **Step 1:** Add to `model Ticket` (near `intakeFlow`/`formPayload`): `regeneratedFromTicketId String?` and `@@index([regeneratedFromTicketId])`. (Plain nullable pointer — a self-FK relation is optional and not required; keep it a scalar for the lineage stamp, consistent with how `parent_ticket_id` lineage is tracked in payloads.)
- [ ] **Step 2:** Create + apply the migration `add_ticket_regenerated_from` using the manual workflow (generate SQL via `prisma migrate diff`, `prisma db execute`, `prisma migrate resolve --applied <name>`, `npx prisma generate`). Confirm `npx prisma migrate status` → up to date.
- [ ] **Step 3:** `cd apps/api && pnpm typecheck` → PASS.
- [ ] **Step 4:** Commit `feat(db): Ticket.regeneratedFromTicketId for regenerate lineage`.

---

### Task B2: API — accept + stamp `regeneratedFromTicketId` at intake

**Files:** Modify `apps/api/src/tickets/dto/create-ticket-intake.dto.ts`; `apps/api/src/tickets/tickets.service.ts` (`createIntakeTicket`). Test: `apps/api/src/tickets/regenerate-from.spec.ts`.

**Interfaces:** Consumes `CreateTicketIntakeDto`. Produces: tickets created with a `regeneratedFromTicketId` stamp when supplied.

- [ ] **Step 1: Failing test** — `apps/api/src/tickets/regenerate-from.spec.ts` (use the existing `intake-idempotency.spec.ts` as the construction template — 8-arg constructor, manual prisma mock). Assert that when `createIntakeTicket` is called with `regeneratedFromTicketId: 'src-1'`, the `tx.ticket.create` data includes `regeneratedFromTicketId: 'src-1'`. (Mock pricing.resolve to a matched digital result; mock prisma `$transaction`/`ticket.create`/`ticketStatusHistory.create`.)

```ts
import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';
// ...build service with the 8-arg constructor + mocks (see intake-idempotency.spec.ts)...
it('stamps regeneratedFromTicketId on the created ticket', async () => {
  // arrange resolve()->matched, capture tx.ticket.create data
  // act: createIntakeTicket({ flow, consumerId, serviceId, payload, regeneratedFromTicketId: 'src-1' })
  // assert: createdData.regeneratedFromTicketId === 'src-1'
});
```

- [ ] **Step 2:** Run `cd apps/api && pnpm test -- regenerate-from` → FAIL (field not persisted).
- [ ] **Step 3:** Add `@IsOptional() @IsString() regeneratedFromTicketId?: string;` to `CreateTicketIntakeDto`. In `createIntakeTicket`'s `tx.ticket.create` data, add `regeneratedFromTicketId: dto.regeneratedFromTicketId ?? null`.
- [ ] **Step 4:** Run `pnpm test -- "regenerate-from|tickets"` → GREEN (new + full tickets suite). `pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(tickets): accept regeneratedFromTicketId at intake`.

---

### Task B3: Web — regenerate opens the pre-filled wizard (staff)

**Files:** Create `apps/web/lib/regenerate-ticket.ts` (`buildRegeneratePayload`); Modify `apps/web/components/intake-wizard.tsx` (add `regenerateFromTicketId` hydration mirroring `futureFromTicketId` at `:821-904`); Modify `apps/web/components/ticket-board.tsx` (`regenerateTicket` at `:450` + button at `:968`).

- [ ] **Step 1:** `buildRegeneratePayload(sourcePayload, sourceFlow)` — returns a FULL copy of the source `formPayload` (unlike `buildFutureTicketsPayload` which rolls dates + clears fields), with phase-2/delivery selections preserved (staff edits before submit). Keep it a thin, pure mapper.
- [ ] **Step 2:** In `intake-wizard.tsx`, add a `regenerateFromTicketId = searchParams?.get('regenerateFromTicketId')` hydration effect mirroring the `futureFromTicketId` effect: fetch `GET /tickets/:id` (staff), hydrate `draft.payload` via `buildRegeneratePayload`, set the flow from the source `intakeFlow`, and show a "Regenerating from TKT-…" banner (reuse the future-source banner pattern at `:1775`). On submit, include `regeneratedFromTicketId` in the intake POST body. Guard precedence so `regenerateFromTicketId` and `futureFromTicketId` don't both hydrate.
- [ ] **Step 3:** In `ticket-board.tsx`, change `regenerateTicket` (and the button at `:968`) to **navigate** to the intake wizard route with `?regenerateFromTicketId=<id>` (staff route) instead of `POST /tickets/:id/regenerate`. (Leave the old endpoint in place for back-compat; the UI no longer calls it.)
- [ ] **Step 4:** `pnpm --filter @wusuq/shared build && pnpm --filter web typecheck && pnpm --filter web build` → all pass.
- [ ] **Step 5:** Commit `feat(web): staff regenerate opens pre-filled intake wizard`.

---

### Task C1: Move year-sensitive pricing fns into `@wusuq/shared`

**Files:** Modify `packages/shared/src/index.ts` (add the pure fns + constants); Modify `apps/api/src/pricing/pricing.service.ts` (import from shared, re-export for back-compat). Test: `apps/api/src/pricing/year-pricing-shared.spec.ts`.

**Interfaces:** Produces in `@wusuq/shared`: `CASE_SEARCH_PER_YEAR_RATE`, `DECIDED_AGE_SURCHARGE_PER_YEAR`, `DECIDED_AGE_THRESHOLD_YEARS`, `computeCaseSearchBase(caseYear?, currentYear?)`, `computeDecidedAgeSurcharge(caseStatus?, caseYear?, currentYear?)`. (Note: rename the API's private `computeAgeSurcharge` consumer to the shared `computeDecidedAgeSurcharge`.)

- [ ] **Step 1: Failing test** — assert the shared `computeCaseSearchBase(2015, 2026)` === `11 * 2000` and `computeCaseSearchBase(undefined,2026)` === `2000`; `computeDecidedAgeSurcharge('Decided Case', 2014, 2026)` === `(12-10)*1000` and `0` for pending/current.
- [ ] **Step 2:** Run `pnpm test -- year-pricing-shared` → FAIL (not exported from shared).
- [ ] **Step 3:** Move the function bodies + the 3 constants into `@wusuq/shared` VERBATIM (preserve the exact age math). In `pricing.service.ts`, delete the local copies, import the shared versions, and `export { computeCaseSearchBase, DECIDED_AGE_SURCHARGE_PER_YEAR, ... } from '@wusuq/shared'` so existing importers (tests) keep working. Replace internal `computeAgeSurcharge(...)` calls with `computeDecidedAgeSurcharge(...)`.
- [ ] **Step 4:** `pnpm --filter @wusuq/shared build`; run `pnpm test -- "year-pricing-shared|pricing|case-search"` → GREEN (no resolver behavior change). `pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `refactor(shared): host year-sensitive pricing fns in @wusuq/shared`.

---

### Task C2: Web — instant year-driven rate in the checkout

**Files:** Modify `apps/web/components/intake-wizard.tsx` (the checkout/billedBase area + the year fields).

- [ ] **Step 1:** Add an instant client estimate: when `caseYear`/`decided_date` changes, compute the year-driven base immediately using the shared `computeCaseSearchBase` (for `judicial_case_search`) / `computeDecidedAgeSurcharge` (for decided Case Files) and patch the displayed base so the checkout reflects the new year WITHOUT waiting for the 400 ms server resolve. The debounced `pricingResult` server call stays the source of truth and overwrites the estimate when it lands.
- [ ] **Step 2:** Implement as a derived value, not a competing fetch: compute `instantBase` from the current payload via the shared fns; show `pricingResult ?? instantEstimate` so the line updates on keystroke and reconciles on resolve. Do not duplicate the full pricing formula — only the year-driven component the shared fns own; for non-year flows `instantBase` equals the last `pricingResult` (no change).
- [ ] **Step 3:** Verify there is no flicker/regression: the existing debounced resolve + the `billedBase`/`checkoutSummary` memo still drive the final number; the instant estimate only fills the gap before the resolve lands.
- [ ] **Step 4:** `pnpm --filter web typecheck && pnpm --filter web build` → pass. Manual note: changing the case year updates the Case Search price immediately.
- [ ] **Step 5:** Commit `feat(web): instant year-driven checkout rate via shared pricing math`.

---

### Task E1: Admin reconcile — capture payment proof

**Files:** Modify `apps/api/src/finance/dto/reconcile-payment.dto.ts` (+`receiptUrl?`); `apps/api/src/finance/finance.service.ts` (`reconcilePayment` forwards `receiptUrl` → `WalletTransaction.receiptUrl`). Test: `apps/api/src/finance/reconcile-proof.spec.ts`.

- [ ] **Step 1: Failing test** — extend the `finance.service.spec.ts` mock pattern: assert that `reconcilePayment(ticketId, { amount, paymentMode, receiptUrl: '/uploads/wallet-receipts/x.png' })` creates a `WalletTransaction` whose `receiptUrl` is that value.
- [ ] **Step 2:** Run `pnpm test -- reconcile-proof` → FAIL.
- [ ] **Step 3:** Add `@IsOptional() @IsString() receiptUrl?: string;` to `ReconcilePaymentDto`. In `reconcilePayment`, pass `receiptUrl: dto.receiptUrl ?? null` into the `walletTransaction.create` data.
- [ ] **Step 4:** Run `pnpm test -- "reconcile-proof|finance.service"` → GREEN. `pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(finance): capture payment proof URL on reconcile`.

---

### Task E2: Web — reconcile proof upload + display

**Files:** Modify `apps/web/components/finance-board.tsx` (reconcile row — add a file picker; upload via the existing `/wallet/receipt` endpoint, then pass the returned URL into the reconcile POST; show a "proof" link in the payment/finance history).

- [ ] **Step 1:** In the reconcile UI, add an optional file input (image/PDF). On reconcile: if a file is selected, POST it to `/wallet/receipt` (multipart, the existing endpoint that returns `{ url }`), then include `receiptUrl: url` in the reconcile POST body. Optional — fast reconciles without proof still work.
- [ ] **Step 2:** Where the finance/payment history renders transactions, show a "View proof" link when `receiptUrl` is present (link to the served receipt). Match the existing wallet-receipt link pattern.
- [ ] **Step 3:** `pnpm --filter web typecheck && pnpm --filter web build` → pass.
- [ ] **Step 4:** Commit `feat(web): payment-proof upload on the admin reconcile screen`.

---

### Task E3: Clerk cost submission carries proof (verify + wire)

**Files:** Read `apps/api/src/tickets/tickets.controller.ts` (`:398` clerk-costs, `:665` clerk-receipt), `apps/api/src/tickets/tickets.service.ts` (`submitClerkCosts` `:1958`, `submitClerkReceipt` `:1654`), and `apps/web/components/ticket-board.tsx` (clerk cost + receipt UI `:169-179`, `:363-378`).

- [ ] **Step 1:** Determine the actual gap. The clerk **receipt** upload already exists (`POST :id/clerk-receipt` with `FileInterceptor` → `clerkReceiptUrl`; `receiptFile`/`receiptInputRef` UI). Confirm whether the clerk **cost** submission (`submitClerkCosts`, the "enter amounts" step) is a SEPARATE action from the receipt upload, and whether the owner wants proof attached at the cost-submission step specifically.
- [ ] **Step 2:** If cost-submission lacks proof and the clerk flow is "enter costs → submit to admin with receipt", ensure the UI presents the proof upload **as part of** the cost/payment submission (so the clerk can't submit costs without attaching proof when required). If the receipt upload already co-occurs with cost submission, this task is a no-op verification + a short note in the report — do NOT add a redundant second proof field.
- [ ] **Step 3:** If a change is made: ensure `clerkReceiptUrl` is shown in the admin Review & Complete screen (it is per CLAUDE.md `ticket-board.tsx:1507`-era) and in the consumer-redaction-safe places. Build + typecheck.
- [ ] **Step 4:** Commit (only if a change was made) `feat(tickets): proof attached at clerk cost submission` — otherwise record the verification finding in the report and skip the commit.

---

## Self-Review
- **B coverage:** schema (B1) + API stamp (B2) + wizard hydration & button (B3). ✓
- **C coverage:** shared relocation (C1) + instant client estimate (C2). ✓ Server math unchanged (only relocated).
- **E coverage:** admin reconcile DTO+service (E1) + web upload/display (E2) + clerk-submission proof verify/wire (E3). ✓
- **Placeholders:** none; E3 is intentionally a read-then-decide task because the clerk proof partly exists — it must report findings, not guess.
- **Type consistency:** `regeneratedFromTicketId` (string) used identically in B1/B2/B3; the shared year-fns signatures fixed in C1 and consumed in C2; `receiptUrl` (string) identical across E1/E2.

## Open items / notes
- B: a future-tickets-style consumer regenerate is out of scope (staff-only per spec).
- C: only the year-driven component is estimated client-side; region/rule-based prices still come from the server resolve (no client DB access).
- E3 resolves the one genuine ambiguity (is the clerk proof already where the owner wants it). If it turns out the owner wants proof on a NEW clerk action, escalate rather than guess.
