/**
 * Build the prefilled wizard payload for a staff-initiated "regenerate" —
 * a fresh intake ticket pre-populated with an existing ticket's full
 * form payload so the staff member can review and edit before submitting.
 *
 * Unlike {@link buildFutureTicketsPayload} (which only whitelists certain
 * fields and rolls dates forward), this starts from a FULL copy of the
 * source payload so the staff member starts exactly where the source
 * ticket was and can adjust any field before re-submitting through the
 * normal intake path — but see the batch-9 pruning below: a full copy is
 * only correct when the TARGET flow is the same as the source's.
 *
 * The only key intentionally omitted unconditionally is `parent_ticket_id`,
 * which is a lineage stamp specific to the consumer "next hearing" flow;
 * the regenerate path stamps its own `regeneratedFromTicketId` on the
 * created ticket via the intake POST body instead.
 */
import { toDateInput } from './hearing-date';
import type { IntakeFlow } from './intake-flows';

/** Keys that are internal lineage stamps, not form data. */
const INTERNAL_KEYS: ReadonlySet<string> = new Set(['parent_ticket_id']);

/**
 * Cross-flow structural keys that are NEVER declared as a literal
 * `IntakeField.key` in `intake-flows.ts` — they're rendered by dedicated
 * geo/location components (the court/city picker, the FIR police-station
 * block, …) instead of the flat field loop. Mirrors `GEO_HANDLED_KEYS` in
 * `intake-wizard.tsx` (keep the two in sync). Every flow relies on this
 * state without "declaring" it the way a business field like `attested_qty`
 * is declared, so it must survive the declared-keys prune below even when
 * the target flow's own step definitions don't literally list it.
 */
const STRUCTURAL_KEYS: ReadonlySet<string> = new Set([
  'province', 'district_id', 'station_id', 'other_station_id', 'city_type', 'office_name',
  'select_court', 'select_court_city',
  'documents_upload_note', 'select_service',
  'city', 'city_id',
]);

/** The four mutually-exclusive Case Files set-type quantity keys. */
const ALL_SET_TYPE_QUANTITY_KEYS: ReadonlySet<string> = new Set([
  'attested_qty', 'non_attested_qty', 'both_attested_qty', 'both_non_attested_qty',
]);

/** Which quantity key(s) are meaningful for a given `set_type` value. */
const SET_TYPE_QUANTITY_KEYS_BY_VALUE: Record<string, readonly string[]> = {
  attested: ['attested_qty'],
  non_attested: ['non_attested_qty'],
  both: ['both_attested_qty', 'both_non_attested_qty'],
};

/** Union of every `IntakeField.key` declared across a flow's own steps. */
function declaredFieldKeys(flow: IntakeFlow): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const step of flow.steps) {
    for (const field of step.fields) keys.add(field.key);
  }
  return keys;
}

/**
 * Return a copy of the source `formPayload`, pruned for the TARGET flow.
 *
 * Batch-9 §2 (closes batch-7 1.5): `regenerateHref` sends the consumer to
 * the service-picker route, and they can land on a DIFFERENT flow than the
 * source ticket's. A full copy across a changed flow leaked the old flow's
 * fields into the new one (e.g. a Case Files ticket's `attested_qty` /
 * `set_type` / `delivery_address` bleeding into a regenerated Case
 * Information ticket, which has neither concept). `targetFlow` is optional
 * for callers that don't yet know it (e.g. legacy tests exercising the
 * value-coercion behaviour below) — omitting it skips the declared-keys
 * prune entirely and keeps the old full-copy behaviour for that part.
 *
 * Batch-9 §1(a): independently of the flow prune, the four set-type
 * quantity keys are mutually exclusive (each gated by
 * `showWhen: { field: 'set_type', … }`) but a full copy carries all of
 * them forward regardless of which one the SOURCE ticket's own `set_type`
 * actually used — this is how a Non-Attested ticket ended up submitting a
 * stale `attested_qty: 1`. Keep only the quantity key(s) matching the
 * copied payload's own `set_type` value.
 */
export function buildRegeneratePayload(
  sourcePayload: Record<string, unknown>,
  targetFlow?: IntakeFlow,
): Record<string, string> {
  const declared = targetFlow ? declaredFieldKeys(targetFlow) : null;
  const sourceSetType =
    typeof sourcePayload.set_type === 'string' ? sourcePayload.set_type : undefined;
  const keepQuantityKeys = new Set(
    sourceSetType ? (SET_TYPE_QUANTITY_KEYS_BY_VALUE[sourceSetType] ?? []) : [],
  );

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(sourcePayload)) {
    if (INTERNAL_KEYS.has(key)) continue;
    if (declared && !declared.has(key) && !STRUCTURAL_KEYS.has(key)) continue;
    if (ALL_SET_TYPE_QUANTITY_KEYS.has(key) && !keepQuantityKeys.has(key)) continue;
    if (value == null) continue;
    if (typeof value === 'string') {
      out[key] = value;
      continue;
    }
    // Batch-7 1.6: "Regenerate ticket misses the Address". The old guard was
    // `typeof value === 'string'`, so any NON-string payload value was
    // silently dropped — and `delivery_address` is a structured object that
    // reaches the client as JSON (Prisma Json round-trips it as an object,
    // and parseDeliveryAddress accepts both shapes precisely because of
    // that). The address vanished while every plain-string field survived,
    // which is exactly the symptom reported. Re-serialise objects to the
    // wizard's wire format and stringify scalars instead of discarding them.
    if (typeof value === 'object') {
      out[key] = JSON.stringify(value);
      continue;
    }
    out[key] = String(value);
  }
  return out;
}

/**
 * Overlay a ticket's AUTHORITATIVE hearing dates onto a copied payload.
 *
 * Batch-5 D: `Ticket.scheduledDate` (clerk-recorded next hearing) and
 * `Ticket.previousHearingDate` outrank the intake-time `future_date` /
 * `case_date` payload keys — the same precedence buildCaseView and the
 * future-tickets strip already use. Copying formPayload alone left the
 * regenerated ticket's "Next hearing date" blank whenever the clerk had
 * recorded the hearing on the ticket instead of the consumer typing it at
 * intake, which is the normal case and what the client demonstrated.
 *
 * Only overwrites when an authoritative value actually exists, so a ticket
 * that was never rescheduled keeps whatever the payload carried.
 */
export function applyAuthoritativeHearingDates(
  payload: Record<string, string>,
  scheduledDate?: string | null,
  previousHearingDate?: string | null,
): Record<string, string> {
  const next = toDateInput(scheduledDate);
  const prev = toDateInput(previousHearingDate);
  return {
    ...payload,
    ...(next ? { future_date: next } : {}),
    ...(prev ? { case_date: prev } : {}),
  };
}
