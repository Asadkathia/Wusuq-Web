-- Add mobile-wallet payment channels to the PaymentSettings singleton.
ALTER TABLE "PaymentSettings" ADD COLUMN "jazzCash" TEXT;
ALTER TABLE "PaymentSettings" ADD COLUMN "easyPaisa" TEXT;
