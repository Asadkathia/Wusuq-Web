# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Graphify-first exploration (when the graph exists)

**Note (2026-06-12): `graphify-out/` is currently absent from the repo — use normal filesystem search until someone re-runs `/graphify .`.** When the artifacts exist, the rule below applies.

Before using `find`, `grep`, Glob, the Explore subagent, or reading multiple files to understand system architecture, structure, or how components connect, first consult `graphify-out/` at the repo root:

1. `graphify-out/GRAPH_REPORT.md` — community labels, god nodes, surprising cross-module edges, suggested questions
2. `graphify-out/graph.json` — full node/edge graph (load it to find which file/community owns a concern)
3. `graphify-out/graph.html` — interactive viz (mention if the user wants to browse)

The graph is the routing index. Use it to locate the right file, community, or bridge node, then read only those specific files. Do not re-discover structure that the graph already encodes.

Filesystem search is the **fallback**, used only when:
- The graph is silent on the topic
- The file is newer than the last graph build
- The question is about specific code lines (not architecture)

After large structural changes (file moves, new modules, refactors), suggest re-running `/graphify . --update` to refresh the map.

This rule exists to save tokens and time — a precomputed AST graph is far cheaper to read than re-discovering structure on every task.

## Project Overview

Wusuq is a paralegal operations platform built as a pnpm monorepo with three packages:
- `apps/api` — NestJS 11 backend (port 4000)
- `apps/web` — Next.js 16 frontend (port 3000)
- `packages/shared` — TypeScript-only constants (roles, permissions, enums) used by both

## Commands

All commands run from the repo root unless noted.

### Development
```bash
pnpm dev           # Start both web and api in parallel
pnpm dev:api       # API only (NestJS watch mode)
pnpm dev:web       # Web only (Next.js)
```

### Build, Lint, Typecheck
```bash
pnpm build         # Build all apps (shared → api → web order)
pnpm lint          # ESLint across all apps
pnpm typecheck     # tsc --noEmit across all apps
```

### Testing
```bash
pnpm test          # Jest unit tests (API)
pnpm e2e           # Playwright E2E (Chromium)
pnpm e2e:ui        # Playwright with UI inspector
pnpm uat:smoke     # UAT API smoke tests
pnpm uat:roles     # Role-permission matrix validation
pnpm perf:smoke    # k6 performance tests (requires k6 installed)
```

Single test file in API:
```bash
cd apps/api && pnpm test -- --testPathPattern=auth
```

### Database (run from `apps/api/`)
```bash
pnpm prisma:generate        # Regenerate Prisma client after schema changes
pnpm prisma:migrate:dev     # Create + apply a new migration
pnpm prisma:migrate:deploy  # Apply pending migrations in production
pnpm prisma:seed            # Seed default super admin (local only)
```

### Geo Seed
```bash
cd apps/api && npx ts-node --esm scripts/seed-geo.ts
```
- Special courts seat at the DISTRICT level only (`SPECIAL_COURT_DISTRICTS` + `resolveSpecialCourtSeatCityIds` in `court-alias.ts`) — one seat city per district, never every tehsil.
- `CITY_ALIAS` maps court-JSON city names like `"Babuzai (Swat)"` to the bare `GeoCity` name; a wrong alias would leave a tehsil with no Lower Court. Since 2026-06 `seed-geo.ts` **exits 1 and rolls the whole transaction back** on any unresolved alias/special-district (pass `--allow-unresolved` to accept gaps), and the entire truncate+rebuild is one transaction. Re-run `seed-geo.ts` after editing either.
- **City picker search is district/province-aware** (`matchesCitySearch` in `intake-wizard/service-geo-blocks.tsx` matches the tile `subtext` = `district · province`, not just the city name). This is required because ~28 districts have NO `GeoCity` named after the district (their cities are tehsils — e.g. Hunza → Aliabad/Gojal, Swat → Mingora/Babuzai); without district matching those districts are unfindable by name. Don't regress the search to label-only, and don't "fix" it by inserting synthetic district-named cities into the seed.
- **Court-less cities show "No courts available", never an infinite spinner (2026-06).** The court picker's loading state is driven by `cityCourtsLoaded` (the courts fetch RESOLVED) — NOT by `cityCourtGroups.length === 0`, which conflated "still loading" with "genuinely no courts" and span forever for any city with zero `CourtSeat` rows. All three `/geo/cities/:id/courts` fetch sites in `intake-wizard.tsx` set `cityCourtsLoaded` false-before / true-in-`finally`, and a monotonic `cityCourtsReqRef` discards stale responses on rapid city switches. This surfaced a real data anomaly: a stray district-named `GeoCity` "Hunza" (added after the main seed; the current seed aliases court-JSON `Hunza → Aliabad` via `CITY_ALIAS`, so it never creates a "Hunza" city) has no court seats — its courts live on Aliabad/Gojal. That rogue row should be deleted from the DB; the seed only upserts, so it won't recreate it.

### Catalogue & pricing seeds
```bash
# Pricing — re-run after editing apps/api/data/pricing-sheet.xlsx (the
# canonical price list). Wipes PricingRule + re-inserts ~390 rules in ONE
# transaction. Safety rails (2026-06): unparseable cells throw; every parse
# block must contribute > 0 drafts; total floor of 350 drafts before the
# wipe; a missing Sheet5 (clerk rates) aborts unless
# --allow-missing-clerk-rates; key collisions with differing amounts warn.
cd apps/api && npx tsx scripts/seed-pricing.ts
npx tsx scripts/smoke-pricing.ts   # 9 worked examples; asserts matched+available and exits 1 on any FAIL

# Case-type catalogue — re-run after a scraper update. Wipes
# CourtCaseType + re-inserts ~3,500 rows from JSON sources + the
# hardcoded snapshot, then appends an "Other" row per cohort.
cd apps/api && npx tsx scripts/seed-case-types.ts

# Scrapers (each writes JSON to apps/api/data/case-types/<source>.json).
# Each carries a count-floor validator that refuses to overwrite when
# the row count drops below a sanity threshold.
cd apps/api && npx tsx scripts/scrape-case-types/scrape-scp.ts
# Also: scrape-fcc, scrape-ihc, scrape-shc, scrape-dsj-lahore,
# scrape-phc, scrape-bhc (LHC has no public source; script exists but
# documents the failed probe trail).
```

## Architecture

### Authentication Flow
1. `POST /api/auth/login` returns `{ accessToken, refreshToken, user }`
2. Frontend stores tokens in localStorage keys: `wusuq_access_token`, `wusuq_refresh_token`, `wusuq_user`
3. `lib/api-client.ts` injects the access token on every request and automatically retries on 401 by calling `/api/auth/refresh`
4. On the API, two global guards run on every non-`@Public()` route: `JwtAuthGuard` (Passport JWT) then `PermissionsGuard` (checks `ROLE_PERMISSIONS` from `@wusuq/shared`)

### RBAC
Roles and permissions are defined in `packages/shared`. The mapping `ROLE_PERMISSIONS` is the single source of truth consumed by both the API's `PermissionsGuard` and the frontend nav/feature visibility. When adding a new permission, update the shared package and rebuild it.

- **Ticket permission split (2026-06).** `tickets.write` is **staff-only** ticket administration (status, override, assign, send-back, patch, regenerate, bulk). Consumer-class roles (consumer/lawyer/company) hold `tickets.create` (intake endpoints + draft mutations) instead; representatives hold `tickets.clerk` (accept/reject assignment, clerk receipt/costs/charges, dispatch, document upload, record next-hearing). Never grant consumer-class roles `tickets.write` again — that was the 3.2 privilege-escalation audit finding.
- **Role comparisons go through `isConsumerRole()` / `isStaffRole()` from `@wusuq/shared`.** `JwtUser.role` is the lowercase shared `UserRole`; the Prisma enum spelling is UPPERCASE. A literal `role === 'CONSUMER'` comparison is silently always-false — that dead guard was the root cause of the full-ticket IDOR (audit 3.1). `representative` is deliberately NOT consumer-class: clerks don't own tickets, they're scoped to their assignments (and `ensureClerkActionAllowed` binds every clerk lifecycle action to the active assignee; staff exempt).
- Consumer-class callers get 404 (not 403) on foreign tickets/cases so ids can't be probed; `findOne` redacts `clerkCost`/`defaultClerkCost`/`clerkReport`/`dispatchProofUrl`/rep phone for consumers.

### API Request Pipeline
```
Helmet → CORS → Body parser (10 MB) → ValidationPipe (whitelist, transform)
→ ThrottlerGuard → JwtAuthGuard → PermissionsGuard → Route handler
```

### Database Schema Key Points
- Geo hierarchy: `GeoProvince → GeoDistrict → GeoCity → CourtSeat`
- Ticket lifecycle: `UNPAID → PAID → ASSIGNED → IN_PROGRESS → WAITING_APPROVAL → COMPLETED → DELIVERED` (there is no PENDING; the UNPAID → PAID flip is the payment gate itself)
- Clerk approval: separate state machine `PENDING → SUBMITTED → VERIFIED / REJECTED`
- **Streamlined review tail (2026-06).** Clerk "Submit to Admin" (`submitClerkReceipt`) advances `IN_PROGRESS → WAITING_APPROVAL`. The admin then does ONE `reviewAndComplete` (the "Review & Complete" button) that verifies the receipt + finalizes phase-2 charges (reuses `finalizeRemainder` math) + completes — and auto-advances **digital** flows to `DELIVERED` when fully paid. `sendBackToClerk` (WAITING_APPROVAL → IN_PROGRESS) is the reject path. Don't reintroduce separate Verify-Receipt / Finalize / Approve buttons.
- **Physical-dispatch sub-state (2026-06).** `Ticket.deliveryStatus` enum `PENDING → DISPATCHED` (+ `dispatchProofUrl`, `trackingNo`) tracks the clerk sending physical files. Clerk `dispatchDelivery` (from `COMPLETED`, physical flow only) sets `DISPATCHED`; the admin's "Confirm delivered" (→ `DELIVERED`) is the verification. The `DELIVERED` gate requires `deliveryStatus = DISPATCHED` AND `isFullyPaid` for physical flows; `isFullyPaid` only for digital. Only physical-document flows (`chargeCapabilitiesFor(flow).delivery`) use this.
- Every sensitive auth action is written to `AuditLog`
- **Never read-then-write `Ticket.status` (2026-06, audit 2.1).** Every transition is a CONDITIONAL `updateMany({ where: { id, status: expectedFrom } })` with the history row written in the same `$transaction`; `count === 0` → `ConflictException` (409). This holds for `updateStatus`, `assign`, `acceptAssignment`, `rejectAssignment`, `submitClerkReceipt`, `submitClerkCosts`, `reviewAndComplete`, `sendBackToClerk`, `dispatchDelivery` (also conditional on `deliveryStatus`) and `overrideStatus`. `overrideStatus` may skip transition ORDER but not the money/dispatch gates on DELIVERED — except for **super-admin**, who may bypass even those (owner decision 2026-06-12; the bypass is stamped `superAdminBypass: true` in the audit row).
- **`reviewAndComplete` is one transaction** (finalize via `finalizeRemainderCore` + verify + complete + auto-deliver); wallet settlement runs after commit (its own locks would deadlock inside). `finalizeRemainder` defaults absent dto charge fields to the PERSISTED clerk-entered columns (never 0) and finalizes at most once (conditional on `remainderFinalizedAt IS NULL`). When the finalized total drops below `amountPaid` (charges corrected down after a wallet settlement), the surplus **auto-credits back to the consumer's wallet** as a VERIFIED `ADMIN_ADJUSTMENT` ledger row and the ticket's `amountPaid` steps down to the new total — finalize/reviewAndComplete take the USER row lock BEFORE the ticket lock (same order as wallet settlement) so this credit can't deadlock; don't reorder those locks.
- **Intake idempotency (audit 1.9).** The wizard sends one `requestId` UUID per submit attempt; it lands on the unique `Ticket.intakeRequestId`. A replay (double-click/network retry) returns the original ticket instead of creating a duplicate that wallet settlement would also pay. Ticket + initial history row are created in one transaction.
- **`createIntakeTicket` fails loudly on unpriced flows (audit 1.4):** a flow with NO active pricing rules rejects intake unless `ALLOW_UNPRICED_INTAKE=true`.
- **Non-judicial base rates (owner 2026-06-12).** Copy of FIR = Rs 2,000, Registry/Deed = Rs 3,500, Criminal Record Search = Rs 2,000 — flat, region-agnostic. They live in `NON_JUDICIAL_BASE_RATES` (`@wusuq/shared`, re-exported from `pricing.service.ts`), NOT the xlsx (whose grid is judicial court-tier shaped); `seed-pricing.ts` injects them as `courtLevel/region/yearBand/setType = null` rules (match any region + any FIR-year band). SPLIT flows: base bills at intake, printing/delivery are the clerk phase-2 remainder. Add any new non-judicial service's rate to that constant + re-seed.
- **Bulk ticket "delete" is a soft archive** (`Ticket.archivedAt`, audit 4.2): archived tickets are excluded from `findAll`, wallet dues and auto-settlement; money FKs stay intact. There is no hard-delete path.
- **For ONE_TIME (digital) flows the resolver's `serviceCost` IS the full intake-billed amount** (Case Search city multiplier + search-both surcharge folded in, audit 1.2), so `serviceCost === total` for digital flows and every component-sum recompute of `totalAmount` (`assign`, `finance.updateCharge`) plus the `isBaseCovered` PAID gate stay quote-consistent. SPLIT flows keep the un-multiplied phase-1 base. Don't reintroduce a `serviceCost` that excludes per-city multiplication.
- **`regenerate` RE-RESOLVES the price** (owner decision 2026-06-12): the clone is a new sale at the current price list — priced through `buildPricingResolveInput`, phase-2 clerk charge columns reset to 0, `amountPaid: 0` (audit 1.8 — no backing money rows). Re-pricing failures reject loudly (same guards as intake); legacy tickets without `intakeFlow`/`formPayload` fall back to the copied totals.
- **Payments module is partial-payment-safe (audit 1.6):** `initiate` charges remaining due (`total − paid`); the webhook flips `Payment` INITIATED→SUCCESS conditionally (idempotency) and INCREMENTS `amountPaid` under a ticket row lock; the mock provider cannot boot in production (`PAYMENT_PROVIDER` must name a real provider) and `mock/:txn/resolve` is disabled there.

### Frontend Route Structure
```
/               → redirect (checks JWT, routes to /dashboard or /consumer/dashboard)
/login          → staff/admin login
/(auth)/...     → consumer auth pages
/(portal)/...   → admin/staff portal (wrapped by PortalAuthGuard + Sidebar layout)
/(consumer)/... → consumer-facing pages
```

`PortalAuthGuard` (`components/portal-auth-guard.tsx`) validates JWT expiry and role client-side (Base64 decode, no server call) and redirects to `/login?next=...` if stale.

### Adding a New API Module
NestJS convention: create `src/<domain>/<domain>.module.ts`, `.controller.ts`, `.service.ts`, and register in `AppModule`. Follow the existing pattern of injecting `PrismaService` directly (no repository layer).

### Pricing engine v2
`PricingRule` is keyed on 5 dimensions: `(region, courtLevel, flow, yearBand, setType)`. The resolver in `apps/api/src/pricing/pricing.service.ts` returns a line-item breakdown — `base, pdfSurcharge, deliveryFee, titleSurcharge, ageSurcharge, searchBothSurcharge, attestedCharge, nonAttestedCharge, total` — plus an `availability: boolean` flag. When `availability=false`, the wizard hides the combination (e.g. Lower-Court Non-Attested for decided cases — the "Can't Get" sentinel from the xlsx). `apps/api/data/pricing-sheet.xlsx` is the canonical price list; edit there and re-run `seed-pricing.ts`. Some surcharges live as constants in the resolver, not as rule rows:
- `STATE_VS_SURCHARGE = 1000` — applied when `caseTitle` matches `/^state vs/i` (PDF #14).
- `SEARCH_BOTH_SURCHARGE = 1000` — applied per city when `flow === 'judicial_case_search'` and `searchMethod === 'both'` (PDF #37), on top of the per-year base below, times the cityCount multiplier.
- `CASE_SEARCH_PER_YEAR_RATE = 2000` (2026-06 owner rate). For `judicial_case_search` the **base fee = `computeCaseSearchBase(caseYear) = max(1, currentYear − caseYear) × 2000`**, per city — it REPLACES the seeded base (e.g. an 11-year-old case = 11 × 2,000 = Rs 22,000/city). Pending/unknown-year or current/future-year cases charge the 1-year minimum (Rs 2,000). Because this base already encodes age, the `DECIDED_AGE_SURCHARGE_PER_YEAR` surcharge is **suppressed for Case Search** (`ageSurcharge = isCaseSearch ? 0 : …`). Don't reintroduce a flat seeded Case Search base.
- `DECIDED_AGE_SURCHARGE_PER_YEAR = 1000` — derived, not rule-backed. For Decided Case Files older than 10 years, the resolver adds `(age - 10) * 1000` on top of the banded price (e.g. in 2026, a 2016 case = banded base; 2015 = base + 1,000; 2014 = base + 2,000). Case Files only — Case Search uses the per-year base above instead.

**yearBand `pending` fallback.** The seed only carries `pending` set-type rules for `region='Punjab'`. For Pending Cases outside Punjab, both `availabilityFor` and `resolve` fall back to `yearBand='current'` when the requested band yields zero matches. This mirrors the wizard's implicit "pending means no decided year → use current rate" contract. Don't add ad-hoc `pending` rules for `region='other'` — fix the xlsx if the rate should genuinely differ.

Set-type rules in the xlsx only cover Case Files. Information / Filing / PoA flow through the resolver with `setType=null` — don't render the Set Type picker for those services.

**One source for the resolve input — `buildPricingResolveInput(flow, payload)` in `@wusuq/shared`.** BOTH the wizard's live checkout preview (`intake-wizard.tsx`) and the server's `createIntakeTicket` build the resolver input through this single mapper, so the quote and the persisted charge are derived from identical inputs. NEVER hand-extract resolve fields at a call site — that's exactly how the 2026-06 "quote ≠ charge" bugs happened (the server call had silently fallen behind the wizard, dropping `yearBand` → Pending Case Files charged on the `current` band, Rs 3,300 quote vs 7,300 charge; plus `caseTitle`/`cityCount`/`searchMethod` → State-vs + multi-city Case Search undercharges). Add any new pricing input to the shared builder, not to a caller.

**Year-band derivation is `deriveYearBand(caseStatus, caseYear)` in `@wusuq/shared`** — the ONLY implementation (web `computeYearBand` delegates to it; `resolve`/`availabilityFor` default to it when `yearBand` is omitted). It returns `'pending'` for any Pending status BEFORE year bucketing; a pending case must never fall into a historical/`current` band. Only `judicial_case_files` has a distinct `pending` rule; other flows fall back to `current`, so this is safe for all flows.

**Case Information pricing (2026-06).** Case Information is NOT aliased to Case Files. The chosen **document bundle IS the base fee** — a region-keyed (Punjab/other) table (`CASE_INFO_BUNDLE_BASE` + `caseInfoBundleBase` in `@wusuq/shared`, re-exported from `pricing.service.ts`, keyed on `payload.required_documentations`). The resolver sets `basePrice = caseInfoBundleBase(region, bundle)` when a bundle is selected (replacing the seeded base; the seeded base is only a placeholder until one is picked), and there is **no separate "Document bundle" add-on** — `bundleSurcharge` is 0 for Case Information and the checkout shows a single **Base fee** line. The wizard's bundle picker shows clean tier-aware labels (`docBundleLabel`) with **no inline price**. Region is derived server-side from `payload.city_id` (the live preview passes it), so the quote and persisted charge agree. Its delivery is digital-only → no delivery fee/charge (see physical-vs-digital model below). Don't reintroduce the old `CASE_INFO_BUNDLE_SURCHARGE` add-on or the "Document bundle" line.

**Region derivation.** `resolve`/`availabilityFor` derive region via `deriveProvinceName` (province → GeoCity-id FK → city-name fallback). Callers (`/pricing-rules/resolve`, `/availability`, `createIntakeTicket`) must pass `cityId` (`payload.city_id`); without it, court-seat names that don't match `GeoCity.name` leave `region=undefined` and ALL region-keyed rules are discarded ("No pricing rule matched") — especially outside Punjab.

**Physical-document vs digital flows (owner spec, 2026-06).** Two service classes, and three things move together with the class:
- **Physical-document services** = Case Files + the 3 non-judicial copies (Copy of FIR, Registry/Deed, Criminal Record). These are **SPLIT** payment (base at intake, then a clerk-finalized remainder), **have a delivery leg** (collected in that 2nd payment), and expose clerk phase-2 charges (Case Files adds attestation; the non-judicial copies are printing/delivery/pdf only).
- **Digital judicial flows** = Case Information, Case Search, Case Filing, Power of Attorney. **ONE_TIME** payment, **no delivery**, no clerk charges (`NO_CHARGES`).
- The single source for "does this flow have delivery" is the `delivery` capability (`chargeCapabilitiesFor(flow).delivery`); the resolver gates its delivery fee + static delivery charge on `isPhysicalDeliveryFlow` = that capability — do NOT add a second hardcoded list. `PAYMENT_MODEL_BY_FLOW`, `SERVICE_CHARGE_CAPABILITIES` (both in `@wusuq/shared`) and the resolver must agree on the physical set.

**PDF is priced at intake, not finalize.** `resolve` folds `pdfSurcharge` into `serviceCost` when `wantPdf` (`payload.want_pdf_before_dispatch === 'Yes'`). `finalizeRemainder` must NOT re-add PDF (double-charge). The checkout shows the `PDF surcharge` line for ALL flows including SPLIT (it's billed at intake) — delivery/attested lines stay hidden for SPLIT (deferred to the 2nd payment).

**Clerk cost is internal-only** — persisted on the ticket but excluded from the consumer-facing `totalAmount` (`assignClerk` / `finalizeRemainder` / clerk-submit). Consumer views use `ConsumerTicketDetail` (`consumer-ticket-board.tsx`), never the admin `TicketDetailPanel` (which exposes clerk cost / PII).

**Wallet net balance is dynamic.** `User.walletBalance` is the **prepaid credit only** (>= 0, never negative — `clearPendingTickets` floors deductions at 0). The consumer-facing balance is computed on read in `WalletService.getMyWallet` as `net = credit − outstandingDues`, where `due = Σ max(0, totalAmount − amountPaid)` over the consumer's non-`DELIVERED`, positively-priced tickets. It goes **negative** when they owe (e.g. after "Pay later") — the ticket stays `UNPAID` (payment gate holds); verified top-ups auto-settle FIFO and the net rises back toward >= 0. Don't store the negative; don't change the admin wallet `list` (kept as prepaid). FE reads `{ balance, credit, due }` from `/wallet/me` (header chip in `shell-topbar.tsx`, hero in `consumer-wallet-board.tsx`).

### Money model — tax, promo codes, edit-ticket reprice (Workstream A, 2026-06-18)
Spec/plan: `DOcs/superpowers/specs/2026-06-18-ticket-money-and-ux-overhaul-design.md`, `DOcs/superpowers/plans/2026-06-18-workstream-a-pricing-money.md`.

- **`computeTicketTotal()` in `@wusuq/shared` is THE single source for a ticket total.** Order: `serviceBase = serviceCost + additionalServiceCost` → `taxableBase = max(0, serviceBase − discountPrice − promoDiscount)` → `taxAmount = taxableBase × rate` → `total = max(0, chargesSubtotal − discount) + taxAmount`, all via `round2`. **Tax applies to the BASE only** (serviceCost + additionalServiceCost), NOT the whole bill — delivery/printing/attested/non-attested/additionalCharges stay in the total but untaxed (owner edit 2026-07-06, batch-2 C1; spec `DOcs/superpowers/specs/2026-07-06-workstream-a-payments-money-design.md`). The returned `taxableBase` field now means the service base, not the whole-bill base. Every site that writes `Ticket.totalAmount` calls it: `createIntakeTicket`, `finance.updateCharge`, `finalizeRemainderCore`, and `repriceTicket`; the wizard checkout preview calls it too. Never hand-roll the formula (same rule as `buildPricingResolveInput`). The old `finance.updateCharge` gate `total >= serviceCost` was REMOVED (a discount/promo legitimately pushes total below serviceCost); kept `total >= amountPaid` + added `discountTotal <= chargesSubtotal`.
- **`submitClerkCosts` must NEVER write `Ticket.totalAmount` (batch-2 B4, 2026-07-06).** It persists the clerk's phase-2 charge columns + `noOfPages`/`costPerPage` + `clerkApprovalStatus:'SUBMITTED'` and advances `IN_PROGRESS → WAITING_APPROVAL`, but the consumer-facing `totalAmount` stays frozen at the phase-1 base until the admin `reviewAndComplete` → `finalizeRemainderCore` recomputes it — so the consumer is only "charged" the phase-2 remainder on admin approval. Consequence: the consumer + staff charge **breakdowns hide the phase-2 line-items until `remainderFinalizedAt`** (gated in `consumer-ticket-board.tsx` + `ticket-detail-panel.tsx`) so the breakdown always reconciles with the frozen-then-finalized Total; the admin reviews proposed phase-2 charges in the Review & Complete dialog (reads the charge columns directly).
- **Tax** is a configurable fraction in `AppSetting` (`tax.rate`, `tax.enabled`, env fallback `TAX_RATE`), read via `SettingsService.getTaxRate()` (returns 0 when disabled) and **stamped onto `Ticket.taxRate`/`taxAmount`** at pricing time so historical tickets keep their rate. Per-phase for SPLIT: phase-1 base taxed at intake, phase-2 remainder taxed at finalize — calling `computeTicketTotal` with the full current charges naturally yields the cumulative total (no incremental-tax logic). Digital ONE_TIME: `serviceCost + tax === total`. Admin GET/PUT `/settings/tax` (perm `settings.read`/`settings.write`, staff-only); consumers read the effective rate via **`GET /settings/tax/rate` (perm `tickets.create`)** — the wizard MUST use this, not `/settings/tax`, or the consumer checkout 403s and shows a pre-tax total (quote≠charge).
- **Promo codes**: `PromoCode` (PERCENT/FIXED, value, maxDiscount cap, window, total + per-user limits, `serviceScope[]`, active) + `PromoRedemption` (`@@unique([promoCodeId, ticketId])`). `PromosService.validate()` is a fast-path UX check (server-recomputes + caps the discount at subtotal). **Usage limits are enforced ATOMICALLY at redemption** by `PromosService.assertWithinLimits(tx, …)` which takes a `PromoCode` `FOR UPDATE` lock + re-counts inside the intake `$transaction` before the redemption insert (closes the count TOCTOU; `validate`'s unlocked count is NOT authoritative). Admin CRUD `/promos` (perm `promos.write`); `POST /promos/validate` (perm `tickets.create`). `Ticket.promoCodeId`/`promoDiscount` persisted; redemption row written inside the creation transaction.
- **Edit-ticket reprice**: `POST /tickets/:id/reprice/preview` (read-only) + `PATCH /tickets/:id/reprice` (perm `tickets.write`). Re-resolves from edited case fields via `buildPricingResolveInput`, applies manual line overrides, recomputes via `computeTicketTotal`, persists merged `formPayload` + charges + `taxAmount` + `priceBreakdown` + total. Rejects when `!resolved.matched` (no silent zero-pricing) and when `DELIVERED`. **Status is never changed.** Downward corrections auto-credit the consumer wallet (`ADMIN_ADJUSTMENT`) — the reprice `$transaction` takes `User` then `Ticket` `FOR UPDATE` BEFORE reading `amountPaid` (same order as `finalizeRemainderCore`); an unlocked read here is a lost-update bug. `RepriceTicketDto.discountPrice` is TOP-LEVEL (not inside `overrides`); the overrides dto needs `@ValidateNested()`.
- **`Ticket.priceBreakdown` (Json?)** snapshots the resolver lines + applied discount/promo/tax at intake/reprice/finalize for invoice/audit provenance (flat columns remain the math source).
- `SettingsService`/`PromosService` are injected into `TicketsService` as **optional** constructor params (`settingsService?`, `promosService?`) so the ~30 existing 6-arg test instantiations keep compiling; production DI still injects them. Access null-safely (`this.settingsService?.getTaxRate?.() ?? 0`); the promo-redemption path throws `InternalServerErrorException` if `promosService` is missing (fail loud, never silently skip limits).
- E2E for the new admin/reprice UI: `tests/e2e/pricing-tax-promo.spec.ts` (mock-API pattern). The consumer-checkout E2E is `fixme` pending a shared intake-wizard driver (same gap as `payment-gating.spec.ts`).

### Regenerate-with-edit, instant rate, payment proof (Workstreams B/C/E, 2026-06-19)
Plan: `DOcs/superpowers/plans/2026-06-19-workstream-bce-regen-instant-proof.md`.

- **Staff "Regenerate" opens the PRE-FILLED intake wizard** (no longer a one-click `POST /tickets/:id/regenerate`). `ticket-board.tsx` navigates to the portal wizard route `/paralegal-services/<category>/<flowKey>?regenerateFromTicketId=<id>` (category from `intakeFlow.startsWith('judicial_')`, slug via `flowKeyToSlug`). The wizard hydrates a FULL copy of the source `formPayload` via `buildRegeneratePayload` (`apps/web/lib/regenerate-ticket.ts` — copies everything except the `parent_ticket_id` lineage key; does NOT roll dates/clear like `buildFutureTicketsPayload`), and submits through the normal `createIntakeTicket` (full validation, current-rate re-pricing incl. tax/promo, idempotency). **CRITICAL: the regenerate hydration MUST set `draft.consumerId = source.consumerId`** and the admin-mode user-load effect MUST skip its `consumerId = currentUser.id` default when `regenerateFromTicketId` is present — otherwise an admin-initiated regenerate misattributes the ticket (and all billing) to the admin. `Ticket.regeneratedFromTicketId` stamps lineage (`createIntakeTicket` accepts the field). The old one-click endpoint is left intact but the UI no longer calls it. Precedence: `regenerateFromTicketId` > `futureFromTicketId` > resumed-draft (each prefill effect early-returns when a higher-priority param is set).
- **Year-sensitive pricing fns live in `@wusuq/shared`** (`computeCaseSearchBase`, `computeDecidedAgeSurcharge` + the rate/threshold constants) — single source for the API resolver AND the client. `pricing.service.ts` re-exports them for back-compat. The intake checkout computes the **instant year-driven rate** as a pure derived value inside the `checkoutSummary` memo: on year/`decided_date` change it patches the **per-city** base (`computeCaseSearchBase`) for Case Search or the `ageSurcharge` for decided Case Files, propagating the delta to `serviceCost`/`total`; the 400ms-debounced server `pricingResult` stays authoritative and the patch reconciles to a no-op when it lands. NEVER multiply the per-city base by cityCount before comparing to the server's per-city `basePrice` (that double-counts multi-city searches). The instant estimate is display-only — never written to state or the submit body.
- **Payment proof.** Admin reconcile captures an optional `receiptUrl` (`ReconcilePaymentDto` + `reconcilePayment` → `WalletTransaction.receiptUrl`); `finance-board.tsx` uploads the file to `POST /wallet/receipt` FIRST then includes the URL in the reconcile POST (upload failure aborts the reconcile; in-flight guard + 10 MB cap; the existing `tx.receiptUrl` history link displays it). The **clerk** side already enforced proof: `POST /tickets/:id/clerk-receipt` ("Submit to Admin", `submitClerkReceipt`) REQUIRES a receipt file (`clerkReceiptUrl`) and advances `IN_PROGRESS → WAITING_APPROVAL` — so no second clerk proof field was added (verified no-op).

### Visibility detail + onboarding (Workstreams D/F, 2026-06-19)
Plan: `DOcs/superpowers/plans/2026-06-19-workstream-df-visibility-onboarding.md`.

- **Consumer ticket detail (`ConsumerTicketDetail`) now renders the status timeline + case details + delivery.** The consumer `findOne` already returns `history` + `formPayload`. **`redactTicketForConsumer` strips `history[].note`** (internal staff free-text — send-back/reject/override reasons) in addition to clerkCost/clerkReport/dispatchProofUrl/rep-phone; never undo that (consumers must not see staff notes). The timeline omits notes; **Case Details renders an ALLOWLIST** — only `formPayload` keys present in `PAYLOAD_LABEL` (consumer-ticket-board.tsx) — so a future server-injected payload key can't leak (add legit intake keys to the map to surface them). Delivery section gated on `chargeCapabilitiesFor(intakeFlow).delivery`.
- **Clerk listing (`findAll`) eager-loads `case: {caseNo,court,caseYear}` + `assignmentStatus`** and the clerk table surfaces case no / hearing date / acceptance / clerk-approval + delivery sub-states. `clerkCost` AND `assignmentStatus` are gated behind `!opts?.forConsumer` (consumers never receive them); `case` is the consumer's own data (fine).
- **Clerk name + earnings (D3) are INTERNAL-ONLY** — rendered in the admin/clerk `TicketDetailPanel` + the Review & Complete finalize dialog (`ticket-board.tsx`) + the clerk dashboard, NEVER in `ConsumerTicketDetail`. Earnings come from the **single source `computeClerkEarnings()` in `@wusuq/shared`** = `clerkCost (or defaultClerkCost) + attestedCharges + nonAttestedCharges + printingCharges + deliveryCharges + (pdfPurchased ? PDF_CLERK_FEE : 0)`. Don't hand-roll the sum (the two old web copies were removed). `PDF_CLERK_FEE = 100` is the clerk's cut of the Rs 300 PDF surcharge — added when the ticket purchased a PDF (`pdfSurcharge > 0` or payload `want_pdf_before_dispatch === 'Yes'`); the consumer still pays the full 300 at intake.
- **`GET /tickets/counts` (perm `tickets.read`) is role-scoped** — `representative` → own assignments, consumer-class → own `consumerId`, staff → all (`archivedAt: null`). Declared BEFORE `@Get(':id')`. Scope derives only from `actor.role`/`actor.sub` (no query-param override). `nav.tsx` renders per-status count badges (`NavItem.count` in `shell-nav.tsx`).
- **Onboarding address (F1):** `auth.completeProfile` persists `address/province/district/postalCode` (cascading geo pickers on the profile step). **Case-file metadata (F2):** `PersonalFile.caseMeta Json?` holds `{caseNo,caseYear,caseTitle,courtLevel,caseType}` (only provided keys) from the upload-drawer's new case fields.

### Country-based pricing — PKR / USD (2026-06-23)
Spec: `DOcs/superpowers/specs/2026-06-23-country-based-pricing-design.md`. Plan: `DOcs/superpowers/plans/2026-06-23-country-based-pricing.md`.

Pakistan customers are billed in PKR (the existing rates); every other country is billed in **USD** off a **separate, all-inclusive flat price list** (not FX conversion).

- **Currency is a property of the `User`** (`User.currency` `'PKR' | 'USD'`), derived ONLY by **`deriveCurrency({phone, country})` in `@wusuq/shared`** — phone dial code wins (`+92` → PKR, else USD; normalises non-`+`/local forms; country ISO is the fallback; default PKR). Stamped at signup / OTP-verify; re-derived at `completeProfile` **only when the account is inactive** (zero non-archived tickets AND zero wallet balance) — **currency locks once active** (prevents mixed ledgers). `toCurrency(value)` coerces a stored value. Backfill: `apps/api/scripts/backfill-user-currency.ts` (re-run-safe: keeps active users' existing currency, derives only for inactive ones).
- **`Ticket.currency` is snapshotted from `User.currency` at intake** (authoritative — never client-supplied); `PricingRule.currency` is a 6th unique-key dimension (`@@unique([currency, region, courtLevel, flow, yearBand, setType])`). PKR + USD rules live in one table.
- **USD is an all-inclusive flat lookup.** The resolver (`pricing.service.ts`) filters every candidate by `(r.currency ?? 'PKR') === currency` and, for `currency==='USD'`, **short-circuits**: matched rule's `basePrice` IS `base/serviceCost/total`, every surcharge 0, `ONE_TIME`. **USD ignores set type** (`requestedSetType = currency==='USD' ? null : …`) because USD rows are flat `setType=null` — without this, Case Files with a set type fell to the setType-null fallback and picked the wrong/`current` band non-deterministically. No tax, no promo for USD (intake/reprice pass `taxRate=0`, reject promo codes).
- **`paymentModelFor(flow, currency)` → USD is always `ONE_TIME`**; **`chargeCapabilitiesFor(flow, currency)` → USD = `NO_CHARGES`** (so finalize/clerk never add a phase-2 remainder to the flat price). USD Case Files is still physically fulfilled (clerk accept → receipt → dispatch → admin confirm-delivered all run; only the consumer *billing* is flat). The `.delivery` **workflow** checks stay flow-based (USD physical Case Files still dispatches); only the charge-computing `chargeCapabilitiesFor(...)` sites pass currency.
- **Every currency-touching path threads it:** `createIntakeTicket`, `regenerate`, `repriceTicket`/`repricePreview`/`buildRepriceResult` (USD reprice is flat, no phase-2 overrides), `finalizeRemainderCore`, `saveClerkCharges`, wallet auto-settlement + admin-adjustment + reprice-surplus credits (ledger rows carry the ticket's currency, never hardcoded PKR). `findAll`/`findOne`/`/wallet/me`/login-user/`serializeUser` all return `currency`.
- **USD service menu = Case Files, Case Info, Case Search only** (`USD_AVAILABLE_FLOWS` in `intake-flows.ts`; Case Filing / PoA / non-judicial are PKR-only and have no USD rules). The `ServicePicker` (server component) gates consumer tiles via the client `UsdTileGate`/`UsdServicesEmptyState` (`usd-service-gate.tsx`) — passing the rendered tile as `children` so the flow's icon function never crosses the RSC boundary. The wizard reads currency (stored user seed → `/wallet/me`, and `/users/:id` for admin/regenerate-on-behalf), gates the menu, hides the Set Type / PDF / promo inputs for USD, and shows a flat `$` checkout.
- **`formatMoney(amount, currency)` in `@wusuq/shared`** is the consumer-facing money formatter (USD → `$1,234.50` with cents, PKR → `PKR 1,234`). Consumer ticket/wallet/dashboard/topbar surfaces + the admin reprice dialog use it; **other staff/admin boards still hand-roll PKR formatting** (a known follow-up — they'd show a USD ticket's amounts with a `PKR` label).
- **USD rules are seeded by `apps/api/scripts/seed-usd-pricing.ts`** (USD-only wipe+insert, 72 rows, `isLegacy:true` so they're visible in the live `legacy` pricing mode — leaves PKR rules untouched). Data + row-builder live in `apps/api/data/usd-pricing.ts` (shared with `seed-pricing.ts`'s full rebuild). Smoke: `npx tsx scripts/smoke-usd-pricing.ts`.
- **⚠️ Pre-existing operational gotchas (NOT caused by this feature, flagged during it):** (1) `seed-pricing.ts` currently **aborts** — "Punjab case-record bands contributed 0 drafts" — its xlsx parser no longer matches `pricing-sheet.xlsx`; re-seeding PKR rules fails until the parser/xlsx is realigned (use `seed-usd-pricing.ts` for USD in the meantime). (2) `prisma migrate dev` is unusable on the Neon DB — the applied migration `20260523090000_unified_ticket_status` was edited after apply, so `migrate dev` demands a full reset; the `add_currency_pricing_ticket` migration was therefore applied non-destructively (`prisma db execute` + `migrate resolve --applied`).

### Case-type catalogue
`CourtCaseType` is the DB-backed case-type dropdown source, seeded from 8 JSON files in `apps/api/data/case-types/` (7 scraped sources + a hardcoded snapshot fallback). The `GET /case-types` endpoint in `apps/api/src/case-types/case-types.service.ts` implements a specificity-fallback chain: try `(courtLevel, subCourt, district, highCourtCode)` first, then drop dimensions one at a time until a non-empty cohort is found. Each cohort ends with a `code='OTHER'` row that triggers the wizard's `case_type_other` free-text input.

Adding a new scraper: write `scripts/scrape-case-types/scrape-<x>.ts` using `shared.ts` (Playwright bootstrap + count-floor validator), add the output filename to `SOURCES` in `seed-case-types.ts`, re-seed. Don't use the "largest <select>" heuristic for finding the case-type dropdown — several govt sites have larger unrelated selects (e.g. SCP's Advocates list with 4,639 entries). Target the case-type select by id or by `<label>` text association.

### Intake wizard
`apps/web/components/intake-wizard.tsx` renders all 8 consumer flows. Flow definitions live in `apps/web/lib/intake-flows.ts`. Key invariants:

- **`draft.step` is 1-indexed** — `activeStep = displaySteps[draft.step - 1]`. Off-by-one when jumping to a specific step is a common mistake.
- **Required-field rules are per-court-tier — single source of truth lives in `packages/shared`.** Two sides must agree or the validator rejects on submit while the wizard happily lets the user proceed:
  - **Frontend** sets `IntakeField.requiredByCourtTier?: Partial<Record<CourtTier, boolean>>` on each field, resolved via `resolveRequired(field, activeCourtTier)` (drives the `*` asterisk and the per-step validator).
  - **Backend** consults `requiredFieldsFor(flow, baseRequired, tier)` from `@wusuq/shared`, which subtracts `REQUIRED_FIELDS_OPTIONAL_BY_TIER[flow][tier]` from the flat `REQUIRED_FIELDS_BY_FLOW[flow]` list. The tier is derived from `payload.select_court_type` via `courtTierFromCourtType`.
  - When changing a per-tier required rule: update **both** `requiredByCourtTier` (wizard) **and** `REQUIRED_FIELDS_OPTIONAL_BY_TIER` (shared) in the same change. FE marks "red ✗" optional / BE still requires → submit fails on the last page with no field-level error (QA B6/B7).
- **Click-style fields commit synchronously via onBlur(key, newValue).** Radio, checkbox-tile, and tab fields call `onBlur(field.key, newValue)` after `onChange(field.key, newValue)`. `draft.payload` is stale in the click handler because setState is async; pass the new value explicitly or the validator runs against the previous value (PDF #22 root cause).
- **Case types come from the API**, never from in-code constants. The wizard fetches `/case-types?courtLevel=…&subCourt=…&district=…&highCourtCode=…` and stores the row's `label` in `payload.case_type`.
- **Payload field aliases** — the API normalises incoming intake payloads via `PAYLOAD_FIELD_ALIASES` in `packages/shared/src/index.ts`. Frontend can send either the canonical name or any alias (e.g. `case_no` ⇔ `case_petition_no`, `year` ⇔ `case_year`). When adding a required field, add it to `REQUIRED_FIELDS_BY_FLOW` in `tickets.service.ts` using the **canonical** name.
- **Case-status / date-field rules (2026-06).** Case Information offers only `['Pending Case', 'Unknown Case']` (no Decided — a decided case has no live info to fetch). Case Files shows the **Year field for Decided too** (owner doc #2) — both Year and Decided Date render; pricing still derives the priced year from `decided_date` (`buildPricingResolveInput` prefers it) and `withDerivedYear` only backfills `year` when empty, so a user year is never clobbered. The rich **`CaseDateBlock`** (the "Mark date as unknown" toggle + previous/next-hearing date) renders only when a step exposes the full triad `case_status + case_date + future_date`, AND the `case_status` field's own `showWhen` is satisfied (`caseDateBlockVisible` in `intake-wizard.tsx`) — the latter keeps the block hidden for CNIC-only Case Search (where `case_status` is gated on `search_method` ∈ details/both). The flat-loop `DATE_HANDLED_KEYS` skip stays keyed on `stepHasCaseDate` so those keys never leak to the flat renderer when the block is hidden.

### Intake-draft lifecycle (autosave / Start Fresh / submit)
The wizard keeps at most one active server draft per `(consumerId, flow)`. Three lifecycle events need to stay in lock-step or the consumer sees phantom drafts:

- **Autosave** debounces 5 s after the last field change. Guarded by `submittingRef` — set BEFORE any `await` in `submitTicket`, cleared by `resetForm` (success) or the catch (failure). Any pending timer is also explicitly cleared at submit. Without both, the autosave fires from a stale closure and resurrects the draft the submit just deleted (QA "prefill bug" root cause).
- **Server-side belt** lives in `TicketsService.saveIntakeDraft`: refuses the upsert when a ticket for that `(consumerId, flow)` was created in the last 30 s, returning `{ suppressed: true }`. Catches races from mobile / older sessions that don't have the FE guard.
- **Submit** (`createIntakeTicket`) deletes the `(consumerId, flow)` draft on success via `prisma.ticketIntakeDraft.delete().catch(() => undefined)` — best-effort, don't add error handling around it.
- **Start Fresh** in the wizard (`startFresh()` in `intake-wizard.tsx`) calls `DELETE /tickets/intake-drafts/active?flow=…` before calling `resetForm()`, so a subsequent reload doesn't restore the discarded payload. The DELETE is best-effort — local reset still happens if the server call fails.
- **Resumed-draft banner** renders above the step rail when `resumedDraftAt` is set by the hydration effect, with an inline Start Fresh CTA. This makes the restore behaviour explicit (consumers used to think the wizard was pre-filling from a previous ticket).

### Consumer auth — email-only signup, phone drives region (OTP deferred, 2026-06-29)
Spec: `DOcs/superpowers/specs/2026-06-29-email-only-auth-phone-region-design.md`. OTP/SMS is **not** integrated (v2), so the consumer auth surface is email/password only:
- **One login screen at `/consumer/login`** (email *or* phone + password → `/auth/login`). `/consumer/login/email` is a permanent **redirect** to it. The old phone→OTP→profile flow and its components (`use-login-flow.ts`, `login-shell.tsx`, `steps/*`, the OTP `api.ts`) were **removed** from the web app; the backend OTP endpoints/`OtpService` are left intact for v2.
- **Signup (`/consumer/signup`)** is email + password + **required mobile number** + **required user type** (Civilian / Lawyer / Company). No OTP; the number is saved unverified. The mobile **dial code is the region signal** — server `deriveCurrency({phone,country})` is phone-first (`+92`/local → PKR, else USD). `SignupDto.phone` is now required (`@MinLength(7)`) and `consumerKind` is required (`@IsIn(CONSUMER_KINDS)`), persisted at user creation.
- **User-type labels remap** (`CONSUMER_KIND_LABELS` in `@wusuq/shared`): Civilian = `NON_LAWYER`, Lawyer = `LAWYER`, Company = `CORPORATE`. The enum **values are unchanged** (no Prisma migration) — only the display labels. Don't add a `CIVILIAN`/`COMPANY` enum value.
- Both forms still use the shared `CountryPicker` (`components/ui/country-picker.tsx` + `lib/countries.ts`). The phone field stores **local digits only**; the dial prefix is composed inline at submit in `signup/page.tsx` (strip whitespace / `+` / leading zeros, then prepend `+<dial>` unless already present). PK uses strict `PK_PHONE_REGEX`; others a permissive 7–15 digit `GENERIC_PHONE_REGEX`. Never re-introduce a hard-coded `+92` span.

## Environment Variables

**API** (`.env`):
| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes (prod) | Neon-compatible Postgres |
| `JWT_ACCESS_SECRET` | Yes | Access token signing |
| `JWT_REFRESH_SECRET` | Yes | Refresh token signing |
| `CORS_ALLOWED_ORIGINS` | Yes (prod) | Comma-separated origins |
| `ALLOW_START_WITHOUT_DB` | Local only | Skip DB check on startup |

**Web** (`.env.local`):
| Variable | Default |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000/api` |

## Deployment

- **API:** Render.com (`render.yaml`), Node 22, health check at `GET /api/health`. Start command is `node dist/main.js`.
- **Web:** Vercel (`apps/web/vercel.json`), region `sin1` (Singapore)
- CI runs lint → typecheck → build → Playwright E2E on every push/PR to `main`
- **API build output is pinned to `dist/main.js` (2026-06-28).** `apps/api/tsconfig.build.json` sets `rootDir: "./src"`, points `tsBuildInfoFile` back into `dist`, and excludes `data`. Why: any `.ts` **outside** `src/` that's in the tsc program (e.g. `apps/api/data/usd-pricing.ts`, added with USD pricing) makes tsc infer `rootDir` as the common ancestor and silently relocate output to `dist/src/main.js` → `node dist/main.js` 404s on Render (the 2026-06-28 deploy failure: build "succeeds", start crashes with `MODULE_NOT_FOUND`). Pinning `rootDir` fixes that but moves tsc's incremental cache to `./tsconfig.build.tsbuildinfo` (**outside** `dist`), which nest's `deleteOutDir` doesn't clear — so a **cached** build (Render restores a build cache) reads the stale cache, emits nothing, and `dist/` is left empty; `tsBuildInfoFile: "./dist/..."` puts it back where `deleteOutDir` wipes it each build (full emit guaranteed) while `pnpm typecheck` still reuses it. Don't add compiled `.ts` outside `src/` for the app (seed-only `.ts` belongs in `data`/`scripts`, run via tsx); if you must, it now fails the build loudly ("not under rootDir") instead of breaking the deploy. Excluding `data` from the build would drop it from typecheck, so **`tsconfig.scripts.json` type-checks `scripts/` + `data/`** (wired into the api `typecheck` script) — seed code now has CI type coverage it partly lacked before.

## Local Dev Seed

Default super admin created by `pnpm prisma:seed`:
- Email: `superadmin@wusuq.com`
- Password: `SEED_ADMIN_PASSWORD` env var (falls back to `password` for local dev only)

Seed safety (2026-06, audit 4.3): the seed **never overwrites an existing
user's passwordHash** and refuses to run in production without
`SEED_ADMIN_PASSWORD` set.

### Walkthrough fixes (2026-06-27)

Plan: `DOcs/superpowers/plans/2026-06-26-walkthrough-fixes.md`. Shipped from an owner screen-recording walkthrough of the full ticket lifecycle; survived 4 code-review passes.

- **Pay-at-end.** A ticket may be assigned directly from **UNPAID** — `assign()` explicitly accepts an UNPAID source (`ticket.status === 'UNPAID' || allowedTransitions.includes('ASSIGNED')`). The generic `STATUS_TRANSITIONS` map stays **narrow** (`UNPAID: ['PAID']`) so the generic `updateStatus` path can't reach ASSIGNED without an Assignment row (orphan). The money gate lives **only at DELIVERED**; wallet dues + FIFO auto-settlement already handle unpaid-but-completed tickets. Consumer Pay controls are gated on outstanding-and-not-delivered, **not** on `status==='UNPAID'` (both list card + detail).
- **`assign()` writes `totalAmount` via `computeTicketTotal`** (keeps tax + promo) — never hand-roll the sum (critical now that pay-at-end bills this persisted total).
- **Representative redaction covers ALL clerk-mutation return paths.** `redactMutationResultForCaller(result, actorRole)` (gates on `isStaffRole`, NOT a literal `'representative'`) wraps the returns of `acceptAssignment`/`rejectAssignment`/`submitClerkCosts`/`submitClerkReceipt`/`dispatchDelivery`/`recordNextHearing`; `saveClerkCharges` redacts its `findOne` result the same way. `findAll`/`findOne` already redact reps (`redactTicketForRepresentative` strips consumer money + PII). Consumer redaction also strips `noOfPages`/`costPerPage`. **Don't add a new clerk-mutation endpoint without redacting its ticket return.**
- **`recordNextHearing` now calls `ensureClerkActionAllowed`** (was a cross-ticket IDOR — any rep could overwrite any ticket's hearing data).
- **Totals on screen always render `ticket.totalAmount`** — the admin `TicketDetailPanel` no longer hand-sums components (it was adding clerk cost + dropping tax); clerk cost shows only in the internal earnings line. Consumer receipt renders a **Tax line** so line items reconcile to the total.
- **New `Ticket` columns `noOfPages Int?` + `costPerPage Decimal?`** persist the clerk's printing breakdown (was computed-then-discarded); admin "Review & Complete" shows the page breakdown + Additional Cost + a clerk-receipt link + uploaded docs.
- **`PaymentSettings` gained `jazzCash` + `easyPaisa`** (consumer pay page renders them; admin Finance board populates them). Bank/wallet details must be populated once or the pay page shows "not configured".
- **Clerk-dropdown city scoping.** `representativeCandidates` returns **only** reps serving the ticket city (empty if none — the FE shows "tick Override city restriction"); no full-pool fallback (it caused a confusing 409). `assign` still enforces the city restriction unless `forceAssign`.
- **TCS delivery city is pinned to the case city** (read-only in the renderer) and **re-stamped at every save/submit** by `withDerivedYear` so it can't go stale → misdelivery. The **Uber** flow has its own editable `delivery_city` field (the owner's actual "needs a city" ask) + a lat,lng `pattern` on `coordinates`.
- **Currency derivation hardened.** `users.service` derives currency on admin create/update (update keeps the stored `country`, re-derives only while inactive); consumer signup requires an explicit country (no silent PK default). Legacy accounts (created before the 2026-06-23 country-pricing commit) are PKR-by-default and fixed by `backfill-user-currency.ts --rederive-legacy`.
- **Admin↔clerk payload display** uses an allowlist + value humanizer (`docBundleLabel`, court-tier aware) so raw `*_id`/`source`/enum keys don't leak on the ticket-detail screen; duplicate "City" row removed.
- **Regenerate wizard** now fires the `/geo/cities/:id/courts` fetch in its prefill effect (was hanging on "Loading courts…").

### Owner walkthrough round 2 (2026-06-29)

Spec: `DOcs/superpowers/specs/2026-06-29-walkthrough-round2-design.md`. Sequenced after the email-only-auth change.

- **Clerk dashboard (new).** Representatives land on `/dashboard`, which renders a **clerk view** (alongside consumer/admin) backed by **`GET /dashboard/clerk-summary`** (`DashboardService.getClerkSummary`, self-scoped by `actor.sub`, gated on `tickets.read` — reps hold it, so NO `ROLE_PERMISSIONS` change). Shows earnings **realized** (Σ over COMPLETED+DELIVERED) / **pending** (IN_PROGRESS+WAITING_APPROVAL) / **this-month**, status counts, recent assignments, upcoming hearings. `app/page.tsx` now lands reps on `/dashboard` (was `/tickets/assigned`); "Dashboard" added to `buildClerkItems`.
- **Self-collection has no input** — the `pickup_location` field is now `type: 'info'` (Case Files + Case Search); the renderer composes "Collect from {court} in {city}" from the Step-1 court choice (no per-court street address exists). Not in any backend required-fields list, so safe.
- **Billing-region chip removed** from `consumer-profile-board.tsx` (currency still drives billing server-side, just not shown to consumers).
- **Admin Review & Complete dialog** shows the clerk's **submitted** value (read-only) beside each editable charge input for comparison; earnings line now includes the PDF 100.
- **Post-signup onboarding** — new skippable multi-step wizard at **`/consumer/onboarding`** (Step 1 address+postal → Step 2 cascading province/district/city via `/geo/provinces|districts` → Step 3 finish). Saves via `POST /auth/profile/complete` (note: it requires `name`, pulled from the stored user). Signup redirect default is now `/consumer/onboarding` (explicit `?next=` still wins); login still → dashboard. The profile-completion banner's optional CTA points here.

### Structured case card + full edit-ticket (2026-06-28)

Spec: `DOcs/superpowers/specs/2026-06-28-case-card-and-full-edit-design.md`. Plan: `DOcs/superpowers/plans/2026-06-28-case-card-and-full-edit.md`. The two remaining owner-walkthrough asks.

- **Structured case card.** Ticket-detail screens render a tier-aware case card, not a flat payload dump. `buildCaseView(payload, tier)` (`apps/web/lib/case-view.ts`, pure, unit-tested) → a view model (title, colour-coded status badge [Pending=rose / Decided=green / Unknown=gray], tier-ordered summary grid, bench block with `BENCH_TYPE_LABELS`, hearings block from `case_date`/`future_date`), rendered by `<CaseRecordCard>` (`apps/web/components/case-record-card.tsx`). Used by BOTH the staff `TicketDetailPanel` (admin + clerk) and consumer `ConsumerTicketDetail`. **It reads a fixed allowlist of case keys only — never iterates arbitrary payload keys**, so `*_id`/`source`/enum keys can't leak by construction (replaced the old `renderPayload`/`PAYLOAD_LABEL` loops, now deleted). `SUMMARY_FIELDS` dual-keys `case_petition_no`/`case_no` and `case_year`/`year`; `isCaseViewEmpty(view)` gates the "Case Details" section so an empty view shows no orphaned heading. No multi-row proceeding-history (we don't capture it). **Don't reintroduce a raw payload dump on these screens.**
- **Full edit-ticket (in place).** Staff "Edit ticket" opens the **pre-filled intake wizard in edit mode** (`?editTicketId=<id>`), NOT the old `TicketRepriceDialog` (deleted). The wizard hydrates the ticket's `formPayload`, sets `draft.consumerId = ticket.consumerId` (admin user-load default skipped when `editTicketId` is present — same misattribution guard as regenerate), disables autosave, and on submit sends the FULL edited payload to **`PATCH /tickets/:id/reprice`** (re-resolves price + recomputes total + reconciles money in place; same ticket; status unchanged; backend already supported a full `payload`). Precedence: `editTicketId` > `regenerateFromTicketId` > `futureFromTicketId` > resumed-draft (every prefill effect early-returns for a higher-priority param). Edit button hidden on `DELIVERED` and in the clerk view. Distinct from Regenerate (which clones as a new sale).
- **Web now has a scoped Jest unit-test runner** (`apps/web/jest.config.js`, `pnpm --filter @wusuq/web test`) for `lib/**/*.test.ts(x)` — excludes the Playwright `tests/e2e/*.spec.ts`. ts-jest stays at `^29.2.5` (no v30 exists; 29.4.x supports the jest-30 peer). Web E2E remains Playwright (`pnpm e2e`).

## Deferred work

Items deliberately not shipped. Full backlog with rationale in `DOcs/superpowers/specs/`. Items that affect day-to-day code decisions:

- **OTP / SMS not wired.** Phone-based signup paths fail in prod. Use email login for local testing: `/consumer/login/email` with `testconsumer@wusuq.com` / `password123`. Staff: `superadmin@wusuq.com` / `password`. Don't add runtime checks for SMS — assume it's absent.
- **LHC case-type catalogue** has no public source. Falls back to `hardcoded_fallback` rows in `CourtCaseType`. `scrape-lhc.ts` is checked in with a documented probe trail; update its `URL` constant if LHC ever publishes a search form.
- **Pricing for non-Case-Files services** — `pricing-sheet.xlsx` Sheet 2 only carries set-type rules for Case Files. Information / Filing / PoA fall back to the headline rate with `setType=null`. Don't render the Set Type picker for those services.
- **Case Search year-band mapping** — xlsx uses bespoke bands (`2023-2022`, `2021-2019`, …); seed maps onto canonical bands by best-fit overlap (last-write-wins). Two source rows can collapse into one band — verify before changing.

### React 19 / Next 16 hook-rule conventions (enforced by lint)
The `react-hooks/set-state-in-effect` rule (new in React 19) flags synchronous `setState(...)` directly inside `useEffect` bodies. **Don't disable it.** Established patterns in this codebase:
- **Loading state before a fetch in an effect** → wrap the synchronous setState in `startTransition(...)` from `react`. The rule accepts updates inside callback functions.
- **Reading `localStorage` on mount** → same: `useEffect(() => { const v = readStorage(); startTransition(() => setX(v)); }, [])`. Plain `setX(readStorage())` is still flagged.
- **Auth-guard early-exit redirects** → don't call `setIsAuthorized(false)` before `router.replace(...)`; leave the state as its `null` initial value so the loading view renders during the redirect, then the component unmounts.
- **Derived state mirroring props** → don't sync via `setState` in an effect; either derive on render or use a stable `key` to remount.

When in doubt, the rule's heuristic is "setState that fires synchronously on every render of this effect is a bug." If the update is genuinely needed post-render (DOM measurement, post-mount sync), `startTransition` is the canonical escape hatch.

## Session Log

- **2026-06-27** (branch `integration/walkthrough-fixes`) — Implemented the full owner-walkthrough fix set (17 defects + UX/behavior changes) from 4 WhatsApp screen recordings of the ticket lifecycle. Transcribed the Urdu/English voiceover (local whisper large-v3) + frame-by-frame visual pass, traced every issue to root cause, planned (`DOcs/superpowers/plans/2026-06-26-walkthrough-fixes.md`), implemented across 6 parallel worktree agents, then ran 4 code-review passes fixing all findings (incl. a clerk-redaction leak across 7 mutation paths, a `recordNextHearing` IDOR, pay-at-end, currency derivation, city-scoped clerk assignment, JazzCash/EasyPaisa payment settings). 410 API tests green; merged to `main`. DB: applied `add_ticket_clerk_page_breakdown` + `add_payment_settings_wallets` migrations; ran legacy currency backfill.

### 2026-06-28 06:50 · branch main · sess 66e87f2c

- Consumer auth overhaul (OTP deferred to v2): removed the phone→OTP→profile flow, consolidated to **one `/consumer/login`** email/phone+password screen (`/consumer/login/email` → redirect), and made signup email-only with a **required mobile number** (its dial code sets the region/currency) + a **required user type** (Civilian/Lawyer/Company → `consumerKind`). Backend `SignupDto` now requires `phone` + `consumerKind` (persisted at creation); `CONSUMER_KIND_LABELS` remapped (no enum migration). Spec: `DOcs/superpowers/specs/2026-06-29-email-only-auth-phone-region-design.md`. Verified: new `SignupDto` spec + all 35 auth tests green, web/api typecheck + web build green, lint clean. Not yet committed.
- Owner walkthrough round 2 (6 items): **clerk dashboard** (`/dashboard/clerk-summary` + clerk view + nav landing), self-collection court-pickup (info field), removed consumer billing-region chip, admin Review&Complete clerk-submitted comparison, **PDF 300/100 clerk split** via centralized `computeClerkEarnings` in shared, and a **skippable `/consumer/onboarding` wizard** (signup now redirects there). Spec: `DOcs/superpowers/specs/2026-06-29-walkthrough-round2-design.md`. Verified: 422 API tests green (incl. new `computeClerkEarnings` spec), api+web typecheck green, web build green, lint clean. Not yet committed.
- Fixed the Render API deploy failure (build OK, start crashed with `Cannot find module dist/main.js`) — root cause + the `tsconfig.build.json` `rootDir`/`tsBuildInfoFile`/`data`-exclude fix and the new `tsconfig.scripts.json` typecheck are documented in **Deployment** above. Verified: full Render build green, `pnpm typecheck` green (incl. seed code), repeated no-clean `nest build`s all emit `dist/main.js`, and `node dist/main.js` boots fully. Also tidied pre-existing uncommitted `render.yaml` edits (region pin + `CORS_ALLOWED_ORIGINS` env + a now-stale "blueprint disconnected" banner) committed in the same change.
- **2026-06-28** (branch `feat/case-card-and-edit` → merged to `main` locally) — Built the two remaining owner-walkthrough features: (1) tier-aware **structured case card** (`buildCaseView` + `CaseRecordCard`) on staff + consumer ticket detail, replacing the flat payload dump (allowlist redaction, colour-coded status, bench/hearings); (2) **full in-place edit-ticket** via a wizard `editTicketId` mode that re-prices through `PATCH /tickets/:id/reprice` (retired `TicketRepriceDialog`). Also added a scoped web Jest unit-test runner. Brainstormed → spec → plan → subagent-driven execution (8 tasks, fresh implementer+reviewer per task) → 4 review passes (final whole-branch review caught 2 CI-breakers: ts-jest@^30 unsatisfiable + an obsolete reprice-dialog e2e). 34 web unit tests + 410 API tests green; merged to main (not pushed).

### 2026-06-29 23:50 · branch main · sess bdf7fb00

### 2026-06-30 23:05 · branch main · sess 66e87f2c

### 2026-06-30 23:05 · branch main · sess ea7c4812

### 2026-06-30 23:05 · branch main · sess 4e95f3f5

- **Mobile bug class: `<label>` wrapping interactive `<button>` grids → unselectable on touch.** Root cause — a `<label>` that wraps interactive `<button>`s hijacks the tap on touch devices (iOS Safari / Chrome Android forward it to the label's first labelable control / swallow it), so the cards can't be selected on mobile; desktop *mouse* clicks are unaffected (verified in an isolated repro — that's the desktop/mobile split). Found+fixed **two** instances by converting the offending `<label>` → `<div>`: (1) the judicial **Court** field in `intake-wizard.tsx` (its non-judicial sibling already used `<div>` for the identical `ServiceCardGrid` — that's why City tiles worked but Court cards didn't on the same screen); (2) the **Case Type** (Judicial / Non-Judicial) toggle in `cases-board.tsx` (used by both consumer My Cases + portal Cases). Swept the whole web app (all 136 `<label>`s + nested button-in-button / button-in-anchor + multi-control labels): these two were the only genuine cases; no merge-conflict markers. Web typecheck + lint clean (0 errors). Not yet committed; owner to verify on a real mobile device.

### 2026-07-03 21:01 · branch main · sess ab08457d

### 2026-07-03 21:01 · branch main · sess ea7c4812

### 2026-07-03 21:03 · branch main · sess a4ee47d8

### 2026-07-03 21:03 · branch main · sess 4e95f3f5

### 2026-07-06 · branch feat/ws-a-payments · Workstream A (batch-2 payments & money)

- Owner walkthrough **batch 2** (13 screen recordings + PDF "Wusuq Edits 5-10-26 (2)", 17 items) transcribed (local whisper large-v3) + frame-by-frame visual pass (519 frames, 6 parallel agents). Consolidated grounded backlog → **7-workstream roadmap A→G** (`DOcs/superpowers/specs/2026-07-06-workstream-a-payments-money-design.md` is WS-A).
- **Shipped Workstream A (payments & money-timing):** **B4** — `submitClerkCosts` no longer writes `Ticket.totalAmount`; consumer total frozen at phase-1 base until admin `reviewAndComplete` (phase-2 breakdown rows gated on `remainderFinalizedAt` in consumer + staff panels so they reconcile). **B5** — top-up/pay unblocked: `TopupWalletDto.receiptUrl` accepts the `/wallet/receipt/<file>` app-relative path (shape-constrained), top-up modal paymentMode keys aligned to the `JAZZ_CASH/EASY_PAISA/BANK_TRANSFER` enum (Cash dropped). **C6** — new shared `PaymentMethodDetails` picker (aliases shared `PaymentMode`) reveals only the selected method's account on the pay page + top-up modal. **C1** — `computeTicketTotal` taxes the base (serviceCost+additionalServiceCost) only, not the whole bill.
- Subagent-driven, parallel worktrees (4 wave-1 + 1 wave-2), Sonnet review workflow (4 findings fixed). 432 API + 40 web tests green. Roadmap WS-B (documents/deliverables/hearings) is next.

### 2026-07-07 · branch feat/ws-b-documents · Workstream B (batch-2 documents, deliverables & hearings)

- **Shipped WS-B** (spec/plan `DOcs/superpowers/{specs,plans}/2026-07-06-workstream-b-documents-hearings*`): **B1/B2** — `/documents` list+export now filter to `visibleToConsumer` + `status ∈ {COMPLETED,DELIVERED}` for consumer callers (mirrors `redactTicketForConsumer`), killing the "Download failed" (unauthorized rows had a Download button that 403'd); document download streams get `.on('error')`→404; new inline `<DocumentPreview>` (iframe PDF / img) wired into consumer ticket detail, My Documents, admin panel (`previewKind` in `lib/document-kind.ts`; component uses `apiClient.getBlob` → object URL). **B3** — clerk-set `Ticket.scheduledDate` is authoritative for "next hearing": `buildCaseView(payload, tier, { scheduledDate })` (dead `future_date`-as-payload-key fallback removed), 3 call sites pass it, dashboard next-hearing query dropped the stray `caseId: { not: null }`. **B10** — clerk "Upload Work Documents" now renders under `WAITING_APPROVAL` too (backend `uploadDocument` has no status gate). **C14** — **consumer-safe invoice**: `consumerInvoiceLineItems`/`renderConsumerInvoicePdf` (pdfkit, `consumer-invoice.pdf.ts`, NO clerk cost, phase-2 lines gated on `remainderFinalizedAt`, uses shared `formatMoney`) + `GET /tickets/:id/invoice` (`buildConsumerInvoice`, gated on **`isStaffRole`-or-owner**, archived→404 — a rep must NOT pull it; 3.1-class IDOR guard) + "Download invoice" on the consumer ticket detail. WS-C reuses this endpoint.
- Subagent-driven parallel (Sonnet agents + Sonnet review; review caught the invoice IDOR before merge). 446 API + 49 web tests green. **Follow-up:** pre-existing `/documents` `list()` lets a rep pass `?consumerId=` to list any consumer's docs — not a WS-B regression, fix in WS-C/hardening.

### 2026-07-07 · branch feat/ws-c-consumer-actions · Workstream C (batch-2 consumer actions + IDOR hardening)

- **Shipped WS-C** (spec/plan `DOcs/superpowers/{specs,plans}/2026-07-07-workstream-c-consumer-actions*`): **C7/C8** — consumer ticket **card + detail** gained **Regenerate** (→ `/consumer/paralegal-services/${category}/${slug}?regenerateFromTicketId=`, built by `regenerateHref` in `apps/web/lib/regenerate-route.ts`; gated on `createdBy==='CONSUMER'` + a real `intakeFlow`), **Download-invoice** (reuses the WS-B `GET /tickets/:id/invoice`; shared `downloadTicketInvoice`), and **Pay-later** (pure client toast — ticket stays UNPAID, wallet net surfaces the due). The consumer regenerate wizard already worked for self-regen (prefill sets `consumerId = source.consumerId`); only the buttons were missing. **H1 IDOR** — `/documents` list+export scope a `representative` to `assignments: { some: { representativeId } }` and ignore any client `?consumerId` (staff unfiltered; consumer self-scoped via the WS-B visibleToConsumer+status gate). **H2 IDOR** — `createIntakeTicket` binds consumer-class actors to `actor.sub` (rejects a forged foreign `dto.consumerId`, coerces when omitted); `actorRole` threaded through all 9 intake controller endpoints; makes the consumer Regenerate server-safe. **B8** (consumer case-create) deferred — Cases stay staff/lawyer-curated.
- Subagent-driven parallel (Sonnet agents + Sonnet review — review came back CLEAN, both IDOR fixes correct + well-tested first pass). 452 API + 53 web tests green.
