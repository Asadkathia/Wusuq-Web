-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "Assignment"
  ADD COLUMN "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "Assignment_ticketId_status_idx" ON "Assignment"("ticketId", "status");

-- AlterTable
ALTER TABLE "TicketDocument"
  ADD COLUMN "visibleToConsumer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "uploadedByUserId" TEXT;
