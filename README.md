# Wusuq Web Monorepo

Monorepo for the Wusuq paralegal operations platform, with:
- `apps/web`: Next.js 16 portal UI
- `apps/api`: NestJS 11 API with Prisma/PostgreSQL
- `packages/shared`: shared roles, permissions, and enums

## Current State (as analyzed)

- Workspace manager: `pnpm` (`pnpm@10.6.5`)
- Runtime baseline: Node `22` (used in CI and Render deploy config)
- API auth: JWT access/refresh with RBAC + permission guards
- Database: PostgreSQL via Prisma (`DATABASE_URL`, Neon-compatible)
- Deployment split: Web on Vercel, API on Render
- CI: lint, typecheck, build, and Playwright E2E

Validation run during this analysis:
- `pnpm typecheck` passed for `apps/web`, `apps/api`, and `packages/shared`.

## Repository Structure

```text
.
├─ apps/
│  ├─ web/                 # Next.js App Router frontend
│  └─ api/                 # NestJS backend + Prisma
├─ packages/
│  └─ shared/              # Shared constants/types (roles, permissions, enums)
├─ tests/
│  ├─ e2e/                 # Playwright browser tests
│  ├─ uat/                 # UAT smoke/role scripts
│  ├─ deploy/              # Deployment verification scripts
│  └─ performance/         # k6 smoke script
├─ scripts/deploy/         # Deploy verification helper shell scripts
├─ DOcs/                   # Product/ops docs and runbooks
├─ render.yaml             # Render API deployment config
└─ playwright.config.ts    # E2E config
```

## Architecture Snapshot

### Frontend (`apps/web`)
- App Router with protected portal routes under `app/(portal)`.
- Login page at `/login`, root redirects to `/dashboard`.
- Client-side auth guard checks local JWT presence/expiry and redirects to login.
- API integration through `lib/api-client.ts` with automatic refresh-token retry on `401`.

### Backend (`apps/api`)
- Global prefix: `/api` (e.g. `http://localhost:4000/api`).
- Security middleware: Helmet, CORS allowlist, global validation pipe.
- Global guards:
  - Throttler guard (default/auth/upload rate limits)
  - JWT auth guard
  - Permissions guard
- Health endpoint: `GET /api/health` (public), reports `ok|degraded` with DB reachability.

## Core Domain Modules (API)

Main controller groups:
- `auth` (login, refresh, logout, impersonate)
- `users` + representatives
- `services` (catalog + intake flows metadata)
- `tickets` (intake, status, assignment, documents, bulk actions)
- `cases` + hearings/timeline/linked tickets
- `finance` (reconcile, invoice generate/send/download, export)
- `wallet` (top-up, review/reject transactions, history/export)
- `costing` (`service-costs`, `clerk-costs`, resolve endpoints)
- `elections` + `cabinet`
- `reports`
- `documents`
- `notifications`
- `audit-logs`
- `geo` (provinces/districts/cities/courts/police stations)
- `dashboard`
- `health`

## Data Model Highlights

Prisma schema includes:
- Identity and access: `User` with role enum + refresh token hash
- Operations: `Service`, `Ticket`, `Assignment`, `TicketStatusHistory`
- Case management: `Case`, `Hearing`, `CaseEvent`, `CaseDocument`
- Financials: `WalletTransaction`, `Invoice`, service/clerk cost rules
- Governance: `Election`, `Candidate`, `CabinetSeat`
- Platform support: `AuditLog`, `Notification`, geo hierarchy tables

## Local Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Use:
- `apps/api/.env.example` for API env vars
- `apps/web` uses `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:4000/api`)

Required API env vars:
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ALLOWED_ORIGINS` (required in production)

Optional local API override:
- `ALLOW_START_WITHOUT_DB=true` (non-production only)

### 3. Prisma setup

```bash
pnpm --filter @wusuq/api prisma:generate
pnpm --filter @wusuq/api prisma:migrate:dev
pnpm --filter @wusuq/api prisma:seed
```

Seed creates default super admin:
- email: `superadmin@wusuq.com`
- password: `password`

### 4. Run apps

```bash
# both apps in parallel
pnpm dev

# individual
pnpm dev:api
pnpm dev:web
```

Default local URLs:
- Web: `http://localhost:3000`
- API: `http://localhost:4000/api`

## Common Scripts

Workspace-level:
- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm e2e`

Operational checks:
- `pnpm deploy:verify`
- `pnpm deploy:verify:file` (loads `.env.deploy` style file)
- `pnpm uat:smoke`
- `pnpm uat:roles`
- `pnpm hypercare:check`
- `pnpm perf:smoke` (k6 required)

## Testing and Quality

- Unit tests exist mainly in API modules.
- Browser E2E tests (Playwright) cover auth guard and login flow.
- CI workflow (`.github/workflows/ci.yml`) runs:
  - install
  - lint
  - typecheck
  - build
  - Playwright E2E (Chromium)

## Deployment Notes

- API deployment config: `render.yaml` (`/api/health` health check).
- Web deployment config: `apps/web/vercel.json`.
- Deployment and cutover/hypercare runbooks are in `DOcs/runbooks/`.

## Known Context

- `apps/web/README.md` and `apps/api/README.md` are template boilerplate and do not reflect this implementation.
- This root README is intended as the canonical high-level context for contributors.
