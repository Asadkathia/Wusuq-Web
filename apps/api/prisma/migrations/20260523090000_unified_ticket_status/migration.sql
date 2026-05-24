-- Spec 4: unify TicketStatus, retire TicketPaymentStatus.
-- Single-transaction rename-swap. All columns that depend on the enum are
-- handled before the old type is dropped.

-- 1. Decouple the status-history audit log from the enum (text labels).
--    Preserves legacy values (e.g. PENDING) and future-proofs status changes.
ALTER TABLE "TicketStatusHistory" ALTER COLUMN "from" TYPE TEXT USING ("from"::text);
ALTER TABLE "TicketStatusHistory" ALTER COLUMN "to" TYPE TEXT USING ("to"::text);

-- 2. Rebuild the TicketStatus enum with the unified set.
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
CREATE TYPE "TicketStatus" AS ENUM ('UNPAID','PAID','ASSIGNED','IN_PROGRESS','WAITING_APPROVAL','COMPLETED','DELIVERED');

-- 3. Re-type Ticket.status, mapping legacy PENDING via the (still-present) paymentStatus.
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

-- 4. Retire paymentStatus (column + index + enum).
DROP INDEX IF EXISTS "Ticket_paymentStatus_idx";
ALTER TABLE "Ticket" DROP COLUMN "paymentStatus";
DROP TYPE "TicketPaymentStatus";
