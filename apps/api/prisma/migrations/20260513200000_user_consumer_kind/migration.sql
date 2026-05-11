-- CreateEnum
CREATE TYPE "ConsumerKind" AS ENUM ('LAWYER', 'NON_LAWYER', 'CORPORATE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "consumerKind" "ConsumerKind";
