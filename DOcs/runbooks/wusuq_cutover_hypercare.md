# Wusuq Cutover and Hypercare Runbook

Last Updated: 2026-03-19

## 1. Pre-Cutover
- Freeze schema changes on legacy and new systems.
- Export legacy data snapshots (users, tickets, wallet, finance, documents metadata).
- Validate restore procedure on staging.
- Confirm environment variables and secrets for Vercel/Render/Neon.
- Confirm rollback branch and previous stable deployment hashes.

## 2. Deployment Sequence
1. Apply DB migrations on production (`prisma migrate deploy`).
2. Deploy API (Render) and verify `/api/health` database status.
3. Deploy web (Vercel) and verify critical routes.
4. Run post-deploy smoke tests:
   - auth login/refresh
   - ticket list and create
   - finance list
   - wallet list

## 3. Cutover Validation
- Compare key counters against legacy baseline:
  - total users
  - total tickets
  - completed tickets
  - wallet balances checksum
- Verify role logins and key actions for super-admin/staff/representative/consumer.

## 4. Hypercare Window (72 hours)
- Monitor:
  - API error rate
  - p95 latency
  - DB CPU/storage
  - queue and background task health
- Daily review of:
  - failed auth attempts/rate-limit triggers
  - failed uploads
  - finance reconciliation exceptions
- Incident severity handling:
  - Sev1: rollback to previous deployment and notify stakeholders immediately
  - Sev2: hotfix within maintenance window

## 5. Rollback Plan
- Revert web and API to last stable deployment versions.
- Restore database from pre-cutover backup if migration introduced irreversible faults.
- Re-open legacy portal if required by business continuity policy.

## 6. Completion Criteria
- 72-hour hypercare completes without Sev1 incidents.
- UAT checklist fully signed off.
- Error budget and performance SLOs remain within target.

## 7. Execution Tracking
- Active execution log: `DOcs/runbooks/wusuq_cutover_execution_log.md`
- Automated check command: `pnpm hypercare:check`
- Automated snapshot log: `DOcs/runbooks/wusuq_hypercare_check_log.md`
