-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('TOPUP', 'TICKET_PAYMENT', 'TICKET_DEBIT', 'ADMIN_ADJUSTMENT');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "remainderFinalizedAt" TIMESTAMP(3),
ADD COLUMN     "remainderFinalizedByUserId" TEXT;

-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN     "type" "WalletTransactionType" NOT NULL DEFAULT 'TOPUP';

-- CreateTable
CREATE TABLE "PaymentSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "bankName" TEXT NOT NULL,
    "accountTitle" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "iban" TEXT,
    "instructions" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);
