/**
 * Prefill rules for the admin "Review & Complete" phase-2 charge inputs.
 *
 * WHY THIS EXISTS (batch-7 item 2.7 — a live money bug):
 * `computeClerkEarningsBreakdown` caps each phase-2 line at
 * `min(representativeSubmitted, adminFinal)` so an admin markup stays Wusuq
 * margin and never inflates the payout. That cap is correct. The defect was
 * the DEFAULT feeding it: the dialog prefilled each input from the ticket's
 * FINAL column, which can still read 0 while the representative's frozen
 * snapshot says 300. An admin who simply did not touch the box therefore
 * approved `min(300, 0) = 0` — paying the representative nothing for the
 * delivery AND dropping it from the consumer's bill.
 *
 * The client demonstrated both halves: leaving it blank produced earnings of
 * PKR 1,600 (`cost 900 + non-attested 700`, delivery missing) and he wrote
 * "+ DELIVERY" on the screenshot; typing 400 produced PKR 1,900
 * (`900 + 700 + delivery 300`) and he replied "it is fine — i added another
 * amount, but it was good with the clerk amount."
 *
 * So: start from whichever of the two is HIGHER. An equal pair is unchanged,
 * an existing admin markup is preserved, and the 0-vs-300 case now opens at
 * 300 instead of silently zeroing the representative. The admin can still
 * type 0 deliberately — this sets the starting value, it does not lock it.
 */

/** Coerce a Prisma Decimal-as-string / number / null to a finite number. */
function toNum(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Starting value for one admin phase-2 input, as the string the input binds to.
 *
 * `representativeSubmitted` of `null`/`undefined` means NO submission was
 * recorded (the admin is filling charges directly) — never treat that as 0,
 * for the same reason `computeClerkEarningsBreakdown` does not: coercing the
 * absence to 0 would cap every payout at nothing.
 */
export function prefillPhase2Charge(
  final: number | string | null | undefined,
  representativeSubmitted: number | string | null | undefined,
): string {
  const finalValue = toNum(final);
  if (representativeSubmitted == null) {
    return finalValue > 0 ? String(finalValue) : '';
  }
  const submitted = toNum(representativeSubmitted);
  const start = Math.max(finalValue, submitted);
  return start > 0 ? String(start) : '';
}
