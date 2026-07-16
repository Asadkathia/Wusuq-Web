-- Additive follow-up to 20260716000000_unified_invoice (already applied to
-- production Neon — do NOT edit that migration).
--
-- Blocker 3 fix: the invoice arithmetic subtracts a discount from the
-- taxable base and grand total but never persisted or rendered it, so the
-- printed PDF's SUBTOTAL / TAX / GRAND TOTAL rows silently failed to add up
-- whenever a ticket carried discountPrice or promoDiscount. This column lets
-- `InvoicesService.generate` snapshot the (per-ticket-clamped) discount total
-- that was actually applied, so the PDF can render an honest DISCOUNT row.

ALTER TABLE "Invoice" ADD COLUMN "discount" DECIMAL(65,30) NOT NULL DEFAULT 0;
