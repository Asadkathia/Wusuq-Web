-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseEventType" ADD VALUE 'CONTEXT_DRIFT_DETECTED';
ALTER TYPE "CaseEventType" ADD VALUE 'CONTEXT_RESOLVED';
ALTER TYPE "CaseEventType" ADD VALUE 'RECOMMENDATION_TRIGGERED';

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "flowKey" TEXT;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "hearingType" TEXT,
ADD COLUMN     "nextDate" TIMESTAMP(3),
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "scheduledDate" TIMESTAMP(3);
