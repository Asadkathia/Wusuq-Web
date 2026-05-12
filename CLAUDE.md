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

## Deferred work (Wusuq Edits 5-10-26 backlog)

Items from the `Wusuq Edits 5-10-26.pdf` feedback that are intentionally deferred. Pick these up in future batches.

### Onboarding
- **PDF #2** — Pending tickets: add "Future tickets" button + prompt consumer for next hearing date. No UI surface today.
- **PDF #3** — Phone country/region selector instead of hardcoded `+92`. Paired with the deferred OTP/SMS provider.
- **PDF #7** — Post-ticket-completion notification + "order another service for same city/court" prompt.

### Case Files / Case Information
- **PDF #11** — Helper-text copy under every wizard field. `IntakeField.hint` infrastructure is shipped; awaiting copy strings from the product owner.

### Catalogue scraping — still uncovered
- **LHC scraper** — `scrape-lhc.ts` exists with a documented probe trail in its header but the Lahore High Court doesn't publish a public case-type catalogue today (every plausible portal returns 404/500/blocked). Falls back to `hardcoded_fallback` in `CourtCaseType`. Update the `URL` constant if LHC ever publishes a search form.
- Non-Punjab Lower Court scrapers (Sindh, KPK, Balochistan district-court portals).
- Special Court scraping.
- Federal Shariat Court scraping.

### Admin / staff
- Admin UI to edit `CourtCaseType` rows (today: CLI / SQL only).
- Admin UI to edit `PricingRule` rows (today: re-run the xlsx-driven seed).
- Migration of historical ticket `case_type` display strings to canonical codes (currently forward-only).

### Consumer-friendly case-type dropdown (post-shipped catalogue)
The `CourtCaseType` catalogue (3,493 rows across 8 sources) is shipped end-to-end but the wizard renders it as a flat dropdown ordered by scrape-emission order (`priority = 1000 − optionIndex`). With 36–87 options per cohort this is friction. Five layers of improvement, roughly ordered by effort:
- **Layer 1 — type-ahead search + `Long form (CODE)` display.** Pure renderer change in a new `apps/web/components/intake-wizard/case-type-select.tsx`. Filter by case-insensitive substring against both `code` and `label`. Render `"Writ Petition (W.P.)"` when `code !== label`, else just `label`. No data work, no editorial.
- **Garbage cleanup.** One-off `isActive=false` sweep for obvious scraper-produced garbage (e.g. IHC's `code: "Cr"`, blank labels, duplicate placeholders). Maintenance, no UX change.
- **Layer 2 — curated "Most common" pinned subset.** New `pinned BOOLEAN` column on `CourtCaseType` + a seed file `apps/api/data/case-types/pinned.json` keyed `"courtLevel|highCourtCode|subCourt"` listing ~6 codes per cohort. Renderer shows a "─ Most common ─" section above the alphabetical full list. Editorial cost ≈ 75 entries (13 cohorts × ~6). Best done with a Pakistani litigator's input, otherwise commit a best-guess and iterate via PR.
- **Layer 3 — category grouping** (Civil / Criminal / Constitutional / Tax / Family / Commercial / …). Adds a `category` column; bulk-assigning categories to ~3,500 rows is the editorial cost. Cleaner long-form scan, but Layer 2 likely covers 80% of the pain.
- **Layer 4 — plain-language descriptions.** Per-row `description` column. On hover/expand the option reveals a one-sentence non-lawyer explanation ("Writ Petition (W.P.) — a petition asking the High Court to enforce a fundamental right …"). ~250 unique case types across cohorts; significant editorial work. Most valuable to PDF #4's Non-Lawyer / Corporate user types.
- **Layer 5 — self-tuning by analytics.** `usage_count` increment on every wizard submit + a scheduled job that rewrites `priority` based on running counts. Most ergonomic long-term, but blocked on having an analytics hook. Eliminates the editorial cost of Layer 2 once enough traffic accumulates.

Recommended near-term path: ship Layer 1 + garbage cleanup unconditionally; layer 2/3/4 are editorial-heavy and best deferred until either you have a curator or analytics tell us what to prioritise.

### Infrastructure
- **OTP / SMS provider** integration (Twilio / Vonage / local SMSC selection).
- Scraper scheduling — currently manual quarterly run; consider a low-priority cron when the catalogue stabilises.

### Minor UI follow-ups
- Live `apps/api/data/pricing-sheet.xlsx` reload on seed re-run (today: copy + re-run).
- Per-flow "Case Filing" remote workflow scaffolding (PDF #42 / #43) is shipped at the wizard level; backend-side dispatch routing to the clerk's court office is still placeholder text in the UI.

### Lint hygiene (CI-passing warnings, 2026-05-12)
The Next 16 / React 19 dependency bump introduced stricter hooks rules and surfaced legacy warnings. CI is green (0 errors) but **15 warnings remain** that should be cleaned up opportunistically:
- **Unused `_icon` destructure** in 4 paralegal-service `[flowKey]/page.tsx` files (consumer + portal × judicial + non-judicial). Icon is read from the flow definition but never rendered — decide whether to render it or drop the destructure.
- **Unused imports / identifiers** — `SectionHeader` (case-detail), `Button` (consumer-cases-board), `useEffect` + `Check` (create-representative-form), `consumerLabel` (intake-wizard L229), `StatusPill` (pricing-rules-board).
- **`react-hooks/exhaustive-deps`** missing deps:
  - `case-drift-banner.tsx:46` — missing `reload`.
  - `intake-wizard.tsx:576, 629` — missing `draft.payload` (intentional? verify before adding — autosave loops are easy to introduce here).
  - `intake-wizard.tsx:952` — missing `saveDraft`.
- **`jsx-a11y/role-has-required-aria-props`** — `ui/select.tsx:150` combobox is missing `aria-controls` (currently only sets `aria-expanded`); needs an id-linked listbox.

### React 19 / Next 16 hook-rule conventions (enforced by lint)
The `react-hooks/set-state-in-effect` rule (new in React 19) flags synchronous `setState(...)` directly inside `useEffect` bodies. **Don't disable it.** Established patterns in this codebase:
- **Loading state before a fetch in an effect** → wrap the synchronous setState in `startTransition(...)` from `react`. The rule accepts updates inside callback functions.
- **Reading `localStorage` on mount** → same: `useEffect(() => { const v = readStorage(); startTransition(() => setX(v)); }, [])`. Plain `setX(readStorage())` is still flagged.
- **Auth-guard early-exit redirects** → don't call `setIsAuthorized(false)` before `router.replace(...)`; leave the state as its `null` initial value so the loading view renders during the redirect, then the component unmounts.
- **Derived state mirroring props** → don't sync via `setState` in an effect; either derive on render or use a stable `key` to remount.

When in doubt, the rule's heuristic is "setState that fires synchronously on every render of this effect is a bug." If the update is genuinely needed post-render (DOM measurement, post-mount sync), `startTransition` is the canonical escape hatch.
