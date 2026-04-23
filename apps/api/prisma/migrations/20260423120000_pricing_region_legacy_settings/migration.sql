-- Add region and isLegacy to PricingRule
ALTER TABLE "PricingRule" ADD COLUMN "region" TEXT;
ALTER TABLE "PricingRule" ADD COLUMN "isLegacy" BOOLEAN NOT NULL DEFAULT false;

-- PricingSettings singleton
CREATE TABLE "PricingSettings" (
    "id"                      TEXT NOT NULL DEFAULT 'singleton',
    "pricingMode"             TEXT NOT NULL DEFAULT 'legacy',
    "attestedPricePerSet"     DECIMAL(65,30) NOT NULL DEFAULT 0,
    "nonAttestedPricePerSet"  DECIMAL(65,30) NOT NULL DEFAULT 0,
    "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PricingSettings_pkey" PRIMARY KEY ("id")
);

-- Seed default settings row
INSERT INTO "PricingSettings" ("id", "pricingMode", "attestedPricePerSet", "nonAttestedPricePerSet", "updatedAt")
VALUES ('singleton', 'legacy', 0, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
