-- AlterTable: persist the clerk's page breakdown behind printingCharges so the
-- admin Review & Complete dialog can show "pages × rate" (Task 4.1). Both are
-- nullable and non-destructive (no default backfill needed).
ALTER TABLE "Ticket" ADD COLUMN "noOfPages" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "costPerPage" DECIMAL(10,2);
