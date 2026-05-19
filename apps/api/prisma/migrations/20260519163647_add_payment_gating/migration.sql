-- CreateEnum
CREATE TYPE "TicketOrigin" AS ENUM ('CONSUMER', 'ADMIN_STAFF');

-- CreateEnum
CREATE TYPE "PaymentProviderName" AS ENUM ('MOCK', 'JAZZCASH', 'EASYPAISA', 'HBL_PAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "createdBy" "TicketOrigin" NOT NULL DEFAULT 'ADMIN_STAFF';

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "provider" "PaymentProviderName" NOT NULL,
    "providerTxnId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "rawRequest" JSONB,
    "rawCallback" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerTxnId_key" ON "Payment"("providerTxnId");

-- CreateIndex
CREATE INDEX "Payment_ticketId_idx" ON "Payment"("ticketId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Ticket_createdBy_idx" ON "Ticket"("createdBy");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CourtCaseType_dimensions_unique" RENAME TO "CourtCaseType_courtLevel_subCourt_district_region_highCourt_key";

-- Backfill Ticket.createdBy: CONSUMER where the original TICKET_CREATED audit log actor matches the ticket's consumerId.
UPDATE "Ticket" t
SET "createdBy" = 'CONSUMER'
WHERE EXISTS (
  SELECT 1 FROM "AuditLog" a
  WHERE a."entity" = 'TICKET'
    AND a."entityId" = t."id"
    AND a."action" = 'TICKET_CREATED'
    AND a."actorUserId" = t."consumerId"
);
