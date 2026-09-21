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

import { chargeCapabilitiesFor, toCurrency, type Currency } from '@wusuq/shared';

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
 * Attestation-pair visibility from a resolved set type + capability. The
 * single derivation `visibleChargeFields` (flow/currency-based, Task 1)
 * builds on.
 *
 * An ABSENT/unrecognised set type (legacy ticket, or a flow that never
 * asked) falls back to showing BOTH pairs rather than hiding a charge the
 * representative may legitimately need to enter — hiding by default could
 * silently strand a legacy ticket with no way to enter its charges.
 *
 * Batch-9 final review: this used to also back a payload-based
 * `chargeFieldVisibility(payload, canAttest)` export, but it had no
 * production callers — only its own tests — a second entry point into the
 * same rule that `visibleChargeFields` owns. Two copies of a money-visibility
 * rule is exactly the "shared formula, second copy drifts" shape CLAUDE.md
 * warns about elsewhere in this codebase, so it was deleted rather than left
 * to rot; call `visibleChargeFields` directly instead.
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

/**
 * The admin "Ticket Charges" board's editable money fields, as the string
 * values a controlled `<input>` binds to. Named generically (not
 * `ChargeEdit`, the board's own local alias) so this stays a framework-free
 * type usable from a plain unit test with no React/apiClient import.
 */
export interface GatedChargeAmounts {
  serviceCost: string;
  deliveryCharges: string;
  printingCharges: string;
  attestedCharges: string;
  nonAttestedCharges: string;
  additionalCharges: string;
  additionalServiceCost: string;
  discountPrice: string;
}

/**
 * Which `VisibleChargeFields` flag gates each `GatedChargeAmounts` key.
 * A key absent from this map (serviceCost, additionalCharges,
 * additionalServiceCost, discountPrice) is never capability-gated — it
 * always shows/sends, per the owner's own instruction (see
 * `visibleChargeFields`'s docblock).
 */
export const CHARGE_FIELD_CAPABILITY: Partial<Record<keyof GatedChargeAmounts, keyof VisibleChargeFields>> = {
  deliveryCharges: 'delivery',
  printingCharges: 'printing',
  attestedCharges: 'attested',
  nonAttestedCharges: 'nonAttested',
};

/**
 * Builds the PATCH `/finance/:id/charge` body for the Ticket Charges board,
 * omitting the four capability-gated charges when this ticket's
 * flow/currency doesn't grant that capability (batch-9 final review, merge
 * blocker).
 *
 * The board used to render and POST Delivery / Printing / Attested /
 * Non-Attested unconditionally, while `finance.updateCharge` (server-side,
 * `resolveGatedCharge`) force-zeroes Printing on every Case-Files ticket and
 * all four on every USD ticket — an admin who edited a gated field saw
 * "Charges updated." while the server silently discarded it. This is the
 * single place the board and the server's gate are kept in agreement; it
 * has no React/apiClient dependency so it can be unit tested by direct
 * execution rather than a source-string guard.
 *
 * The finance list doesn't carry the ticket's intake `formPayload`, so the
 * `set_type` narrowing `visibleChargeFields` accepts can't be resolved here
 * — `null` (never `undefined`, which the function's type doesn't accept) is
 * exactly the "unknown/absent set type" case the function already
 * documents: it shows BOTH attestation pairs rather than hiding a charge
 * the admin may legitimately need to enter. Only the flow/currency
 * capability gate — the one the server actually force-zeroes on — narrows
 * anything here.
 */
export function buildChargePatchBody(
  flow: string | null | undefined,
  currency: unknown,
  amounts: GatedChargeAmounts,
): Record<string, number> {
  const visibility = visibleChargeFields(flow, toCurrency(currency), null);
  const body: Record<string, number> = {
    serviceCost: Number(amounts.serviceCost),
    additionalCharges: Number(amounts.additionalCharges),
    additionalServiceCost: Number(amounts.additionalServiceCost),
    discountPrice: Number(amounts.discountPrice),
  };
  for (const [key, capability] of Object.entries(CHARGE_FIELD_CAPABILITY) as [
    keyof GatedChargeAmounts,
    keyof VisibleChargeFields,
  ][]) {
    if (visibility[capability]) body[key] = Number(amounts[key]);
  }
  return body;
}
