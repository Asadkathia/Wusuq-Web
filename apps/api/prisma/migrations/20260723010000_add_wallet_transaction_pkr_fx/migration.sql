-- Task 7: server-side FX conversion on the wallet top-up path (JazzCash/
-- EasyPaisa are PKR rails; BANK_TRANSFER is never converted). Both columns
-- are additive/nullable and populated only when a PKR-rail conversion was
-- actually applied against a non-PKR ticket, so an admin can reconcile the
-- credited native `amount` against the wired PKR bank/wallet receipt.
ALTER TABLE "WalletTransaction" ADD COLUMN "pkrAmountEntered" DECIMAL(65,30);
ALTER TABLE "WalletTransaction" ADD COLUMN "fxRateToPkr" DECIMAL(18,6);
