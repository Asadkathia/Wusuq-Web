-- Spec 4: unify TicketStatus, retire TicketPaymentStatus.
-- Single-transaction rename-swap (no ALTER TYPE ADD VALUE, which can't be used
-- in the same transaction it's created). PENDING rows are mapped in the USING
-- cast via the still-present paymentStatus column, which is dropped afterwards.

-- 1. Rebuild the TicketStatus enum with the unified set.
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
CREATE TYPE "TicketStatus" AS ENUM ('UNPAID','PAID','ASSIGNED','IN_PROGRESS','WAITING_APPROVAL','COMPLETED','DELIVERED');

-- 2. Re-type Ticket.status, mapping legacy PENDING via paymentStatus.
ALTER TABLE "Ticket" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Ticket" ALTER COLUMN "status" TYPE "TicketStatus" USING (
  (CASE
     WHEN "status"::text = 'PENDING'
       THEN (CASE WHEN "paymentStatus" = 'UNPAID' THEN 'UNPAID' ELSE 'PAID' END)
     ELSE "status"::text
   END)::"TicketStatus"
);
ALTER TABLE "Ticket" ALTER COLUMN "status" SET DEFAULT 'UNPAID';
DROP TYPE "TicketStatus_old";

-- 3. Retire paymentStatus (column + index + enum).
DROP INDEX IF EXISTS "Ticket_paymentStatus_idx";
ALTER TABLE "Ticket" DROP COLUMN "paymentStatus";
DROP TYPE "TicketPaymentStatus";
