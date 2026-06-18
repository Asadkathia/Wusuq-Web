# Full Project & Codebase Review — Wusuq

**Date:** 2026-06-10
**Scope:** Working tree of branch `fix/case-info-bundle-base-pricing` (includes the uncommitted Case-Information bundle-as-base changes). All findings verified by reading the actual code path end-to-end; every location is `file:line` in the current working tree.
**Method:** Money paths (dimension 1) reviewed line-by-line directly; security, frontend, data-integrity, and seeds/spec-conformance audited by four parallel review agents whose Critical/High findings were independently re-verified against the source before inclusion. CLAUDE.md invariants cross-checked one by one.

## Verification commands

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ pass (all 3 packages) |
| `pnpm test` | ✅ pass — 24 suites, 177/177 tests |
| `pnpm lint` | ❌ **fail** — 2 prettier errors in this branch's own changed files: `apps/api/src/pricing/case-info-bundle.spec.ts:50` and `apps/api/src/pricing/pricing.service.ts:12` (both `--fix`-able). `apps/web` passes with 15 pre-existing warnings (unused vars, 3 `react-hooks/exhaustive-deps`, 1 a11y). |

Note: `pnpm lint`/`test` require `pnpm install` + `pnpm --filter @wusuq/shared build` first; against an unbuilt `@wusuq/shared`, API lint reports ~168 spurious "error typed value" errors.

---

## Executive summary

The pricing engine's **quote/charge parity architecture is sound** — both the wizard preview and `createIntakeTicket` route exclusively through `buildPricingResolveInput`, PDF is not double-billed at finalize, and the wallet's verify/settle spine (`verifyTopup` + `clearPendingTickets`) is genuinely well-engineered (row locks, conditional updates, atomic increments, FIFO). The working branch's Case-Information bundle-as-base change conforms to its spec.

However, the review found **3 Critical security defects** (one dead-code casing bug neutralizes every consumer ownership guard in the tickets module; consumer-class roles hold the permission that gates admin/clerk ticket mutations including hard delete), **2 Critical money defects** (`rejectTopup` can flip a VERIFIED credit to REJECTED without reversal; admin wallet adjustment can store a negative balance), and a cluster of High-severity money bugs that share one root cause: **`totalAmount` is recomputed from stored component columns at three call sites, but Case Search's city multiplier and search-both surcharge are never stored as components**, so any recompute silently erases them. Separately, a submit-time payload override on Case Information breaks quote=charge on this very branch's flow, and the three non-judicial services currently have **no pricing rules at all** and are created free of charge. Nearly every ticket state transition is unguarded read-then-write, so concurrent admin actions can produce contradictory states. The operational seeds (`seed-pricing`, `seed-geo`) are destructive and non-transactional, with several silent-corruption paths.

---

## Dimension 1 — Money paths (promises 1–2)

### 1.1 CRITICAL — `rejectTopup` has no status guard: verified credit can be marked REJECTED with the money still applied
- **Location:** `apps/api/src/wallet/wallet.service.ts:225-270` · **Workflow:** W4
- **What:** `verifyTopup` is properly serialized (`FOR UPDATE` + conditional `updateMany where status='PENDING_VERIFICATION'`, :128-165), but `rejectTopup` is a plain `findUnique` → unconditional `update({status:'REJECTED'})` — no transaction, no lock, no status precondition.
- **Why it matters:** Admin A verifies (wallet credited, tickets FIFO-settled), Admin B's concurrent/late reject then commits `REJECTED` over `VERIFIED`. Ledger says rejected; the credit was applied and spent. The audit trail and balances permanently disagree, and there is no reversal path. Also rejectable at any later time on an already-verified row.
- **Fix:** Mirror `verifyTopup`: `$transaction` + row lock + `updateMany({where:{id, status:'PENDING_VERIFICATION'}})`, return `alreadyProcessed` when `count !== 1`.

### 1.2 CRITICAL — Case Search totals are destroyed by every `totalAmount` recompute (multi-city / search-both undercharge)
- **Locations:** root cause `apps/api/src/pricing/pricing.service.ts:608-629` + `apps/api/src/tickets/tickets.service.ts:461-486`; clobber sites `tickets.service.ts:899-918` (`assign`), `apps/api/src/finance/finance.service.ts:234-243` (`updateCharge`); weak gate `wallet.service.ts:552` + `finance.service.ts:152-159` · **Workflow:** W2/W3
- **What:** The resolver's `total` for `judicial_case_search` is `perCityBlock × cityCount + staticDeliveryCharge`, including `searchBothSurcharge` — but `serviceCost` is the *un-multiplied* block without the search-both surcharge. `createIntakeTicket` persists `totalAmount = pricing.total` and `serviceCost = pricing.serviceCost`; the multiplier and surcharge exist **only** inside `totalAmount`, not in any stored component. Consequences, each verified:
  1. `assign()` recomputes `totalAmount = serviceCost + deliveryCharges + printing + attested + nonAttested + additional − discount` (:899-907) — a 3-city "both" search quoted/billed at Rs 12,000 is rewritten to Rs 3,000 the moment an admin assigns a clerk. Every ticket passes through ASSIGNED (`STATUS_TRANSITIONS`, :156-164), so this is unconditional.
  2. `finance.updateCharge` does the same component-sum recompute (:234-243) — any admin charge edit erases the multiplier.
  3. The UNPAID→PAID flip is gated on `amountPaid >= serviceCost` (`isBaseCovered`; `wallet.service.ts:552`, `finance.service.ts:152-159`) — a multi-city search flips to PAID at the single-city price.
- **Why it matters:** Direct violation of promise 1/2 in the pay-later path: dues are computed from the clobbered `totalAmount`, so the consumer legitimately never owes the quoted price. This is the exact bug class CLAUDE.md warns about, surviving because the fix was applied to the resolver *inputs* but not to the persisted *outputs*.
- **Fix (correct, not a workaround):** make the resolver's `serviceCost` equal the full intake-billed consumer amount for ONE_TIME flows (fold `searchBothSurcharge` and the `cityCount` multiplication into `serviceCost`; digital flows have no delivery components so the component-sum identity then holds at every recompute site). Add a regression test asserting `assign()` preserves `totalAmount` for a multi-city search ticket. Longer term: replace all ad-hoc component sums with one shared `computeTicketTotal(ticket)` helper.

### 1.3 HIGH — Case Information submit-time `case_status` override breaks quote = charge (working-branch flow)
- **Location:** `apps/web/components/intake-wizard.tsx:1407-1408, 1434` · **Workflow:** W1/W2
- **What:** `flowDefaults = { case_status: 'Pending Case' }` is spread over the payload at submit for `judicial_case_information` — a relic from when the flow only supported pending cases. The flow now collects real `case_status` (`apps/web/lib/intake-flows.ts:737-744`, options include Decided). The live preview prices the *pre-override* payload; the server prices the *post-override* payload. Both use `buildPricingResolveInput`, but on different inputs — the exact drift class the shared builder exists to eliminate.
- **Why it matters:** Decided 2014 case → preview shows `y2016_back` band + Rs 2,000 age surcharge (`computeAgeSurcharge` applies to any flow, `pricing.service.ts:46,583`); server resolves `pending` band, no surcharge. Quote ≠ charge, and the ticket misrecords the case as Pending.
- **Fix:** Delete `flowDefaults`. The payload sent to the server must be byte-identical to the payload the preview priced.

### 1.4 HIGH — The three non-judicial services have no pricing rules: created free, with no quote shown
- **Locations:** `apps/api/scripts/seed-pricing.ts:54-64` (`normalizeServiceRow` maps judicial labels only); `apps/api/src/tickets/tickets.service.ts:455-459, 507-512` (free-ticket path); `apps/web/components/intake-wizard.tsx:583` (preview bails without `select_court_type`, which non-judicial flows don't have — `apps/web/lib/intake-flows.ts:1563-1638`) · **Workflow:** W1/W2/W5
- **What:** No `non_judicial_*` rule is ever seeded, so `resolve` returns `matched=false, rulesExistForFlow=false` and `createIntakeTicket` creates the ticket with `totalAmount=0` (a `logger.warn` is the only signal). The wizard shows "—" as the checkout total. Zero-priced tickets are deliberately skipped by wallet settlement, then `outstandingDuesForUser` ignores them, and the DELIVERED `isFullyPaid` gate passes trivially.
- **Why it matters:** Three of the four SPLIT physical-document services (Copy of FIR, Registry/Deed, Criminal Record) are fulfilled end-to-end with zero revenue at intake (phase-2 finalize still adds clerk charges, but the base is 0). CLAUDE.md documents the Information/Filing/PoA fallback gap but never says non-judicial flows are intentionally free.
- **Fix:** Add the non-judicial base rates to `pricing-sheet.xlsx` + `normalizeServiceRow`, or — if free-base is the owner's intent — encode it as explicit `basePrice=0` rules and document it; and give non-judicial flows a working live preview (the preview gate should be per-flow, not `select_court_type`-presence).

### 1.5 HIGH — `finalizeRemainder`: empty body zeroes clerk charges; no `total ≥ amountPaid` guard; no transaction; no status guard
- **Location:** `apps/api/src/tickets/tickets.service.ts:1910-1983` (exposed via `tickets.controller.ts:372` and `reviewAndComplete` :1415-1420) · **Workflow:** W2/W3
- **What:** (a) `Number(dto.attestedCharges ?? 0)` — a finalize/review call without charge fields overwrites the clerk's persisted `submitClerkCosts`/`saveClerkCharges` values with **0** and lowers `totalAmount`. (b) No check that the new total ≥ `amountPaid` (contrast `finance.updateCharge:251`); the total can drop below what was paid and there is **no refund path anywhere in the codebase** — the surplus is silently kept. (c) No status/finalized precondition on the direct endpoint. (d) Plain read-modify-write racing `assign`/`updateCharge`/`submitClerkCosts`.
- **Fix:** `$transaction` + ticket `FOR UPDATE`; default each charge to the persisted column, not 0; reject (or auto-credit to wallet as a recorded `ADMIN_ADJUSTMENT`) when total < paid; require WAITING_APPROVAL & not-yet-finalized.

### 1.6 HIGH — Gateway payment path is not partial-payment-safe, and the mock provider is production-reachable
- **Locations:** `apps/api/src/payments/payments.service.ts:37-50` (`initiate` charges full `totalAmount` ignoring `amountPaid`), :134-165 (webhook **sets** `amountPaid = totalAmount` — absolute overwrite, no row lock; idempotency check :130 is read-then-act); `payments.controller.ts:44-62` (`webhook` + `mock/:txn/resolve` are `@Public()`); `providers/provider.factory.ts:10-17` (defaults to `mock` when `PAYMENT_PROVIDER` unset, no prod guard); `providers/mock-provider.ts` (static `mock-signed` signature) · **Workflow:** W2/W4
- **Why it matters:** (a) A consumer with a partial wallet payment who completes a gateway payment is charged the full total and the prior wallet debit vanishes from the ticket's `amountPaid` — paid 3,500, books say 3,000. (b) On any deployment without `PAYMENT_PROVIDER` configured, an unauthenticated `POST /payments/mock/<txnId>/resolve {"outcome":"SUCCESS"}` (or a webhook with the constant signature) marks a ticket PAID without payment. Mitigant: the provider is mock today — this whole module becomes live-money-critical the day JazzCash/EasyPaisa is switched on.
- **Fix:** `initiate` on remaining due; webhook inside a tx with ticket `FOR UPDATE`, `amountPaid: { increment }`, conditional `payment.updateMany({where:{id, status:'INITIATED'}})`; fail startup in production when `PAYMENT_PROVIDER` is unset; gate all mock paths behind `NODE_ENV !== 'production'`.

### 1.7 HIGH — `adjustWallet` can store a negative `walletBalance`
- **Location:** `apps/api/src/wallet/wallet.service.ts:408-413`; `apps/api/src/wallet/dto/adjust-wallet.dto.ts:4` (no bound) · **Workflow:** W4
- **What:** `walletBalance: { increment: amount }` with any negative amount and no floor. Violates the documented invariant (credit ≥ 0, never stored negative — `clearPendingTickets` carefully floors at 0; this path bypasses it). A −5,000 adjustment against a 2,000 balance persists −3,000, which then poisons `getMyWallet`'s net computation and short-circuits future settlements.
- **Fix:** lock the user row in the existing tx, validate `current + amount >= 0`, reject otherwise.

### 1.8 HIGH — `regenerate` clones `amountPaid`: the new ticket is born "paid" with no backing money
- **Location:** `apps/api/src/tickets/tickets.service.ts:1255-1263` · **Workflow:** W2/W3
- **What:** The clone copies `totalAmount` **and** `amountPaid` from the original with no backing `WalletTransaction`/`Payment` rows. A regenerated fully-paid ticket sails to DELIVERED with zero money collected, and finance summaries double-count the paid amount. Contrast `generateNextHearing` (:2319), which correctly sets `amountPaid: 0`.
- **Fix:** `amountPaid: 0` on the clone; decide explicitly whether the clone's price should be re-resolved.

### 1.9 HIGH — `createIntakeTicket` has no idempotency; duplicates get auto-paid twice
- **Location:** `apps/api/src/tickets/tickets.service.ts:461-534` · **Workflow:** W1/W2/W4
- **What:** No idempotency key; ticket + history + audit + draft-delete are separate writes (no transaction). A double-submit (network retry, double-click) creates two priced tickets — the 30 s belt (:561-585) protects only *drafts*. The next verified top-up FIFO-settles **both** in `clearPendingTickets`.
- **Fix:** client-supplied idempotency key with a unique column (e.g. `Ticket.intakeRequestId String? @unique`); wrap create + history in `$transaction`.

### 1.10 MEDIUM — Pricing resolver's legacy fallback ignores `yearBand` entirely
- **Location:** `apps/api/src/pricing/pricing.service.ts:446-456` · **Workflow:** W1/W2
- **What:** The last-resort fallback filters on `yearFrom/yearTo` (null on all v2 rows → always passes) and never checks `r.yearBand`, plus an asymmetric setType test (`r.setType && r.setType !== requested`). When the strict, current-band, and setType-null fallbacks all miss (a seed gap), the resolver can price off a rule from a completely different band, chosen by priority. Quote and charge still agree (same path) but both diverge from the sheet, silently. Related inconsistency: `availabilityFor` has no equivalent fallback, so the wizard can grey out a combination the resolver would happily price (:249-304 vs :446-456). Also `seed-pricing.ts:90` freezes `current`'s `yearFrom` at seed-year, so this fallback goes stale every Jan 1.
- **Fix:** Constrain the legacy fallback to rules that actually carry `yearFrom/yearTo` (i.e. `r.yearBand == null`), and log when it fires.

### 1.11 MEDIUM — `reconcilePayment` ledger rows default to type `TOPUP`; dashboard "revenue" double-counts
- **Locations:** `apps/api/src/finance/finance.service.ts:167-179` (no `type`, schema default `TOPUP` despite `ticketId` set); `apps/api/src/dashboard/dashboard.service.ts:187-197` (revenue = all VERIFIED transactions regardless of type → a top-up **and** its `TICKET_DEBIT` both count; negative `ADMIN_ADJUSTMENT`s included) · **Workflow:** W4
- **Fix:** set `type: 'TICKET_DEBIT'` in reconcile; filter the revenue aggregate to debit types.

### 1.12 MEDIUM — Money math round-trips Decimal columns through JS floats
- **Locations:** `wallet.service.ts:309, 468-527` (and the absolute `walletBalance: remainingBalance` write-back at :525-527), `finance.service.ts:15-17`, `tickets.service.ts:899-907, 1946-1954` · **Workflow:** cross-cutting
- **What:** All columns are `DECIMAL(65,30)` (good), but every computation converts to `number` and persists the float result. Correct under current locks for integer rupees; fractional amounts (DTOs allow 0.01) accumulate representation error that gets *persisted*.
- **Fix:** do money arithmetic in `Prisma.Decimal` end-to-end; prefer `increment`/`decrement` over absolute sets.

### 1.13 MEDIUM — Other wallet/invoice integrity items
- `verifyTopup`'s interactive tx can exceed Prisma's default 5 s timeout for consumers with many open tickets (per-ticket lock loop) → P2028 rollback; pass an explicit timeout and push `totalAmount > amountPaid` into the SQL filter (`wallet.service.ts:125-192, 459-466`).
- `Invoice.totalAmount/amountPaid/dueAmount` are denormalized but synced on only 3 of ~7 total-mutating paths (not on `finalizeRemainder`, `submitClerkCosts`, `assign`, `updateCharge`, wallet settlement) — a generated invoice goes stale the moment phase-2 charges land (`finance.service.ts`, various).
- `topup` has no dedupe: duplicate PENDING rows from a double-submit can both be verified → double credit (`wallet.service.ts:78-89`). Low-Medium; admin verification is the mitigation.
- `TICKET_PAYMENT`-typed top-ups ignore their `ticketId` at settlement (FIFO settles the oldest ticket, not the one paid for). Matches the documented FIFO contract but makes the ledger tag misleading (`wallet.service.ts:176-181`).

### Verified clean (dimension 1)
- **Quote/charge parity plumbing:** both the preview (`intake-wizard.tsx:590`) and `createIntakeTicket` (`tickets.service.ts:437-438`) build resolver input exclusively via `buildPricingResolveInput`; no hand-built `/pricing-rules/resolve` callers exist in `apps/web` (admin CRUD board aside). The one input-divergence is 1.3.
- **PDF priced at intake only:** `finalizeRemainder` does not re-add it (`tickets.service.ts:1940-1942`); checkout shows it for all flows (`intake-wizard.tsx:1343-1345`).
- **Payment-model consistency:** `isPhysicalDeliveryFlow` = `chargeCapabilitiesFor(flow).delivery` (`pricing.service.ts:68-70`); `PAYMENT_MODEL_BY_FLOW` and `SERVICE_CHARGE_CAPABILITIES` agree on the physical four; no second hardcoded list found anywhere.
- **Clerk cost excluded from consumer totals** at all three recompute sites (`tickets.service.ts:899-907, 1602-1610, 1946-1954`) — but see Security 3.1: it leaks wholesale through `findOne`.
- **`verifyTopup` + `clearPendingTickets` + `reconcilePayment`:** locks, conditional updates, atomic increments, FIFO order, `totalAmount <= 0` skip, deduction flooring — all correct. Lock ordering is consistent (user → tickets by `createdAt` asc); no deadlock cycle found.
- **State-vs / decided-age / search-both / pending-fallback** resolver behavior matches CLAUDE.md (`pricing.service.ts:24-51, 400-419, 593-596`); `deriveYearBand` is the single band implementation, pending-before-year (`packages/shared/src/index.ts:580-594`).
- **Money column types:** all `Decimal`, no Float (`schema.prisma:170, 209-233, 401, 422-424, 441, 471-479`).

---

## Dimension 2 — State machines & lifecycle (promise 4)

### 2.1 HIGH — Every ticket transition is unguarded read-then-write; concurrent admin actions corrupt state
- **Locations:** `updateStatus` `tickets.service.ts:697-736`; `reviewAndComplete` :1402-1431 (the `!ticket.remainderFinalizedAt` guard at :1415 reads a stale snapshot); `sendBackToClerk` :1490-1501; `submitClerkReceipt` :1297-1313; `verifyClerkReceipt` :1346-1363 (guards `clerkApprovalStatus` but not `status` — can drag a COMPLETED ticket back to WAITING_APPROVAL); `dispatchDelivery` :1534-1555; `assign` :860-939; `overrideStatus` :822-853. The only conditional transition in the codebase is wallet `verifyTopup`. · **Workflow:** W3
- **Why it matters:** "Review & Complete" and "Send back to clerk" racing from WAITING_APPROVAL both pass validation; last write wins → e.g. `status=IN_PROGRESS` + `clerkApprovalStatus=VERIFIED` + finalized charges + contradictory history rows. Two concurrent `reviewAndComplete` calls can both run `finalizeRemainder` with different bodies.
- **Fix:** conditional transitions everywhere — `updateMany({where:{id, status: expectedFrom}})`, treat `count===0` as 409 — and wrap transition + history row in one `$transaction`. Same for `clerkApprovalStatus` and `deliveryStatus`.

### 2.2 MEDIUM — `overrideStatus` bypasses every DELIVERED gate (spec divergence)
- **Location:** `tickets.service.ts:822-853` vs the 2026-06-05 spec ("DELIVERED gate applies to `updateStatus` / `overrideStatus`") · **Workflow:** W3
- **What:** No transition check, no `isFullyPaid`, no `deliveryStatus=DISPATCHED`. An override to DELIVERED on an unpaid, undispatched physical ticket succeeds — and because dues are summed over non-DELIVERED tickets, it also **silently erases the consumer's outstanding due** from the wallet net balance (`wallet.service.ts:330-341`). Currently reachable by any `tickets.write` holder (see 3.2).
- **Fix:** enforce at minimum the payment + dispatch gates on override (escape hatches may skip transition order, never money); if full bypass is intended, restrict to super-admin and say so in the spec/CLAUDE.md.

### 2.3 MEDIUM — `reviewAndComplete` is not atomic (spec says "one transaction")
- **Location:** `tickets.service.ts:1397-1479` · **Workflow:** W3
- **What:** finalize → complete-update → history → optional auto-deliver are sequential awaits. A crash mid-way leaves charges finalized but status WAITING_APPROVAL. Mitigated: re-clicking is safe (finalize guard), so impact is a stuck-but-recoverable state. Also `dispatchDelivery` never notifies the admin (spec item 4 — audit row only).

### 2.4 MEDIUM — Intake-draft lifecycle: Start Fresh race can resurrect the discarded draft
- **Location:** `apps/web/components/intake-wizard.tsx:1249-1268` · **Workflow:** W1
- **What:** `startFresh` clears neither `autosaveTimerRef` nor sets `submittingRef` before awaiting the DELETE. An armed 5 s autosave can fire mid-DELETE and re-upsert the old payload; the server's 30 s belt only suppresses after **ticket creation**, not draft deletion. The exact phantom-draft bug the guards were built for, through the one unguarded entry point.
- **Fix:** mirror `submitTicket` — clear the timer and set a discard guard before the await.
- Related (Low): an in-flight autosave response landing after submit re-writes the just-removed localStorage draft pointer; when suppressed, it stores the literal string `"undefined"` (`intake-wizard.tsx:1224-1227` vs :1450-1452). Guard the success path on `submittingRef`.

### Verified clean (dimension 2)
- Transition table matches the documented lifecycle (`tickets.service.ts:156-164`); UNPAID can only go to PAID, so the payment gate is the state machine itself (per the superseding 2026-05-23 unified-status spec).
- `updateStatus`'s DELIVERED gate enforces `isFullyPaid` AND (physical) `deliveryStatus=DISPATCHED` (:709-723); digital auto-deliver gated on `!delivery && isFullyPaid` (:1455-1460); `dispatchDelivery` rejects digital flows and non-COMPLETED (:1538-1545).
- Draft machinery: `submittingRef` set before any await in submit, timer cleared, re-checked in `saveDraft`, cleared in `resetForm`/catch; server 30 s suppression; draft deleted on create; Start Fresh calls DELETE before reset (`intake-wizard.tsx:1387-1463, 1256-1266`; `tickets.service.ts:528-534, 561-585`). Gap is only 2.4.
- One active draft per `(consumerId, flow)` enforced by a real unique constraint (`schema.prisma:352`).

---

## Dimension 3 — Security (promise 3)

### 3.1 CRITICAL — Consumer ownership guards in the tickets module are dead code: `'consumer' === 'CONSUMER'` is never true → full-ticket IDOR
- **Locations:** `apps/api/src/tickets/tickets.service.ts:355` (`findOne`) and :1187 (document download); role provenance verified: `JwtUser.role` is the lowercase shared `UserRole` (`auth/types/jwt-user.type.ts:6`, `auth.service.ts:69` via `mapPrismaRoleToShared`) · **Workflow:** cross-cutting
- **What:** `findOne` performs **no ownership scoping at all** — its only consumer concession is a document filter behind `caller?.role === 'CONSUMER'`, which never matches. `GET /tickets/:id` requires only `tickets.read` (held by every consumer). The response is the raw model: consumer PII (email/phone/**cnic**/address), `clerkCost`, the full `clerkReport`, rep phone, `dispatchProofUrl`. The document-download ownership/visibility/COMPLETED guards (:1188-1198) are behind the same dead comparison — any consumer can download any ticket's internal `WORK_DOCUMENT`s by ID.
- **Why it matters:** Direct, total violation of promise 3 — enumerate ticket IDs, read every consumer's PII and the internal clerk payouts.
- **Fix:** scope `findOne` to `consumerId = user.id` for consumer-class roles (404 otherwise); strip `clerkCost`/`clerkReport`/internal fields for consumers; replace string comparisons with a shared `isConsumerRole()` helper so casing can't regress.

### 3.2 CRITICAL — Consumer-class roles hold `tickets.write`, which is the only gate on admin/clerk ticket mutations — including hard delete
- **Locations:** `packages/shared/src/index.ts:129-133` (consumer/lawyer/company/representative all have `tickets.write`); `tickets.controller.ts:514-520` → `tickets.service.ts:1071-1075` (`bulk-actions` delete → `deleteMany`, no ownership/status check); also `status-override`, `assign`, `assign-bulk`, `PATCH /tickets/:id`, document upload/patch, and the whole clerk lifecycle (`clerk-receipt`, `clerk-costs`, `clerk-charges`, `dispatch`, `send-back`, `status`) — none re-check role or ownership · **Workflow:** cross-cutting
- **Why it matters:** An authenticated consumer can delete arbitrary tickets, override any ticket to any status (also bypassing the DELIVERED gates, see 2.2), assign clerks, or drive the clerk workflow. Privilege escalation from the cheapest account tier to full ticket administration.
- **Fix:** introduce `tickets.create` (or `tickets.write:own`) for consumer-class roles; reserve `tickets.write` for staff; add explicit owner checks in consumer-reachable service methods. Note `bulkAction` delete is *also* broken in itself (see 4.2) and should become soft-delete regardless.

### 3.3 HIGH — Further IDOR / exposure
- **`GET /documents/export`** dumps all consumers' documents: `documents.controller.ts:26-59` scopes `list` but not `export` (calls `list({page:1, limit:5000})` with no `consumerId`). Fix: apply the same scoping. · W1/W3
- **Cases module by-id endpoints unscoped:** `cases.service.ts:173, 196, 291, 341, 514` — a consumer reads any case; a lawyer (holds `cases.write`) updates/deletes any case. Fix: ownership scoping on every by-id op. · cross-cutting
- **`GET /tickets/representatives`** returns every rep's name/email/phone/court to any `tickets.read` holder (`tickets.controller.ts:77-84`) — staff PII to consumers. Fix: staff-only permission. · W3
- **Representative role treated as staff in `findAll`:** `tickets.controller.ts:68-74` — reps get the unscoped list with `clerkCost`, `defaultClerkCost`, `dispatchProofUrl` and all consumers' tickets. Fix: scope reps to their assignments, redact clerk-cost fields for non-admins. · W3
- **Clerk actions not bound to the assigned rep:** `submitClerkReceipt` :1292, `dispatchDelivery` :1529, `submitClerkCosts` :1567, `saveClerkCharges` :1863, `rejectAssignment` :1782 never verify the actor owns the active assignment (contrast `acceptAssignment` :1737-1744, which does). Clerk B can submit receipts/costs on Clerk A's ticket. Fix: replicate the `acceptAssignment` check. · W3
- **Mock payment endpoints public in prod** — covered in 1.6.

### 3.4 LOW
- Mark-notification-read unscoped (`notifications.service.ts:66-71`) — integrity only.
- OTP from `Math.random()` (`auth/otp.service.ts:26-30`) — mitigated by attempt cap/TTL/rate limit; use `crypto.randomInt`.
- `GET /payments/by-txn/:providerTxnId` is public (`payments.controller.ts:38-42`) — unguessable UUIDs make this acceptable; consider auth anyway.

### Verified clean (dimension 3)
- **Auth flow:** bcrypt(10) passwords; refresh tokens stored hashed, rotated every refresh, revoked on logout; access 15 m / refresh 7 d from `getOrThrow` secrets; login/signup/refresh throttled; audit log covers login success/fail, refresh, logout, impersonation (super-admin-only, in-controller check).
- **Guard wiring:** Throttler → JwtAuthGuard → PermissionsGuard global (`app.module.ts:86-90`); `PermissionsGuard` denies on missing user.
- **`@Public()` surface** enumerated: auth endpoints (throttled), health, geo reference reads (CRUD gated `costs.write`), payment webhook/mock (see 1.6), single-use-token file streaming. No unsafe data exposure beyond the payment items.
- **Wallet controller:** admin ops re-check `isAdminWalletRole`; `/me` and transactions self-scoped; receipt download verifies ownership + path-traversal guard; non-admin top-ups forced to own userId.
- **Personal files:** fully user-scoped, magic-byte sniffing, sanitized filenames, quota, signed downloads (opaque 32-byte token, TTL ≤ 600 s).
- **Raw SQL:** all `$queryRaw`/`$executeRaw` are tagged-template parameterized; the single `$executeRawUnsafe` is a static TRUNCATE. No injection. No secrets tracked in git (`.env.example` only). Global `ValidationPipe {whitelist, transform}`.
- **FE component separation:** consumer routes import only `ConsumerTicketDetail`/`ConsumerTicketBoard`; `TicketDetailPanel` is portal-only; zero `clerkCost` references under `app/(consumer)`. (Moot for promise 3 until 3.1 is fixed — the API leaks regardless of which component renders.)

---

## Dimension 4 — Data integrity

### 4.1 HIGH — covered above: no transactions/locks on `finalizeRemainder` (1.5), `updateCharge` (1.2/1.5 pattern; `finance.service.ts:205-270` additionally races `clearPendingTickets` so `amountPaid > totalAmount` can commit), non-conditional state transitions (2.1), intake non-idempotent (1.9).

### 4.2 MEDIUM — Bulk hard-delete is broken, and would orphan the ledger if it worked
- **Location:** `tickets.service.ts:1071-1075` · **Workflow:** W3
- **What:** `ticket.deleteMany` hits `ON DELETE RESTRICT` children (`TicketStatusHistory` exists from creation for every ticket) → P2003/500 today. If any ticket ever lacked children, `WalletTransaction.ticketId` is `ON DELETE SET NULL` — money rows would silently lose their ticket linkage.
- **Fix:** forbid hard delete of tickets (soft-delete/archive flag); keep RESTRICT on money tables.

### 4.3 MEDIUM — Seed resets the super-admin password to `password` on every run, no env guard
- **Location:** `apps/api/prisma/seed.mjs:6-27` · **Workflow:** W5
- **Fix:** require `SEED_ADMIN_PASSWORD` outside dev; never update `passwordHash` for an existing user.

### 4.4 LOW
- `batchNo`/`invoiceNo` from `Date.now()` slice + 4-digit random — burst collision → unhandled P2002 (`tickets.service.ts:1985-1989`, `finance.service.ts:624-628`). Use cuid/nanoid or retry.
- Missing composite indexes on hot paths: `Ticket(consumerId, status)` (hit by `outstandingDuesForUser` on **every** `/wallet/me`, i.e. every page load's header chip), `Ticket(consumerId, intakeFlow, createdAt)` (autosave-suppression probe), `Notification(userId, isRead)`, `WalletTransaction(userId, createdAt)`.
- `UpdateTicketDto.consumerPhone/consumerAddress` spread into `ticket.update` but Ticket has no such columns → PrismaClientValidationError whenever supplied (`dto/update-ticket.dto.ts:8-14`, `tickets.service.ts:370-375`). Broken endpoint.

### Verified clean (dimension 4)
Money columns all Decimal; `TicketIntakeDraft @@unique([consumerId, flow])`; `Payment.providerTxnId @unique`; no user-delete path exists and money FKs are RESTRICT; migrations inspected — destructive statements are intentional model retirements, the riskiest (`20260523090000_unified_ticket_status`) maps legacy statuses in SQL before dropping; no schema↔migration drift found (caveat: `prisma migrate diff` not run — needs a shadow DB).

---

## Dimension 5 — Frontend correctness

### 5.1 HIGH — Case Search by CNIC can never submit: `case_status` FE-optional/hidden but BE-required at every tier
- **Locations:** FE `apps/web/lib/intake-flows.ts:916-922` (no `required`, hidden unless `search_method ∈ {details, both}`); BE `tickets.service.ts:86-96` (base-required) with no tier drop (`packages/shared/src/index.ts:239-249` drops four fields but never `case_status`) · **Workflow:** W1
- **Why it matters:** CNIC-mode consumers (and details-mode users who skip the optional radio) sail through every step, then get a generic 400 `Missing required payload field: case_status` on the last page — the documented QA B6/B7 failure class, currently live on a whole search mode.
- **Fix:** add `case_status` to all six tiers' drop lists for `judicial_case_search` (or remove it from the base list — search is free-form by design).

### 5.2 MEDIUM — `city_type` / `station_id` are BE-required but never validated client-side
- **Locations:** `intake-wizard.tsx:176-181` (`GEO_HANDLED_KEYS`) + :1130 (validator skips them); `validateLocationStep` :1000-1020 covers only province/district/city; geo chips commit without `onBlur` (`intake-wizard/service-geo-blocks.tsx:559, 587`); BE requires `city_type` for FIR/Registry and `station_id` for criminal-record (`tickets.service.ts:129, 135, 144-145`). The FIR `station_id` special-case at `intake-wizard.tsx:1149-1159` is unreachable dead code (the loop `continue`s first). · **Workflow:** W1
- **Fix:** validate these keys in the location-step validator; delete or rehome the dead branch.

### 5.3 MEDIUM — Special Court + Decided Case: BE requires `case_year`, FE guarantees nothing that produces it
- **Locations:** FE `intake-flows.ts:586-596, 661-666` (and the Case Info duplicates :779-789, 853-859): `year` hidden for Decided, `decided_date` not required; backfill `withDerivedYear` (`intake-wizard.tsx:374-383`) only fires when `decided_date` present. BE: `special` drop list keeps `case_year` required (`shared/index.ts:206, 218`). · **Workflow:** W1
- **Fix:** require `decided_date` when status = Decided (at least for `special`), or drop `case_year` for special-decided in shared.

### 5.4 MEDIUM — Future-tickets prefill lands on the final step; submit validates only the active step
- **Locations:** `intake-wizard.tsx:748-766` (jump to final step), :1387 (`validateCurrentStep()` only); `apps/web/lib/future-tickets.ts:38-47` clears `set_type`/`delivery_mode`/`required_documentations`/qtys · **Workflow:** W1
- **Why it matters:** the cleared BE-required fields are never re-validated → guaranteed 400 unless the user manually walks back. Latent second bug: the step math (`finalStepNum = selectedFlow.steps.length`) is only correct because future tickets are judicial-only; non-judicial flows have `steps.length + 1` display steps (`intake-wizard.tsx:414-425`).
- **Fix:** validate **all** steps at submit (loop `displaySteps`), and/or land the prefill on the first incomplete step.

### 5.5 LOW
- **PoA tier matrix drifted in the safe direction** (FE stricter than BE on `case_no`/`year`/`case_type` — `intake-flows.ts:1263-1294` vs `shared/index.ts:226-232`). No submit failure; re-align to lock-step.
- **Pricing-resolve effect deps omit `city_id`/`province`** which the shared builder reads (`intake-wizard.tsx:600-620` vs `shared/index.ts:698-699`). Benign today (every `city_id` change co-changes `select_court_city`), one edit from a stale quote.
- **Availability call hand-derives band** (`intake-wizard.tsx:629-660`) instead of reusing the builder — greying-out only, resolve stays authoritative; drift hazard.
- **React 19 conventions:** localStorage-on-mount effect at `intake-wizard.tsx:694-712` sets state synchronously without `startTransition` (the documented convention); several condition-guarded `setDraft`-in-effect mirrors (:362-366, :387-404, :531-558, :566-570, :675-692). Auth guards comply on the authorize path; `redirectToLogin` sets state after `router.replace` (deviation without behavioral bug). Lint reports these only as 3 `exhaustive-deps` warnings.
- **Hydrated draft `step` not clamped** to `displaySteps.length` (`intake-wizard.tsx:798`) — blank step until the user clicks Continue if a flow definition shrinks.

### Verified clean (dimension 5)
- 1-indexed step math correct at every set/jump site (`intake-wizard.tsx:429, 1931, 1941, 1971, 2008`; `step-rail.tsx:67, 77, 116, 126` — backward jumps only).
- All click-style fields commit via `onBlur(key, newValue)` (`field-renderer.tsx:74-75, 206-207, 351-352`); `handleFieldBlur` uses the explicit value (`intake-wizard.tsx:1112-1117`). Exception: the geo chips (5.2).
- Case Files / Case Information / Case Filing tier matrices verified field-by-field FE↔BE in lock-step; payload aliases honored by the BE validator (`tickets.service.ts:2018-2024`).
- `api-client.ts`: single-flight refresh (module-level `refreshPromise`), one-retry cap, full token cleanup + `auth:unauthorized` on failure; non-idempotent retry is safe (401 means the guard rejected before the handler ran). Minor: `getBlob` doesn't dispatch `auth:unauthorized`; `/auth/logout` not excluded from retry.

---

## Dimension 6 — Code quality, seeds & architecture

### 6.1 HIGH — `seed-pricing.ts` and `seed-geo.ts` are destructive and non-transactional
- **Locations:** `apps/api/scripts/seed-pricing.ts:460-490` (`$transaction` wraps **only** the deleteMany; ~390 creates run loose after it); `apps/api/scripts/seed-geo.ts:59-68` (raw `TRUNCATE … CASCADE` of all six geo tables up-front, then hundreds of loose awaits to :262) · **Workflow:** W5
- **Why it matters:** a dropped Neon connection mid-run leaves `PricingRule` (every intake fails "No pricing rule matched") or the entire geo hierarchy (whole wizard dead) empty/partial in prod. `seed-case-types.ts:143-165` already shows the correct pattern (wipe + createMany in one interactive tx).
- **Fix:** build drafts first (already done), then one transaction for wipe + `createMany`.

### 6.2 HIGH — `seed-pricing.ts` silent-corruption paths
- **Locations:** `seed-pricing.ts:99-108` (`parseCell`: any non-numeric garbage — `#REF!`, a shifted label — yields `amount:null`, which downstream flips `availability:false` exactly like a deliberate "Can't Get", :164/:346/:479); :406-436 (absolute row/column coordinates; shifted rows are silently `continue`d at :194/:241/:330); no row-count floor anywhere (the scrapers all have one; the pricing seed doesn't); Sheet5 (clerk rates) silently skipped if renamed (:433) · **Workflow:** W5
- **Fix:** distinguish blank / sentinel / unparseable (throw on the latter); assert total drafts ≥ floor (~350) and each block > 0 before wiping.

### 6.3 MEDIUM — Remaining ops-script findings
- **`seed-geo.ts` fails softly on unresolved aliases:** unresolved cities/special-districts are printed and the script **exits 0** (`seed-geo.ts:193-198, 268-278`; `court-alias.ts:300-321`) — the exact "tehsil silently loses its Lower Court" risk CLAUDE.md warns about; the safety net is a log line. Fix: exit 1 on any unresolved entry (or `--allow-unresolved`).
- **`smoke-pricing.ts` always exits 0** and asserts almost nothing on positive cases (never checks `matched`/`available===true`; case 6 asserts nothing) — useless as an automated gate (`smoke-pricing.ts:54-69`). It has 6 cases, not the 5 CLAUDE.md claims.
- **Year-band collapse confirmed concrete:** Punjab Case Search `2015-2014` and `2013-onward` both map to `y2016_back` (later row wins); other-region `2022/2021/2020` all collapse into `y2022_2020` (`seed-pricing.ts:290-302, 439-444`). No warning on colliding keys with different amounts. Fix: warn on collision.
- **`seed-case-types.ts` trusts committed JSON blindly:** count floors live only in the scrapers; a truncated file or deleted source seeds happily, silently shifting cohorts onto the hardcoded fallback (`seed-case-types.ts:39-43`). Fix: per-source floor at seed time too.

### 6.4 Working-branch spec conformance (2026-06-09 case-info bundle) — CONFORMS
Verified point-by-point: rates table exact (incl. the three changed values), rename complete with zero residual `CASE_INFO_BUNDLE_SURCHARGE` references, resolver replaces seeded base only when a bundle is picked (`pricing.service.ts:514-515`), `bundleSurcharge` pinned 0, single "Base fee" checkout line, picker labels price-free, `required_documentations` server-required (FE marks it required too — parity holds), tests updated. Two notes: (a) `caseInfoBundleBase` treats `region === undefined` as `other` (`shared/index.ts:749-752`) — a Punjab consumer whose region derivation ever fails would quote *and* be charged the higher Other rate (parity holds; absolute price wrong); (b) the 2 lint errors above are in this branch's files — run `--fix` before commit.

### 6.5 LOW — Dead code & structure
- Dead FE client `paymentsClient.finalizeRemainder` (`apps/web/lib/payments-client.ts:65-76`) and the no-longer-called `verifyClerkReceipt` endpoint (`tickets.controller.ts:691`, service :1340) — "reintroduction bait" given the CLAUDE.md rule against separate verify/finalize buttons; the migration shipped, remove them.
- God files: `tickets.service.ts` (2,346 lines — pricing, drafts, lifecycle, clerk flow, case write-back in one class) and `intake-wizard.tsx` (2,071). Both are where the majority of this report's bugs live; splitting along the lifecycle seams would shrink the blast radius of each edit.
- Test coverage on money paths: pricing resolver and wallet have solid suites; there are **no tests** for `assign()`'s total recompute, `finalizeRemainder` charge defaults, `regenerate`, or any concurrency path — exactly where the High findings cluster.
- Duplication checks clean: single `deriveYearBand`; single physical-flow source; aliases shared; no `REQUIRED_FIELDS` fork (the FE `requiredByCourtTier` dual-maintenance is the documented design).

---

## Top-10 prioritized actions

1. **Fix the role-casing dead guards + add ownership scoping to `findOne` and document download** (3.1) — one shared `isConsumerRole()` helper, consumer-scoped queries, internal-field redaction. Closes the worst PII/clerk-cost leak.
2. **Split consumer ticket-creation rights from `tickets.write`** and add owner/assignee checks to every mutating ticket route, including the clerk lifecycle (3.2, 3.3 clerk-binding). Disable hard delete (4.2).
3. **Guard `rejectTopup` with the same lock + conditional-update pattern as `verifyTopup`** (1.1); floor `adjustWallet` at zero (1.7).
4. **Fold `cityCount` × and `searchBothSurcharge` into the resolver's `serviceCost` for ONE_TIME flows** so every component-sum recompute (`assign`, `updateCharge`) and the PAID gate are self-consistent (1.2); add a regression test.
5. **Delete the `flowDefaults` case_status override in `submitTicket`** (1.3) — the previewed payload and the POSTed payload must be identical. (One-line fix, belongs on this branch.)
6. **Harden `finalizeRemainder`**: transaction + lock, persisted-value defaults instead of `?? 0`, reject total < paid, status precondition (1.5); make all state transitions conditional `updateMany` + transition-and-history in one transaction (2.1); enforce payment/dispatch gates on `overrideStatus` (2.2).
7. **Make the payments module production-safe**: fail startup when `PAYMENT_PROVIDER` is unset in prod, prod-gate all mock paths, webhook via locked increment on remaining due (1.6).
8. **Restore FE/BE required-field lock-step**: `case_status` drop for Case Search (CNIC mode is currently unsubmittable — 5.1), validate `city_type`/`station_id` client-side (5.2), special-decided `case_year` (5.3), validate all steps on future-ticket submit (5.4).
9. **Price or explicitly zero-rate the three non-judicial services** in the xlsx + seed, and give non-judicial flows a live checkout quote (1.4).
10. **Seed safety**: transactional wipe+insert for pricing/geo, unparseable-cell errors + count floors in `seed-pricing`, exit-1 on unresolved geo aliases, real assertions + exit codes in `smoke-pricing` (6.1–6.3). Fix `regenerate`'s cloned `amountPaid` (1.8) and add intake idempotency (1.9) in the same sweep.

---

## Per-dimension health verdicts

| Dimension | Verdict |
|---|---|
| 1. Money paths | **At risk.** The parity *architecture* (shared resolve-input builder, single band derivation, capability-gated delivery) is correct and well-tested, and the wallet verify/settle spine is exemplary. But persisted-total recomputation (Case Search), one stale submit-time override, unpriced non-judicial flows, and the unguarded reject/adjust/finalize/webhook paths mean promises 1–2 do not currently hold under concurrency or for several whole flows. |
| 2. State machines | **Weak.** The transition table and gates are right on paper; enforcement is read-then-write everywhere except `verifyTopup`, and `overrideStatus` bypasses the gates entirely. Promise 4 holds single-actor, not multi-admin. |
| 3. Security | **Failing until items 1–2 land.** Auth, uploads, raw SQL, secrets, throttling, personal files: genuinely solid. Authorization granularity is the hole — one casing bug plus one over-broad permission undo the rest. |
| 4. Data integrity | **Fair.** Schema fundamentals (Decimal money, key constraints, RESTRICT on money FKs, sane migrations) are good; transactionality is concentrated in the wallet and missing around it; a few hot-path indexes absent. |
| 5. Frontend | **Good with seams.** The wizard's documented invariants (step math, onBlur commits, draft guards, api-client refresh) are upheld; the bugs are FE↔BE required-field drift and two payload-mutation/validation seams at submit time. |
| 6. Quality/ops | **Fair.** Shared-package discipline is excellent (no duplicated money logic found). Ops scripts are the soft underbelly: destructive, non-transactional, silently tolerant of corrupt input. Two god-files concentrate risk. |

## Per-workflow verdicts

- **W1 Intake → ticket:** Holds for the five judicial flows on the happy path; quote=charge plumbing verified. Breaks: Case Information status override (1.3), Case Search CNIC mode unsubmittable (5.1), non-judicial flows quote-less and free (1.4), three FE/BE required-field gaps that 400 on the last page (5.2–5.4), Start Fresh race (2.4), no submit idempotency (1.9).
- **W2 Payment:** SPLIT/ONE_TIME model consistency verified across shared/resolver/FE. Breaks: Case Search total destruction (1.2), finalize zeroing/no-refund (1.5), gateway path unsafe for partial payments + forgeable in mock deployments (1.6).
- **W3 Fulfilment & review:** The streamlined tail works single-actor and the DELIVERED gates are correct in `updateStatus`. Breaks: every transition racy (2.1), override bypass (2.2), clerk actions not bound to the assignee (3.3), reps see the whole book (3.3).
- **W4 Wallet:** The core (top-up → verify → FIFO settle → net balance) is the strongest money code in the repo and matches its spec. Breaks: reject-after-verify (1.1), negative adjustment (1.7), revenue double-count + mistyped ledger rows (1.11).
- **W5 Catalogue & pricing ops:** Scrapers (count floors) and `seed-case-types` (transactional) are in good shape. `seed-pricing` and `seed-geo` can silently corrupt or half-wipe prod (6.1–6.3); `smoke-pricing` cannot catch it (always exits 0).

## Stale CLAUDE.md items

1. **`graphify-out/` does not exist** — the mandatory "Graphify-first exploration" section routes every task through artifacts that aren't in the repo. Re-run `/graphify .` or remove/soften the mandate.
2. **Ticket lifecycle line is wrong:** "`PENDING → ASSIGNED → …`" — there is no `PENDING`; the real chain is `UNPAID → PAID → ASSIGNED → IN_PROGRESS → WAITING_APPROVAL → COMPLETED → DELIVERED` (`tickets.service.ts:156-164`).
3. **`smoke-pricing.ts` has 6 worked examples, not 5** — and (more importantly) is not a usable verification gate as written (6.3).
4. **"A wrong alias silently leaves a tehsil with no Lower Court"** — accurate, but worth noting the seeder *detects* and prints unresolved aliases yet still exits 0; the doc implies more protection than exists.
5. The 2026-05-19 payment-gating spec is partially superseded by the 2026-05-23 unified-status design; the older doc should carry a superseded banner (its "admin-origin tickets ungated" rule no longer holds).
6. Worth *adding* once fixed: the `'consumer' vs 'CONSUMER'` casing trap (3.1) is exactly the kind of invariant CLAUDE.md exists to record.
