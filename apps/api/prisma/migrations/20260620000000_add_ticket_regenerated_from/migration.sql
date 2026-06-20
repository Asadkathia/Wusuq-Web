-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "regeneratedFromTicketId" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_regeneratedFromTicketId_idx" ON "Ticket"("regeneratedFromTicketId");
