-- Audit 1.9: client-supplied intake idempotency key. A double-submitted
-- wizard POST hits this unique index and the API returns the first ticket
-- instead of creating a duplicate that wallet settlement would also pay.
ALTER TABLE "Ticket" ADD COLUMN "intakeRequestId" TEXT;

CREATE UNIQUE INDEX "Ticket_intakeRequestId_key" ON "Ticket"("intakeRequestId");
