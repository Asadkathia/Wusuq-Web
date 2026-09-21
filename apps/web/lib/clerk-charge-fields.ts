/**
 * Which phase-2 charge inputs a representative — and the admin Review &
 * Complete dialog — should actually see (batch-7 5.1 + 5.2, batch-9 Task 1).
 *
 * The dialog used to show all four pairs unconditionally, so a consumer who
 * ordered NON-ATTESTED copies still got Attested Pages / Attested Cost Per
 * Page staring back:
 *   "he has asked for a non-attested file, so… it is not necessary to have
 *    these two options"
 *   "if it is a non-attested file then it should be known as non-attested"
 *
 * And the generic pair made it worse — "this number of pages, cost per page,
 * this and this is not required" / "I think this is extra… when it is complete
 * then these two are not clear to understand". That pair is the PHOTOCOPY
 * charge and it IS real, so it is renamed rather than removed; the confusion
 * was that three unlabelled "pages × rate" pairs sat side by side.
 *
 * Batch-9 Task 1 (owner decision 2026-09-21): rows must be dynamic per
 * intake + service — for an attested order nothing non-attested may appear,
 * and vice versa. Case Files bills its pages through the attested /
 * non-attested counts, so the photocopy pair is now hidden there entirely
 * (`SERVICE_CHARGE_CAPABILITIES.judicial_case_files.printing = false` in
 * `@wusuq/shared`) — this file only handles the attestation-pair narrowing
 * by `set_type`; the printing/delivery gates are flow-capability only.
 */

import { chargeCapabilitiesFor, type Currency } from '@wusuq/shared';

export type SetTypeSelection = 'attested' | 'non_attested' | 'both' | null;

/**
 * Read the ordered set type out of an intake payload.
 * Returns null when the flow has no set type at all (Information / Filing /
 * PoA), in which case neither attestation pair applies.
 */
export function readSetType(payload: Record<string, unknown> | null | undefined): SetTypeSelection {
  const raw = payload?.set_type;
  if (raw === 'attested' || raw === 'non_attested' || raw === 'both') return raw;
  return null;
}

export interface ChargeFieldVisibility {
  attested: boolean;
  nonAttested: boolean;
}

/**
 * Attestation-pair visibility from a resolved set type + capability. Shared
 * by `chargeFieldVisibility` (payload-based, existing callers) and
 * `visibleChargeFields` (flow/currency-based, Task 1) so the two never drift.
 *
 * An ABSENT/unrecognised set type (legacy ticket, or a flow that never
 * asked) falls back to showing BOTH pairs rather than hiding a charge the
 * representative may legitimately need to enter — hiding by default could
 * silently strand a legacy ticket with no way to enter its charges.
 */
function attestationVisibility(
  setType: SetTypeSelection,
  canAttest: boolean,
): ChargeFieldVisibility {
  if (!canAttest) return { attested: false, nonAttested: false };
  if (setType === null) return { attested: true, nonAttested: true };
  return {
    attested: setType === 'attested' || setType === 'both',
    nonAttested: setType === 'non_attested' || setType === 'both',
  };
}

/**
 * @param payload      the ticket's intake payload
 * @param canAttest    chargeCapabilitiesFor(flow, currency).attestation — a
 *                     flow with no attestation leg shows neither pair
 */
export function chargeFieldVisibility(
  payload: Record<string, unknown> | null | undefined,
  canAttest: boolean,
): ChargeFieldVisibility {
  return attestationVisibility(readSetType(payload), canAttest);
}

export interface VisibleChargeFields {
  /** Attested Pages / Attested Cost Per Page pair. */
  attested: boolean;
  /** Non-Attested Pages / Non-Attested Cost Per Page pair. */
  nonAttested: boolean;
  /** Photocopy Pages / Photocopy Cost Per Page pair (§4a `printing`). */
  printing: boolean;
  /** Delivery Charges. */
  delivery: boolean;
}

/**
 * The single derivation for which phase-2 charge rows a ticket should show,
 * driven ONLY by the flow's capability + currency and the ticket's own
 * `set_type` — never a flat, unconditional field list. Used by BOTH the
 * representative "Update ticket payments" dialog and the admin "Review &
 * Complete" dialog so they render identical rows for the same ticket
 * (Task 1 requirement — the two dialogs must agree).
 *
 * "Additional Cost" is deliberately NOT part of this helper — it is never
 * capability-gated and always shows, per the owner's own instruction.
 *
 * @param flow      ticket.intakeFlow
 * @param currency  toCurrency(ticket.currency) — USD is always NO_CHARGES
 * @param setType   readSetType(payload) — narrows the attestation pair only;
 *                  printing/delivery are flow-capability-only (a Case-Files
 *                  ticket has no printing row regardless of set type, and a
 *                  non-judicial copy flow has no set type at all)
 */
export function visibleChargeFields(
  flow: string | null | undefined,
  currency: Currency | undefined,
  setType: SetTypeSelection,
): VisibleChargeFields {
  const caps = chargeCapabilitiesFor(flow, currency);
  const attestation = attestationVisibility(setType, caps.attestation);
  return {
    attested: attestation.attested,
    nonAttested: attestation.nonAttested,
    printing: caps.printing,
    delivery: caps.delivery,
  };
}
