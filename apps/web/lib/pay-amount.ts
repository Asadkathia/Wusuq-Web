import { convertToPkr, isPkrRail, round2, type Currency } from '@wusuq/shared';

// Re-exported for existing call sites (`@/lib/pay-amount`'s isPkrRail) — the
// single source of truth now lives in `@wusuq/shared` so the server (which
// performs the actual conversion, task 7) and the client (which only decides
// what to LABEL/PREFILL) can never drift apart on the rail predicate.
export { isPkrRail };

/**
 * Pure FX-conversion helpers for the consumer pay page.
 *
 * The payment currency follows the PAYMENT RAIL, not the ticket:
 *
 * - JazzCash / EasyPaisa are domestic PKR rails. An overseas Pakistani using
 *   one already holds PKR, so the figure they type IS PKR and must be
 *   converted to the wallet's native currency (USD) before it is credited.
 * - Bank transfer is NOT a PKR rail: an overseas consumer wires USD from
 *   their own foreign bank and the receiving Pakistani bank auto-converts
 *   on arrival at whatever rate it sets that day. The consumer never types
 *   a PKR figure on this rail, and what they type is exactly what is
 *   credited — no conversion applies, ever.
 *
 * `isPkrRail` (re-exported above from `@wusuq/shared`) identifies the former
 * group. `payableInPkr` and `submitAmountFromPkr` are the inverse of each
 * other and MUST only be invoked when `isPkrRail(paymentMode)` is true:
 *
 *   payableInPkr        : ticket-currency amount  -> PKR (for prefill/display)
 *   submitAmountFromPkr  : PKR entered on the form -> ticket-currency amount
 *
 * Both return `null` when a USD ticket on a PKR rail has no `fxRateToPkr`
 * stamped — callers MUST treat null as "cannot proceed" (no prefill, no
 * submit), never fall back to the raw un-converted figure. See
 * `convertToPkr` in `@wusuq/shared` for why a fallback rate of 1 is never
 * acceptable.
 *
 * Task 7: the actual `/wallet/topup` credit is now converted SERVER-SIDE
 * (`WalletService`'s `resolveTopupAmount`, mirroring this exact division) —
 * the pay page no longer calls `submitAmountFromPkr` before submitting; it
 * posts the raw entered figure and lets the server convert. This function is
 * kept (a) as the tested reference implementation the server-side math must
 * match and (b) for any future client-side display use.
 */

/**
 * Amount payable in PKR for a ticket currently due `dueNow` in its own
 * billing currency. Only meaningful — and only meant to be called — on a
 * PKR rail (`isPkrRail(paymentMode)` true); a bank transfer needs no
 * conversion at all. PKR tickets pass through unconverted. USD tickets on a
 * PKR rail convert via the FX rate stamped at intake; returns null when no
 * rate is available so the caller can show a "not set" message instead of a
 * bogus number.
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
 * with zero FX awareness of its own). Only meant to be called on a PKR rail
 * (`isPkrRail(paymentMode)` true) — a bank-transfer amount is never routed
 * through this function; it is submitted as entered. PKR tickets pass
 * through unconverted. Returns null when no valid rate is available for a
 * USD ticket on a PKR rail; callers MUST reject the submission rather than
 * send the raw PKR figure (that would credit e.g. "9975" as if it were
 * $9,975).
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
