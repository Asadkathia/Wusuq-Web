-- Add proper FK relation from Ticket.promoCodeId → PromoCode.id
-- onDelete: SetNull — deleting a PromoCode nulls the pointer on any referencing
-- Ticket (the ticket survives; PromoRedemption keeps the audit trail).
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
