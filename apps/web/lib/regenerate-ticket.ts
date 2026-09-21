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
import { CROSS_FLOW_STRUCTURAL_KEYS } from './intake-flows';
import type { IntakeField, IntakeFlow } from './intake-flows';

/** Keys that are internal lineage stamps, not form data. */
const INTERNAL_KEYS: ReadonlySet<string> = new Set(['parent_ticket_id']);

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

/** Every `IntakeField` declared across a flow's own steps, keyed by `key` (first declaration wins). */
function declaredFieldsByKey(flow: IntakeFlow): ReadonlyMap<string, IntakeField> {
  const map = new Map<string, IntakeField>();
  for (const step of flow.steps) {
    for (const field of step.fields) {
      if (!map.has(field.key)) map.set(field.key, field);
    }
  }
  return map;
}

/**
 * Decide which flow a regenerated ticket should be submitted under.
 *
 * Batch-9 §2 (closes batch-7 1.5), hardened fix-round-1 Important 1: the
 * wizard mounts on the ROUTE's flow (`regenerateHref` always sends the
 * consumer to the `[flowKey]` page for whichever service tile they picked),
 * which is available before the source ticket's own data has loaded. The
 * route's choice MUST win — falling back to the source ticket's flow is
 * only for a wizard that somehow mounted without a pinned flow (defensive;
 * every real regenerate route pins one). Extracted as a pure function, used
 * for BOTH `draft.flow` and the flow the payload prune below runs against,
 * so the two can never disagree about which flow won.
 */
export function resolveRegenerateFlow(
  routeFlow: string | null | undefined,
  sourceFlow: string | null | undefined,
): string {
  return routeFlow || sourceFlow || '';
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
 * value-coercion behaviour below) — omitting it skips the flow-aware prune
 * entirely and keeps the old full-copy behaviour for that part.
 *
 * Two independent prunes run when `targetFlow` is given:
 *
 * 1. **Key-level**: drop a key the target flow doesn't declare as a literal
 *    `IntakeField.key`, UNLESS it's cross-flow structural state
 *    ({@link CROSS_FLOW_STRUCTURAL_KEYS} — geo/court/city keys rendered by
 *    dedicated components, never declared as literal fields, that every
 *    flow relies on regardless — `cities`, the Case Search multi-city key,
 *    is the fix-round-1 CRITICAL catch here: it was missing from this set
 *    and was silently dropped on EVERY Case Search regenerate, including
 *    same-flow, corrupting the `cityCount` pricing multiplier).
 * 2. **Value-level** (fix-round-1 Important 2): a key CAN be declared by
 *    the target flow under the SAME name but a DIFFERENT fixed option set
 *    — e.g. `case_status`: Case Files allows `'Decided Case'`, Case
 *    Information deliberately doesn't (CLAUDE.md: "a decided case has no
 *    live info to fetch"), and a stale `'Decided Case'` would reach
 *    `deriveYearBand` and corrupt the resolved price. Same shape for
 *    `delivery_mode` (Case Files: TCS/Uber/Self Collection vs Case Info:
 *    portal/whatsapp/other_no) and the partially-overlapping
 *    `required_documentations` bundle keys. Only applied to fields that
 *    declare a non-empty `options` array (radio/select/checkbox_single with
 *    a FIXED, static option list) — free-text/date/number fields and
 *    dynamically-populated selects (`case_type`, `judge_designation`:
 *    `options: []`) are left alone, since an empty declared list carries no
 *    information about what's valid.
 *
 * Batch-9 §1(a): independently of both flow prunes, the four set-type
 * quantity keys are mutually exclusive (each gated by
 * `showWhen: { field: 'set_type', … }`) but a full copy carries all of them
 * forward regardless of which one is actually meaningful — this is how a
 * Non-Attested ticket ended up submitting a stale `attested_qty: 1`. This
 * runs as a SECOND pass over the already-pruned output (keyed off the
 * FINAL, post-prune `set_type`, not the raw source value) so it composes
 * correctly with the two prunes above — e.g. a cross-flow regenerate that
 * already dropped `set_type` entirely must not resurrect a quantity key
 * from a stale value computed off the raw source payload.
 */
export function buildRegeneratePayload(
  sourcePayload: Record<string, unknown>,
  targetFlow?: IntakeFlow,
): Record<string, string> {
  const declaredFields = targetFlow ? declaredFieldsByKey(targetFlow) : null;

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(sourcePayload)) {
    if (INTERNAL_KEYS.has(key)) continue;

    if (declaredFields) {
      const field = declaredFields.get(key);
      if (!field && !CROSS_FLOW_STRUCTURAL_KEYS.has(key)) continue;
      if (field && field.options && field.options.length > 0 && typeof value === 'string') {
        if (!field.options.includes(value)) continue;
      }
    }

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

  const finalSetType = out.set_type;
  const keepQuantityKeys = new Set(
    finalSetType ? (SET_TYPE_QUANTITY_KEYS_BY_VALUE[finalSetType] ?? []) : [],
  );
  for (const qtyKey of ALL_SET_TYPE_QUANTITY_KEYS) {
    if (!keepQuantityKeys.has(qtyKey)) delete out[qtyKey];
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
