-- Audit 4.2: bulk ticket "delete" becomes a soft archive. Hard deletes hit
-- ON DELETE RESTRICT children (TicketStatusHistory) and, where they could
-- succeed, would SET NULL the WalletTransaction.ticketId money linkage.
ALTER TABLE "Ticket" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Audit 4.4: hot-path composite indexes.
CREATE INDEX "Ticket_consumerId_status_idx" ON "Ticket"("consumerId", "status");
CREATE INDEX "Ticket_consumerId_intakeFlow_createdAt_idx" ON "Ticket"("consumerId", "intakeFlow", "createdAt");
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
