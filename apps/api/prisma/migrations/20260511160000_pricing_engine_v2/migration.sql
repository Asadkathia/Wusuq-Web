-- AlterTable
ALTER TABLE "PricingRule" ADD COLUMN     "availability" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "clerkBaseCost" DECIMAL(65,30),
ADD COLUMN     "deliveryGuyFee" DECIMAL(65,30) NOT NULL DEFAULT 100,
ADD COLUMN     "pdfSurchargeAmount" DECIMAL(65,30) NOT NULL DEFAULT 300,
ADD COLUMN     "yearBand" TEXT;

-- Wipe existing rule rows so the new unique index does not conflict; the
-- seed-pricing script reinserts canonical rules from the xlsx source-of-truth.
DELETE FROM "PricingRule";

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_region_courtLevel_flow_yearBand_setType_key" ON "PricingRule"("region", "courtLevel", "flow", "yearBand", "setType");
