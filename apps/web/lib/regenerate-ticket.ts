/**
 * Build the prefilled wizard payload for a staff-initiated "regenerate" —
 * a fresh intake ticket pre-populated with an existing ticket's full
 * form payload so the staff member can review and edit before submitting.
 *
 * Unlike {@link buildFutureTicketsPayload} (which only whitelists certain
 * fields and rolls dates forward), this is a FULL copy: every field is
 * preserved so the staff member starts exactly where the source ticket was
 * and can adjust any field before re-submitting through the normal intake
 * path.
 *
 * The only key intentionally omitted is `parent_ticket_id`, which is a
 * lineage stamp specific to the consumer "next hearing" flow; the
 * regenerate path stamps its own `regeneratedFromTicketId` on the created
 * ticket via the intake POST body instead.
 */

/** Keys that are internal lineage stamps, not form data. */
const INTERNAL_KEYS: ReadonlySet<string> = new Set(['parent_ticket_id']);

/**
 * Return a full copy of the source `formPayload`, omitting only internal
 * lineage stamps that belong to the source ticket rather than the form
 * data being re-submitted.
 */
export function buildRegeneratePayload(
  sourcePayload: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(sourcePayload)) {
    if (INTERNAL_KEYS.has(key)) continue;
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}
