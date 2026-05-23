-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('WORK_DOCUMENT', 'DELIVERABLE_PDF');

-- AlterTable
ALTER TABLE "TicketDocument" ADD COLUMN     "category" "DocumentCategory" NOT NULL DEFAULT 'WORK_DOCUMENT';
