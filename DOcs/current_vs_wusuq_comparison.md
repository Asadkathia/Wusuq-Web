# Current Rebuild vs Wusuq System Comparison

Source baseline: `DOcs/wusuq_system_report.md.resolved`  
Compared against: current monorepo implementation in this repository (`apps/web`, `apps/api`)  
Date: 2026-03-27

## Executive Summary

- Overall: the rebuild covers most core Wusuq modules end-to-end (auth, users, tickets, finance, wallet, cost rules, elections, reports, documents, geo, cases).
- Parity is strongest in API surface and domain modeling.
- Biggest deltas are in frontend parity polish and a few integration mismatches (some screens still use placeholder/stub behavior or incorrect API wiring).

## Parity Matrix (Module-Level)

| Wusuq Module / Capability | Current Status | Notes |
| --- | --- | --- |
| Auth (login/refresh/logout, role-aware access) | `Matched` | Implemented in API and web auth guard; JWT + refresh flow present. |
| Dashboard analytics | `Partial` | Dashboard summary endpoint exists and web dashboard is implemented; exact KPI/visual parity with live Wusuq may differ. |
| Paralegal services intake (judicial/non-judicial flows) | `Matched` | Dedicated intake endpoints and web wizard routes exist for judicial/non-judicial flows. |
| Ticket lifecycle (pending/assigned/in-progress/completed/immature) | `Matched` | Ticket board routes + status flow + assignment + timeline + bulk actions implemented. |
| Cases and hearings lifecycle | `Exceeded` | Rebuild adds dedicated `cases` module with hearings/events timeline beyond baseline ticket-centric view. |
| Finance ledger, reconciliation, invoice actions | `Partial` | Core API exists (reconcile/generate/send/download/export). Web has one integration mismatch for export URL and one unsupported charge update action. |
| Wallet top-up and verification | `Partial` | API supports top-up and verify/reject; web supports flows, but one top-up payment mode sent by UI does not match backend enum. |
| User management and impersonation | `Matched` | CRUD, activate/deactivate, roles, impersonation implemented. |
| Representatives management | `Partial` | Separate representatives page currently uses stub/mock fallback and a non-existent endpoint. |
| Manage cost (service/clerk rules) | `Partial` | API endpoints are implemented. UI is functional but has domain text/currency drift (Saudi labels/currency vs Pakistan context). |
| Elections and cabinet | `Matched` | Elections CRUD/candidates/finalize + cabinet list endpoints and UI available. |
| Reports | `Matched` | Reports list and typed report execution implemented, with filter support and table/chart rendering in UI. |
| Documents repository | `Partial` | Listing and upload are present. Web exports link to endpoint not implemented in API. |
| Notifications bell / unread | `Matched` | API + topbar notification interactions implemented. |
| Geo hierarchy (province/district/city/court/police station) | `Matched` | API endpoints and geo seed script exist. |

## Confirmed High-Impact Gaps

1. Representatives page uses a non-existent endpoint and mock fallback  
Evidence:
- Web calls `/representatives?limit=100` in `apps/web/components/representatives-board.tsx`.
- API has no `representatives` controller; representative-related functionality lives under `users` and `tickets`.
Impact:
- Real production data is not reliably shown on the representatives screen.

2. Wallet top-up mode mismatch from Users screen  
Evidence:
- Users UI posts `paymentMode: 'CASH'` in `apps/web/components/users-board.tsx`.
- Backend validates against `PAYMENT_MODES = ['JAZZ_CASH', 'EASY_PAISA', 'BANK_TRANSFER']` (`packages/shared/src/index.ts`, DTO validation in `apps/api/src/wallet/dto/topup-wallet.dto.ts`).
Impact:
- Top-up from this path can fail validation.

3. Finance export URL env mismatch in web  
Evidence:
- Finance page uses `${process.env.NEXT_PUBLIC_API_URL}/finance/export...` in `apps/web/components/finance-board.tsx`.
- Project’s API client and login rely on `NEXT_PUBLIC_API_BASE_URL`.
Impact:
- Export link can resolve incorrectly or empty in deployed environments.

4. Documents export endpoint mismatch  
Evidence:
- Documents UI links to `/documents/export`.
- API documents controller only exposes `GET /documents`.
Impact:
- Export action on documents board does not have backend support.

5. Finance UI calls unsupported charge endpoint  
Evidence:
- Finance UI calls `PATCH /finance/:ticketId/charge`.
- API finance controller does not expose that route.
Impact:
- Inline charge editing action fails.

## Medium Gaps / Drift

1. Domain localization drift in cost-rules UI
- Current UI uses Saudi labels/currency (`SAR`, Saudi region names), while Wusuq baseline is Pakistan/PKR/province context.
- This is functional but inconsistent with existing Wusuq domain language.

2. Sidebar contains `Invoices` entry without route
- Navigation has an `Invoices` item without `href`, while invoice actions exist inside finance flows.
- UX parity with legacy route-based invoice history is incomplete.

3. Some UI hints still indicate placeholder state
- Example: topbar wallet chip marked placeholder.
- Non-blocking, but signals unfinished polish against live system behavior.

## What the Rebuild Already Improves vs Baseline

- Cleaner modular API boundaries and explicit permission guards per endpoint.
- Strong typed contracts via shared package + DTO validation.
- Dedicated `cases` module with hearings/events for deeper legal matter tracking.
- Automated operational scripts for UAT/deploy/hypercare checks included in repo.

## Recommended Closure Order

1. Fix API/UI contract mismatches first
- Representatives data source
- Wallet top-up mode (`CASH` -> valid enum)
- Finance export env var alignment
- Remove or implement `/finance/:id/charge`
- Add or remove documents export action

2. Resolve domain language/currency consistency
- Replace Saudi-specific labels/currency with Wusuq Pakistan context.

3. UX parity cleanup
- Invoices navigation destination and/or dedicated invoice history view.
- Replace remaining placeholder markers with live values.

## Bottom Line

The rebuild is functionally close to Wusuq’s operational scope and already production-leaning on the backend. The remaining work is mainly contract alignment and parity polish in selected frontend modules, not a missing-core-architecture problem.
