-- Unified multi-ticket invoice (spec 2026-07-16, Part 4).
-- Safe to drop-and-recreate: verified 0 rows in "Invoice" on 2026-07-16.

DROP TABLE IF EXISTS "Invoice" CASCADE;

CREATE SEQUENCE IF NOT EXISTS invoice_no_seq START 1;

CREATE TABLE "Invoice" (
    "id"         TEXT NOT NULL,
    "invoiceNo"  TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "currency"   TEXT NOT NULL DEFAULT 'PKR',
    "issueDate"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal"   DECIMAL(65,30) NOT NULL,
    "taxRate"    DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxAmount"  DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(65,30) NOT NULL,
    "status"     "InvoiceStatus" NOT NULL DEFAULT 'GENERATED',
    "paidAt"     TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceItem" (
    "id"          TEXT NOT NULL,
    "invoiceId"   TEXT NOT NULL,
    "ticketId"    TEXT NOT NULL,
    "position"    INTEGER NOT NULL,
    "batchNo"     TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "courtLine"   TEXT,
    "caseTitle"   TEXT,
    "judge"       TEXT,
    "serviceCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "printing"    DECIMAL(65,30) NOT NULL DEFAULT 0,
    "attested"    DECIMAL(65,30) NOT NULL DEFAULT 0,
    "nonAttested" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "delivery"    DECIMAL(65,30) NOT NULL DEFAULT 0,
    "additional"  DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lineTotal"   DECIMAL(65,30) NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");
CREATE INDEX "Invoice_consumerId_issueDate_idx" ON "Invoice"("consumerId", "issueDate");
CREATE UNIQUE INDEX "InvoiceItem_ticketId_key" ON "InvoiceItem"("ticketId");
CREATE INDEX "InvoiceItem_invoiceId_position_idx" ON "InvoiceItem"("invoiceId", "position");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_consumerId_fkey"
    FOREIGN KEY ("consumerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SENT is unreachable now that the (never-implemented) send-email path is gone.
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
CREATE TYPE "InvoiceStatus" AS ENUM ('GENERATED', 'PARTIALLY_PAID', 'PAID');
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus"
    USING ("status"::text::"InvoiceStatus");
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'GENERATED';
DROP TYPE "InvoiceStatus_old";
