-- CreateTable
CREATE TABLE "TicketClerkReport" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "attestedAvailable" BOOLEAN NOT NULL DEFAULT false,
    "nonAttestedAvailable" BOOLEAN NOT NULL DEFAULT false,
    "bothAvailable" BOOLEAN NOT NULL DEFAULT false,
    "perPageRateAttested" DECIMAL(65,30),
    "perPageRateNonAttested" DECIMAL(65,30),
    "unavailableReason" TEXT,
    "partialCompletion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketClerkReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketClerkReport_ticketId_key" ON "TicketClerkReport"("ticketId");

-- AddForeignKey
ALTER TABLE "TicketClerkReport" ADD CONSTRAINT "TicketClerkReport_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
