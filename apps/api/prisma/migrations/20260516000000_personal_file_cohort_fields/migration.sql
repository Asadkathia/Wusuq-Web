-- AlterTable
ALTER TABLE "PersonalFile"
  ADD COLUMN "serviceId" TEXT,
  ADD COLUMN "cityId" TEXT,
  ADD COLUMN "courtName" TEXT,
  ADD COLUMN "courtType" TEXT,
  ADD COLUMN "attachedTicketId" TEXT;

-- CreateIndex
CREATE INDEX "PersonalFile_userId_serviceId_idx"
  ON "PersonalFile"("userId", "serviceId");

-- AddForeignKey
ALTER TABLE "PersonalFile"
  ADD CONSTRAINT "PersonalFile_attachedTicketId_fkey"
  FOREIGN KEY ("attachedTicketId") REFERENCES "Ticket"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
