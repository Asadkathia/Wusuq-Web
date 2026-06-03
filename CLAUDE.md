# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Graphify-first exploration (mandatory)

Before using `find`, `grep`, Glob, the Explore subagent, or reading multiple files to understand system architecture, structure, or how components connect, you **must** first consult `graphify-out/` at the repo root:

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
- `CITY_ALIAS` maps court-JSON city names like `"Babuzai (Swat)"` to the bare `GeoCity` name; a wrong alias silently leaves a tehsil with no Lower Court. Re-run `seed-geo.ts` after editing either.
- **City picker search is district/province-aware** (`matchesCitySearch` in `intake-wizard/service-geo-blocks.tsx` matches the tile `subtext` = `district · province`, not just the city name). This is required because ~28 districts have NO `GeoCity` named after the district (their cities are tehsils — e.g. Hunza → Aliabad/Gojal, Swat → Mingora/Babuzai); without district matching those districts are unfindable by name. Don't regress the search to label-only, and don't "fix" it by inserting synthetic district-named cities into the seed.

### Catalogue & pricing seeds
```bash
# Pricing — re-run after editing apps/api/data/pricing-sheet.xlsx (the
# canonical price list). Wipes PricingRule + re-inserts ~390 rules.
cd apps/api && npx tsx scripts/seed-pricing.ts
npx tsx scripts/smoke-pricing.ts   # 5 worked examples from the xlsx

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

### API Request Pipeline
```
Helmet → CORS → Body parser (10 MB) → ValidationPipe (whitelist, transform)
→ ThrottlerGuard → JwtAuthGuard → PermissionsGuard → Route handler
```

### Database Schema Key Points
- Geo hierarchy: `GeoProvince → GeoDistrict → GeoCity → CourtSeat`
- Ticket lifecycle: `PENDING → ASSIGNED → IN_PROGRESS → WAITING_APPROVAL → COMPLETED`
- Clerk approval: separate state machine `PENDING → SUBMITTED → VERIFIED / REJECTED`
- Every sensitive auth action is written to `AuditLog`

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
- `SEARCH_BOTH_SURCHARGE = 1000` — applied per city when `flow === 'judicial_case_search'` and `searchMethod === 'both'` (PDF #37). Combined with the cityCount multiplier, this yields the linear N × Rs 3,000 case-search pricing.
- `DECIDED_AGE_SURCHARGE_PER_YEAR = 1000` — derived, not rule-backed. For Decided Case Files older than 10 years, the resolver adds `(age - 10) * 1000` on top of the banded price (e.g. in 2026, a 2016 case = banded base; 2015 = base + 1,000; 2014 = base + 2,000). Lives on the per-city block so Case Search scales correctly.

**yearBand `pending` fallback.** The seed only carries `pending` set-type rules for `region='Punjab'`. For Pending Cases outside Punjab, both `availabilityFor` and `resolve` fall back to `yearBand='current'` when the requested band yields zero matches. This mirrors the wizard's implicit "pending means no decided year → use current rate" contract. Don't add ad-hoc `pending` rules for `region='other'` — fix the xlsx if the rate should genuinely differ.

Set-type rules in the xlsx only cover Case Files. Information / Filing / PoA flow through the resolver with `setType=null` — don't render the Set Type picker for those services.

**One source for the resolve input — `buildPricingResolveInput(flow, payload)` in `@wusuq/shared`.** BOTH the wizard's live checkout preview (`intake-wizard.tsx`) and the server's `createIntakeTicket` build the resolver input through this single mapper, so the quote and the persisted charge are derived from identical inputs. NEVER hand-extract resolve fields at a call site — that's exactly how the 2026-06 "quote ≠ charge" bugs happened (the server call had silently fallen behind the wizard, dropping `yearBand` → Pending Case Files charged on the `current` band, Rs 3,300 quote vs 7,300 charge; plus `caseTitle`/`cityCount`/`searchMethod` → State-vs + multi-city Case Search undercharges). Add any new pricing input to the shared builder, not to a caller.

**Year-band derivation is `deriveYearBand(caseStatus, caseYear)` in `@wusuq/shared`** — the ONLY implementation (web `computeYearBand` delegates to it; `resolve`/`availabilityFor` default to it when `yearBand` is omitted). It returns `'pending'` for any Pending status BEFORE year bucketing; a pending case must never fall into a historical/`current` band. Only `judicial_case_files` has a distinct `pending` rule; other flows fall back to `current`, so this is safe for all flows.

**Case Information pricing.** Case Information is NOT aliased to Case Files: it has its own seeded base-fee rules PLUS a region-keyed (Punjab/other) per-document-bundle add-on (`CASE_INFO_BUNDLE_SURCHARGE` + `caseInfoBundleSurcharge` in `@wusuq/shared`, re-exported from `pricing.service.ts`, keyed on `payload.required_documentations`) summed into `serviceCost`/`total`. Its delivery is digital-only → no delivery fee/charge (see physical-vs-digital model below). The wizard's bundle picker uses that same shared table and must derive region from the **selected city's province** (`geo.allCities`), NOT `payload.province` — judicial flows use `CityBlock`, which never sets `payload.province` (only the FIR `LocationBlock` does), so reading it showed the wrong region's add-on (2026-06 bug #2).

**Region derivation.** `resolve`/`availabilityFor` derive region via `deriveProvinceName` (province → GeoCity-id FK → city-name fallback). Callers (`/pricing-rules/resolve`, `/availability`, `createIntakeTicket`) must pass `cityId` (`payload.city_id`); without it, court-seat names that don't match `GeoCity.name` leave `region=undefined` and ALL region-keyed rules are discarded ("No pricing rule matched") — especially outside Punjab.

**Physical-document vs digital flows (owner spec, 2026-06).** Two service classes, and three things move together with the class:
- **Physical-document services** = Case Files + the 3 non-judicial copies (Copy of FIR, Registry/Deed, Criminal Record). These are **SPLIT** payment (base at intake, then a clerk-finalized remainder), **have a delivery leg** (collected in that 2nd payment), and expose clerk phase-2 charges (Case Files adds attestation; the non-judicial copies are printing/delivery/pdf only).
- **Digital judicial flows** = Case Information, Case Search, Case Filing, Power of Attorney. **ONE_TIME** payment, **no delivery**, no clerk charges (`NO_CHARGES`).
- The single source for "does this flow have delivery" is the `delivery` capability (`chargeCapabilitiesFor(flow).delivery`); the resolver gates its delivery fee + static delivery charge on `isPhysicalDeliveryFlow` = that capability — do NOT add a second hardcoded list. `PAYMENT_MODEL_BY_FLOW`, `SERVICE_CHARGE_CAPABILITIES` (both in `@wusuq/shared`) and the resolver must agree on the physical set.

**PDF is priced at intake, not finalize.** `resolve` folds `pdfSurcharge` into `serviceCost` when `wantPdf` (`payload.want_pdf_before_dispatch === 'Yes'`). `finalizeRemainder` must NOT re-add PDF (double-charge). The checkout shows the `PDF surcharge` line for ALL flows including SPLIT (it's billed at intake) — delivery/attested lines stay hidden for SPLIT (deferred to the 2nd payment).

**Clerk cost is internal-only** — persisted on the ticket but excluded from the consumer-facing `totalAmount` (`assignClerk` / `finalizeRemainder` / clerk-submit). Consumer views use `ConsumerTicketDetail` (`consumer-ticket-board.tsx`), never the admin `TicketDetailPanel` (which exposes clerk cost / PII).

**Wallet net balance is dynamic.** `User.walletBalance` is the **prepaid credit only** (>= 0, never negative — `clearPendingTickets` floors deductions at 0). The consumer-facing balance is computed on read in `WalletService.getMyWallet` as `net = credit − outstandingDues`, where `due = Σ max(0, totalAmount − amountPaid)` over the consumer's non-`DELIVERED`, positively-priced tickets. It goes **negative** when they owe (e.g. after "Pay later") — the ticket stays `UNPAID` (payment gate holds); verified top-ups auto-settle FIFO and the net rises back toward >= 0. Don't store the negative; don't change the admin wallet `list` (kept as prepaid). FE reads `{ balance, credit, due }` from `/wallet/me` (header chip in `shell-topbar.tsx`, hero in `consumer-wallet-board.tsx`).

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

### Intake-draft lifecycle (autosave / Start Fresh / submit)
The wizard keeps at most one active server draft per `(consumerId, flow)`. Three lifecycle events need to stay in lock-step or the consumer sees phantom drafts:

- **Autosave** debounces 5 s after the last field change. Guarded by `submittingRef` — set BEFORE any `await` in `submitTicket`, cleared by `resetForm` (success) or the catch (failure). Any pending timer is also explicitly cleared at submit. Without both, the autosave fires from a stale closure and resurrects the draft the submit just deleted (QA "prefill bug" root cause).
- **Server-side belt** lives in `TicketsService.saveIntakeDraft`: refuses the upsert when a ticket for that `(consumerId, flow)` was created in the last 30 s, returning `{ suppressed: true }`. Catches races from mobile / older sessions that don't have the FE guard.
- **Submit** (`createIntakeTicket`) deletes the `(consumerId, flow)` draft on success via `prisma.ticketIntakeDraft.delete().catch(() => undefined)` — best-effort, don't add error handling around it.
- **Start Fresh** in the wizard (`startFresh()` in `intake-wizard.tsx`) calls `DELETE /tickets/intake-drafts/active?flow=…` before calling `resetForm()`, so a subsequent reload doesn't restore the discarded payload. The DELETE is best-effort — local reset still happens if the server call fails.
- **Resumed-draft banner** renders above the step rail when `resumedDraftAt` is set by the hydration effect, with an inline Start Fresh CTA. This makes the restore behaviour explicit (consumers used to think the wizard was pre-filling from a previous ticket).

### Consumer auth — country picker + composed phone
Both `/consumer/login` and `/consumer/signup` use the shared `CountryPicker` (`components/ui/country-picker.tsx`) backed by `apps/web/lib/countries.ts`. The phone input stores **local digits only**; the dial prefix is composed at request time via `composedPhone()` in `use-login-flow.ts` (login) or inline in `signup/page.tsx` (signup): strip whitespace / `+` / leading zeros, then prepend `+<dial>` unless the user already typed it. PK uses the strict `PK_PHONE_REGEX`; other countries use a permissive 7–15 digit `GENERIC_PHONE_REGEX`. Never re-introduce a hard-coded `+92` span.

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

- **API:** Render.com (`render.yaml`), Node 22, health check at `GET /api/health`
- **Web:** Vercel (`apps/web/vercel.json`), region `sin1` (Singapore)
- CI runs lint → typecheck → build → Playwright E2E on every push/PR to `main`

## Local Dev Seed

Default super admin created by `pnpm prisma:seed`:
- Email: `superadmin@wusuq.com`
- Password: `password`

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
