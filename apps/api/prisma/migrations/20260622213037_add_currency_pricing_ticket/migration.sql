-- DropIndex
DROP INDEX "PricingRule_region_courtLevel_flow_yearBand_setType_key";

-- AlterTable
ALTER TABLE "PricingRule" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PKR';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PKR';

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_currency_region_courtLevel_flow_yearBand_setTyp_key" ON "PricingRule"("currency", "region", "courtLevel", "flow", "yearBand", "setType");
