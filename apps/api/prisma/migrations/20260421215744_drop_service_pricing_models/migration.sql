/*
  Warnings:

  - You are about to drop the `ServiceBaseCost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceCostRule` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ServiceBaseCost" DROP CONSTRAINT "ServiceBaseCost_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceCostRule" DROP CONSTRAINT "ServiceCostRule_serviceId_fkey";

-- DropTable
DROP TABLE "ServiceBaseCost";

-- DropTable
DROP TABLE "ServiceCostRule";
