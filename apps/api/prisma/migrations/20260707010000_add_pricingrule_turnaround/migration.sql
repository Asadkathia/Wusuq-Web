-- add_pricingrule_turnaround
-- Free-text turnaround/"time" estimate shown to consumers at checkout (C16).
ALTER TABLE "PricingRule" ADD COLUMN "turnaroundLabel" TEXT;
