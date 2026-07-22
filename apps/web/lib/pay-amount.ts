import { convertToPkr, round2, type Currency } from '@wusuq/shared';

/**
 * Pure FX-conversion helpers for the consumer pay page.
 *
 * The pay page's destination account is always a Pakistani bank, so the
 * amount field is always denominated in PKR — but a ticket's own billing
 * currency (and the consumer's wallet ledger) may be USD. These two
 * functions are the inverse of each other:
 *
 *   payableInPkr        : ticket-currency amount  -> PKR (for prefill/display)
 *   submitAmountFromPkr  : PKR entered on the form -> ticket-currency amount
 *                          (for the /wallet/topup credit)
 *
 * Both return `null` when a USD ticket has no `fxRateToPkr` stamped — callers
 * MUST treat null as "cannot proceed" (no prefill, no submit), never fall
 * back to the raw un-converted figure. See `convertToPkr` in `@wusuq/shared`
 * for why a fallback rate of 1 is never acceptable.
 */

/**
 * Amount payable in PKR for a ticket currently due `dueNow` in its own
 * billing currency. PKR tickets pass through unconverted. USD tickets
 * convert via the FX rate stamped at intake; returns null when no rate is
 * available so the caller can show a "not set" message instead of a bogus
 * number.
 */
export function payableInPkr(
  dueNow: number,
  currency: Currency,
  fxRateToPkr: number | string | null | undefined,
): number | null {
  if (currency === 'PKR') return dueNow;
  return convertToPkr(dueNow, fxRateToPkr);
}

/**
 * Converts a PKR amount entered on the pay form back into the ticket's
 * native billing currency, ready to submit to `/wallet/topup` (which
 * credits `walletBalance` — denominated in the user's native currency —
 * with zero FX awareness of its own). PKR tickets pass through unconverted.
 * Returns null when no valid rate is available for a USD ticket; callers
 * MUST reject the submission rather than send the raw PKR figure (that
 * would credit e.g. "9975" as if it were $9,975).
 */
export function submitAmountFromPkr(
  pkrEntered: number,
  currency: Currency,
  fxRateToPkr: number | string | null | undefined,
): number | null {
  if (currency === 'PKR') return pkrEntered;
  const r = Number(fxRateToPkr);
  if (!Number.isFinite(r) || r <= 0) return null;
  return round2(pkrEntered / r);
}
