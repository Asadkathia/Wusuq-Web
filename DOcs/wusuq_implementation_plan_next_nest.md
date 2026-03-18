# Wusuq Rebuild Implementation Plan (Next.js + NestJS + PostgreSQL on Neon)

Last Updated: 2026-03-19

## 1) Objective
Rebuild the current Wusuq portal as a maintainable, modular system with clear API contracts, role-based access control, auditable financial operations, and full module parity with the documented legacy system.

## 2) Target Technology Stack
- Frontend: `Next.js` (TypeScript, App Router)
- Backend: `NestJS` (TypeScript, REST API, JWT)
- Database: `PostgreSQL` on `Neon`
- ORM: `Prisma`
- Monorepo: `pnpm` workspaces
- Deploy: `Vercel` (web), `Render` (api)

## 3) Implemented Baseline in This Repository
- Monorepo created with:
  - `apps/web`
  - `apps/api`
  - `packages/shared`
- Shared enums/types package added (`@wusuq/shared`):
  - roles
  - ticket statuses
  - payment modes
- API modules scaffolded for:
  - auth, users, roles-permissions, services, tickets, assignments, finance, wallet, costing, elections, cabinet, reports, documents, notifications, audit-logs, geo, health, prisma
- Phase 2 backend core implemented:
  - JWT access/refresh with hashed refresh-token rotation
  - global auth guard + permission guard
  - Prisma-backed users CRUD + representative creation
  - audit-log module and auth/user lifecycle event logging
- Phase 3 baseline implemented:
  - DB-backed service catalog with judicial/non-judicial typing
  - ticket intake creation endpoints for all 7 confirmed flows
  - intake draft save/load API and ticket document upload endpoint
  - Next.js intake wizard with documented multi-step fields for all 7 flows
  - backend payload validation rules per flow for required field enforcement
- Phase 4 implemented:
  - status-tab ticket board UI (pending/assigned/in-progress/completed/immature)
  - assignment modal + representative lookup by geography filters
  - timeline/status history endpoint and UI panel
  - bulk actions and regenerate/clone ticket workflow
- Phase 5 implemented:
  - finance ledger API and UI with per-ticket totals, paid, remaining, status
  - payment reconciliation endpoint integrated with ticket payment status updates
  - invoice generate/download/send endpoints with invoice lifecycle status
  - wallet top-up verification workflow (pending/verified/rejected) with UI review queue
- Phase 6 implemented:
  - service and clerk cost rule persistence tables with year-from/year-to range support
  - cost rule CRUD + resolver endpoints (`/service-costs/resolve`, `/clerk-costs/resolve`)
  - rule specificity resolution (case type/province/audience) with active year matching
  - ticket pricing integration at intake (service cost) and assignment (clerk cost/override)
- Phase 7 implemented:
  - elections CRUD with candidate add/list/update and finalize workflow
  - election finalization winner calculation by position and cabinet seat materialization
  - cabinet module/API/UI with member/position/election/year/tenure/votes listing
  - reports module using real aggregations for logs, processed, service/city/status, turnaround
  - documents repository API/UI listing uploaded ticket documents with search and metadata
- Phase 8 hardening baseline (in progress):
  - global HTTP hardening via `helmet`
  - global and endpoint-level rate limiting via `@nestjs/throttler` (auth/upload/wallet)
  - health endpoint upgraded with DB connectivity status check
  - performance smoke test script added (`tests/performance/api_smoke.js`)
  - UAT smoke execution script added (`tests/uat/api_uat_smoke.mjs`) with execution output persisted to `DOcs/runbooks/wusuq_uat_execution_log.md`
  - non-functional smoke automation now verifies both `/health` and auth throttling (`/auth/refresh` burst -> `429`)
  - Prisma bootstrap adjusted to allow startup without `DATABASE_URL` for local smoke and route-level verification (health reports `database: down`)
  - API e2e baseline updated to assert health payload contract
  - UAT and cutover/hypercare runbooks added under `DOcs/runbooks/`
- Core REST route scaffolds created:
  - auth: `login/refresh/logout`
  - tickets: list/status/assign/bulk actions
  - finance and wallet routes
  - service/clerk cost routes
  - elections/reports/documents routes
- Prisma schema initialized with core entities and enums.
- Next.js portal route skeleton created for all major app sections.
- CI workflow added for lint/typecheck/build.

## 4) Architecture Decisions
- Single monorepo for synchronized web/api/shared contracts.
- Shared DTO-friendly enums in `packages/shared` to avoid drift.
- JWT access + refresh strategy with RBAC guards.
- Financial ledger model as append-only (reversals via compensating entries).
- Ticket status transitions constrained at service layer.

## 5) Domain Modules (Planned Full Scope)
- Identity and RBAC
- User and representative management
- Service catalog (judicial/non-judicial)
- Ticket intake and lifecycle
- Assignment workflows
- Finance, wallet, invoices, reconciliation
- Cost rule engine (service/clerk)
- Elections and cabinet
- Reports and exports
- Documents repository and secure access
- Audit logs and observability

## 6) API Contracts to Lock Early
- Auth:
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `POST /auth/logout`
- Tickets:
  - CRUD + `PATCH /tickets/:id/status`
  - `POST /tickets/:id/assign`
  - bulk operations
- Finance/Wallet:
  - `GET /finance`
  - `GET /wallet`
  - `POST /wallet/topup`
  - transaction history
- Costs:
  - `GET/POST/PATCH /service-costs`
  - `GET/POST/PATCH /clerk-costs`
- Elections:
  - list/create/update/finalize + candidate flows
- Reports:
  - module data endpoints + export endpoints

## 7) Database Model (Core)
- Users, roles, permissions
- Services + geography/jurisdiction
- Tickets + status history + assignments
- Ticket documents
- Finance ledger + wallet transactions + invoices/payments
- Cost rule tables for service and clerk pricing
- Elections, candidates, cabinet seats
- Notifications, audit logs, report exports

## 8) Security and Operations Baseline
- Input validation via class-validator DTOs
- CORS and secure cookie strategy (to finalize in Phase 2)
- Rate limiting on auth/upload endpoints (Phase 8 hardening)
- Health checks and structured logs
- CI gates: lint, typecheck, build

## 9) Complete Roadmap

### Phase 0 - Foundation and planning
- Map modules from docs into backlog
- Finalize architecture decisions
- Define API conventions and shared enums
- Output: technical blueprint and sprint board

### Phase 1 - Platform bootstrap
- Scaffold monorepo and shared package
- Bootstrap Nest + Prisma + Neon config
- Bootstrap Next protected app shell
- Add CI pipeline
- Output: deployable skeleton

### Phase 2 - Identity, RBAC, and user management
- Implement JWT guards and refresh-token rotation
- Implement roles/permissions guards
- Build user CRUD and representative management
- Add profile and security flows
- Add audit events for auth/user lifecycle

### Phase 3 - Service catalog and ticket intake
- Model all judicial/non-judicial services
- Build 7 multi-step intake forms
- Implement upload pipeline and document metadata
- Create pending tickets for all flows

### Phase 4 - Ticket operations and assignment
- Ticket boards by status (search/filter/sort)
- Assignment workflows by city/district mapping
- Status transition engine + timeline
- Bulk actions + regenerate/clone behavior

### Phase 5 - Finance, wallet, and invoicing
- Implement ledger views and totals
- Wallet top-up with receipt verification
- Invoice generation/download/send
- Payment reconciliation and state management

### Phase 6 - Cost rules and pricing engines
- Service cost rules CRUD
- Clerk cost rules CRUD
- Single-year and year-range modes
- Rule resolution integration into ticket pricing

### Phase 7 - Elections, cabinet, reports, documents
- Election lifecycle and finalization
- Cabinet result and seat assignment views
- Reports module (operational and financial)
- Document repository with RBAC

### Phase 8 - Hardening, UAT, and launch
- Security hardening and performance baselines
- Reliability checks and recovery runbooks
- UAT by role with signoff checklist
- Cutover, hypercare, and rollback readiness

## 10) Testing Strategy
- Unit tests:
  - role guards
  - status transition rules
  - pricing resolver
  - wallet ledger operations
  - report aggregations
- Integration tests:
  - login/refresh/logout
  - ticket create->assign->in progress->completed
  - wallet top-up verified->finance updates
  - election create->candidate add->finalize
- E2E tests:
  - super-admin full journey
  - staff operations journey
  - representative assignment and updates
  - consumer tracking and payment visibility

## 11) Environment and Deployment Plan
- API env: `apps/api/.env.example`
- Web env: `apps/web/.env.example`
- Deployment targets:
  - Web -> Vercel
  - API -> Render
  - DB -> Neon
- Deployment assets added:
  - `render.yaml` blueprint for API service provisioning on Render
  - `apps/web/vercel.json` for Next.js web deployment settings
  - deployment runbook: `DOcs/runbooks/wusuq_deployment_runbook.md`
  - environment templates: `apps/api/.env.stage.example`, `apps/api/.env.prod.example`, `apps/web/.env.stage.example`, `apps/web/.env.prod.example`
  - deployment verification automation: `tests/deploy/verify_deployment.mjs` (`pnpm deploy:verify`)

## 12) Current Gap to Reach Feature Parity
Current repository state is a strong scaffold and contract baseline. Remaining work is implementation depth: DB-backed services, production auth/RBAC guards, workflow rules, invoice/report engines, and UAT hardening.
