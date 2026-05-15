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
`PricingRule` is keyed on 5 dimensions: `(region, courtLevel, flow, yearBand, setType)`. The resolver in `apps/api/src/pricing/pricing.service.ts` returns a line-item breakdown — `base, pdfSurcharge, deliveryFee, titleSurcharge, searchBothSurcharge, attestedCharge, nonAttestedCharge, total` — plus an `availability: boolean` flag. When `availability=false`, the wizard hides the combination (e.g. Lower-Court Non-Attested for decided cases — the "Can't Get" sentinel from the xlsx). `apps/api/data/pricing-sheet.xlsx` is the canonical price list; edit there and re-run `seed-pricing.ts`. Some surcharges live as constants in the resolver, not as rule rows:
- `STATE_VS_SURCHARGE = 1000` — applied when `caseTitle` matches `/^state vs/i` (PDF #14).
- `SEARCH_BOTH_SURCHARGE = 1000` — applied per city when `flow === 'judicial_case_search'` and `searchMethod === 'both'` (PDF #37). Combined with the cityCount multiplier, this yields the linear N × Rs 3,000 case-search pricing.

Set-type rules in the xlsx only cover Case Files. Information / Filing / PoA flow through the resolver with `setType=null` — don't render the Set Type picker for those services.

### Case-type catalogue
`CourtCaseType` is the DB-backed case-type dropdown source, seeded from 8 JSON files in `apps/api/data/case-types/` (7 scraped sources + a hardcoded snapshot fallback). The `GET /case-types` endpoint in `apps/api/src/case-types/case-types.service.ts` implements a specificity-fallback chain: try `(courtLevel, subCourt, district, highCourtCode)` first, then drop dimensions one at a time until a non-empty cohort is found. Each cohort ends with a `code='OTHER'` row that triggers the wizard's `case_type_other` free-text input.

Adding a new scraper: write `scripts/scrape-case-types/scrape-<x>.ts` using `shared.ts` (Playwright bootstrap + count-floor validator), add the output filename to `SOURCES` in `seed-case-types.ts`, re-seed. Don't use the "largest <select>" heuristic for finding the case-type dropdown — several govt sites have larger unrelated selects (e.g. SCP's Advocates list with 4,639 entries). Target the case-type select by id or by `<label>` text association.

### Intake wizard
`apps/web/components/intake-wizard.tsx` renders all 8 consumer flows. Flow definitions live in `apps/web/lib/intake-flows.ts`. Key invariants:

- **`draft.step` is 1-indexed** — `activeStep = displaySteps[draft.step - 1]`. Off-by-one when jumping to a specific step is a common mistake.
- **Required-field rules are per-court-tier.** Use `IntakeField.requiredByCourtTier?: Partial<Record<CourtTier, boolean>>`. Resolve at render time via `resolveRequired(field, activeCourtTier)`. The `*` asterisk and validation gate both consult the same resolver. Active tier comes from `payload.select_court_type`.
- **Click-style fields commit synchronously via onBlur(key, newValue).** Radio, checkbox-tile, and tab fields call `onBlur(field.key, newValue)` after `onChange(field.key, newValue)`. `draft.payload` is stale in the click handler because setState is async; pass the new value explicitly or the validator runs against the previous value (PDF #22 root cause).
- **Case types come from the API**, never from in-code constants. The wizard fetches `/case-types?courtLevel=…&subCourt=…&district=…&highCourtCode=…` and stores the row's `label` in `payload.case_type`.
- **Payload field aliases** — the API normalises incoming intake payloads via `PAYLOAD_FIELD_ALIASES` in `packages/shared/src/index.ts`. Frontend can send either the canonical name or any alias (e.g. `case_no` ⇔ `case_petition_no`, `year` ⇔ `case_year`). When adding a required field, add it to `REQUIRED_FIELDS_BY_FLOW` in `tickets.service.ts` using the **canonical** name.

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
