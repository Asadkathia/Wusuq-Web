-- Drop old ClerkCostRule
DROP TABLE IF EXISTS "ClerkCostRule";

-- Create new PricingRule
CREATE TABLE "PricingRule" (
    "id"                      TEXT NOT NULL,
    "name"                    TEXT NOT NULL,
    "flow"                    TEXT NOT NULL,
    "courtLevel"              TEXT,
    "caseStatus"              TEXT,
    "yearFrom"                INTEGER,
    "yearTo"                  INTEGER,
    "setType"                 TEXT,
    "basePrice"               DECIMAL(65,30) NOT NULL DEFAULT 0,
    "attestedPricePerSet"     DECIMAL(65,30) NOT NULL DEFAULT 0,
    "nonAttestedPricePerSet"  DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deliveryCharge"          DECIMAL(65,30) NOT NULL DEFAULT 0,
    "priority"                INTEGER NOT NULL DEFAULT 0,
    "isActive"                BOOLEAN NOT NULL DEFAULT true,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);
