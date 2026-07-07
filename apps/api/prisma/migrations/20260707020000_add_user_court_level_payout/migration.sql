-- add_user_court_level_payout
-- Rep court tier (C3) + payout details (C5, staff-only) on User.
ALTER TABLE "User" ADD COLUMN "courtLevel" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutMethod" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutBankName" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutAccountTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutAccountNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutJazzCash" TEXT;
ALTER TABLE "User" ADD COLUMN "payoutEasyPaisa" TEXT;
