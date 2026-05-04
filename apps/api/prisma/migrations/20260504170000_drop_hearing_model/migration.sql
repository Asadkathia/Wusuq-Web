-- Drop the Hearing model and its references.
-- Scheduling/outcome columns previously on Hearing now live on Ticket
-- (added in migration 20260504161507_cases_workflow_foundations).
-- All Hearing rows must be migrated or accepted as lost; pre-flight check
-- in the deployment runbook confirmed zero Hearing rows in the dev DB.

-- 1. Drop the CaseEvent → Hearing FK and the hearingId column.
ALTER TABLE "CaseEvent" DROP CONSTRAINT IF EXISTS "CaseEvent_hearingId_fkey";
ALTER TABLE "CaseEvent" DROP COLUMN IF EXISTS "hearingId";

-- 2. Drop the Ticket → Hearing FK and the hearingId column.
ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "Ticket_hearingId_fkey";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "hearingId";

-- 3. Drop the Hearing table itself.
DROP TABLE IF EXISTS "Hearing";

-- 4. Remove the HEARING_SCHEDULED / HEARING_UPDATED enum values by
--    recreating the CaseEventType enum without them. Postgres has no
--    native ALTER TYPE … DROP VALUE; the standard pattern is rename → new → swap → drop.
ALTER TYPE "CaseEventType" RENAME TO "CaseEventType_old";
CREATE TYPE "CaseEventType" AS ENUM (
  'CASE_CREATED',
  'CASE_UPDATED',
  'CASE_CLOSED',
  'CASE_REOPENED',
  'TICKET_CREATED',
  'TICKET_ASSIGNED',
  'TICKET_IN_PROGRESS',
  'TICKET_COMPLETED',
  'DOCUMENT_UPLOADED',
  'NOTE_ADDED',
  'CONTEXT_DRIFT_DETECTED',
  'CONTEXT_RESOLVED',
  'RECOMMENDATION_TRIGGERED'
);
ALTER TABLE "CaseEvent"
  ALTER COLUMN "type" TYPE "CaseEventType"
  USING "type"::text::"CaseEventType";
DROP TYPE "CaseEventType_old";
