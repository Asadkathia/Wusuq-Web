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
- **PDF #4** — Force profile-complete after signup; capture user type (Lawyer / Non-Lawyer / Corporate). Affects dashboard variants downstream.
- **PDF #7** — Post-ticket-completion notification + "order another service for same city/court" prompt.

### Geo
- **PDF #8** — Special Court availability per-city audit (cross-reference `apps/api/src/geo/pakistan-courts.json` against the `Pakistan Court Wise` sheet in `apps/api/data/pricing-sheet.xlsx`).

### Case Files / Case Information
- **PDF #11** — Helper-text copy under every wizard field. `IntakeField.hint` infrastructure is shipped; awaiting copy strings from the product owner.
- **PDF #22** — "Pending Case requires two clicks" bug. Not reproducible in current code — recheck with reporter or fold into a wider field-renderer audit.

### Case Filing
- **PDF #15 + #16 (clerk side)** — Surface the captured bench shape (`payload.bench`) in the staff ticket detail panel; currently only the derived `judge_name` string is displayed.

### Catalogue scraping — out of M2.1 v1 scope
- LHC, PHC, BHC scrapers (Lahore / Peshawar / Balochistan High Courts) — fall back to `hardcoded_fallback` in `CourtCaseType` for now.
- Non-Punjab Lower Court scrapers (Sindh, KPK, Balochistan district-court portals).
- Special Court scraping.
- Federal Shariat Court scraping.

### Admin / staff
- Admin UI to edit `CourtCaseType` rows (today: CLI / SQL only).
- Admin UI to edit `PricingRule` rows (today: re-run the xlsx-driven seed).
- Migration of historical ticket `case_type` display strings to canonical codes (currently forward-only).

### Infrastructure
- **OTP / SMS provider** integration (Twilio / Vonage / local SMSC selection).
- Scraper scheduling — currently manual quarterly run; consider a low-priority cron when the catalogue stabilises.

### Minor UI follow-ups
- Live `apps/api/data/pricing-sheet.xlsx` reload on seed re-run (today: copy + re-run).
- Per-flow "Case Filing" remote workflow scaffolding (PDF #42 / #43) is shipped at the wizard level; backend-side dispatch routing to the clerk's court office is still placeholder text in the UI.
