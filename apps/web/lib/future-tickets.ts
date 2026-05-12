/**
 * Build the prefilled wizard payload for a "future ticket" — the
 * follow-up ticket a consumer wants at the next hearing date of a
 * pending case. The source ticket is one that has already completed.
 *
 * Rules:
 *   - Keep city, court, and case-identifier fields so the consumer
 *     doesn't re-enter known facts.
 *   - Roll dates forward: the source's `future_date` (the upcoming
 *     hearing at the time the original ticket was submitted, now in
 *     the past relative to today) becomes the new `case_date`
 *     (Previous case date). New `future_date` is empty — the consumer
 *     fills in the next-next hearing.
 *   - Reset `case_status` to "Pending Case" — a follow-up at the next
 *     hearing is by definition still pending.
 *   - Clear delivery preferences and document selections; the consumer
 *     picks them fresh for the new ticket.
 *   - Stamp `parent_ticket_id` for staff-side backlinking. Pure JSON
 *     metadata, no schema change.
 */

const COPIED_KEYS = [
  'city',
  'city_id',
  'select_court',
  'select_court_id',
  'select_court_type',
  'select_court_city',
  'case_type',
  'case_no',
  'case_title',
  'case_year',
  'bench',
  'judge_name',
  'judge_designation',
] as const;

const CLEARED_KEYS = [
  'required_documentations',
  'set_type',
  'attested_qty',
  'non_attested_qty',
  'delivery_mode',
  'delivery_address',
  'want_pdf_before_dispatch',
  'notes',
] as const;

export type FutureTicketsPrefillArgs = {
  sourceTicketId: string;
  sourcePayload: Record<string, string | undefined>;
};

export function buildFutureTicketsPayload(
  args: FutureTicketsPrefillArgs,
): Record<string, string> {
  const out: Record<string, string> = {};

  // 1. Copy whitelisted identifier fields (skip empty/undefined).
  for (const key of COPIED_KEYS) {
    const v = args.sourcePayload[key];
    if (typeof v === 'string' && v.length > 0) {
      out[key] = v;
    }
  }

  // 2. Roll dates forward.
  const sourceFuture = args.sourcePayload.future_date ?? '';
  out.case_date = sourceFuture;
  out.future_date = '';

  // 3. Reset case status.
  out.case_status = 'Pending Case';

  // 4. Explicitly clear delivery preferences and document selections so
  // the wizard's "missing" state surfaces them as fresh choices rather
  // than carrying over stale values from the previous ticket.
  for (const key of CLEARED_KEYS) {
    out[key] = '';
  }

  // 5. Tag for staff-side backlinking.
  out.parent_ticket_id = args.sourceTicketId;

  return out;
}
