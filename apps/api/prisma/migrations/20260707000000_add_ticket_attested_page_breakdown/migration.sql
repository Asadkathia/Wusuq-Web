-- add_ticket_attested_page_breakdown
-- Clerk-entered attested / non-attested page breakdown (charge = pages × rate).
ALTER TABLE "Ticket" ADD COLUMN "attestedPages" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "attestedCostPerPage" DECIMAL(10,2);
ALTER TABLE "Ticket" ADD COLUMN "nonAttestedPages" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "nonAttestedCostPerPage" DECIMAL(10,2);
