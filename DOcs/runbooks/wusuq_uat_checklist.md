# Wusuq UAT Checklist

Last Updated: 2026-03-19 (Smoke refresh)

## Test Roles
- super-admin
- manager-admin
- staff-admin
- representative
- consumer

## Core Flows
- [ ] Auth: login, refresh, logout
- [ ] RBAC: unauthorized pages/APIs are blocked per role
- [ ] Service intake: all 7 flows submit successfully
- [ ] Draft resume: intake drafts save and restore
- [ ] Ticket lifecycle: pending -> assigned -> in progress -> completed
- [ ] Ticket timeline: status, assignment, and document events visible
- [ ] Regenerate: cloned ticket appears with new batch number
- [ ] Bulk actions: complete/immature/delete/invoice actions work

## Finance & Wallet
- [ ] Finance ledger totals align with ticket rows
- [ ] Reconcile payment updates paid/remaining/payment status
- [ ] Invoice generate/download/send works end to end
- [ ] Wallet topup creation creates pending transaction
- [ ] Wallet verify increments user wallet balance once
- [ ] Wallet reject marks rejected and does not alter balance

## Costing
- [ ] Service cost rule (single-year) is resolved correctly
- [ ] Service cost rule (range) is resolved correctly
- [ ] Clerk cost auto-resolution works on assignment
- [ ] Manual clerk cost override works and persists

## Elections/Cabinet/Reports/Documents
- [ ] Election create/update/delete works
- [ ] Candidate add/update works
- [ ] Finalize election selects highest-vote winners per position
- [ ] Cabinet list reflects finalized winners
- [ ] Reports return valid data for all report types
- [ ] Documents repository lists uploaded documents with search

## Non-Functional
- [x] Health endpoint shows database status
- [x] Rate limits are enforced on auth and upload endpoints
- [ ] Basic load smoke test passes (`tests/performance/api_smoke.js`)

Evidence:
- `DOcs/runbooks/wusuq_uat_execution_log.md` (health + auth-rate-limit smoke)
- `DOcs/runbooks/wusuq_role_uat_execution_log.md` (role matrix execution output)

Automation commands:
- `pnpm uat:smoke`
- `pnpm uat:roles`
- env template: `DOcs/runbooks/wusuq_role_uat_env.example`

## Signoff
- [ ] Product signoff
- [ ] Engineering signoff
- [ ] Operations signoff
