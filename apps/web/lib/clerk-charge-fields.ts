/**
 * Which phase-2 charge inputs a representative should actually see
 * (batch-7 5.1 + 5.2).
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
 */

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
 * @param payload      the ticket's intake payload
 * @param canAttest    chargeCapabilitiesFor(flow, currency).attestation — a
 *                     flow with no attestation leg shows neither pair
 */
export function chargeFieldVisibility(
  payload: Record<string, unknown> | null | undefined,
  canAttest: boolean,
): ChargeFieldVisibility {
  if (!canAttest) return { attested: false, nonAttested: false };
  const setType = readSetType(payload);
  // No set type recorded (legacy ticket, or a flow that never asked): fall
  // back to showing both rather than hiding a charge the representative may
  // legitimately need to enter. Hiding by default could silently lose money.
  if (setType === null) return { attested: true, nonAttested: true };
  return {
    attested: setType === 'attested' || setType === 'both',
    nonAttested: setType === 'non_attested' || setType === 'both',
  };
}
