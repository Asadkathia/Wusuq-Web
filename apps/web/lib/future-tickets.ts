/**
 * Build the prefilled wizard payload for a "future ticket" — the
 * follow-up ticket a consumer wants at the next hearing date of a
 * pending case. The source ticket is one that has already completed.
 *
 * Rules:
 *   - Keep city, court, and case-identifier fields so the consumer
 *     doesn't re-enter known facts.
 *   - Carry the hearing dates from the SOURCE TICKET's authoritative
 *     columns (`scheduledDate` / `previousHearingDate`), falling back to
 *     the intake-time payload keys. Batch-5 D: reading only
 *     `payload.future_date` left the date blank whenever the clerk had
 *     recorded the hearing on the ticket instead (the normal case), which
 *     is what the client hit.
 *   - The new ticket is FOR the upcoming hearing — clicking "Order Future
 *     Tickets" on a "Next hearing 12 Aug" strip means "I need documents
 *     for the 12th". So the source's NEXT hearing becomes the new
 *     `future_date` (client: "the 12th, the upcoming one, should come
 *     here"), and the source's PREVIOUS hearing becomes `case_date`.
 *     This replaced an earlier roll-forward that assumed the hearing had
 *     already passed and cleared `future_date`.
 *   - Reset `case_status` to "Pending Case" — a follow-up at the next
 *     hearing is by definition still pending.
 *   - Clear delivery preferences and document selections; the consumer
 *     picks them fresh for the new ticket.
 *   - Stamp `parent_ticket_id` for staff-side backlinking. Pure JSON
 *     metadata, no schema change.
 */
import { toDateInput } from './hearing-date';

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
  /** Source ticket's clerk-recorded next hearing (`Ticket.scheduledDate`) —
   *  authoritative over `payload.future_date`. */
  sourceNextHearing?: string | null;
  /** Source ticket's `Ticket.previousHearingDate` — authoritative over
   *  `payload.case_date`. */
  sourcePreviousHearing?: string | null;
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

  // 2. Hearing dates, from the ticket's authoritative columns first.
  //    `toDateInput` keeps the wizard's yyyy-MM-dd <input type="date"> happy
  //    when the source is a full ISO timestamp.
  const nextHearing =
    toDateInput(args.sourceNextHearing) || (args.sourcePayload.future_date ?? '');
  const prevHearing =
    toDateInput(args.sourcePreviousHearing) || (args.sourcePayload.case_date ?? '');
  out.case_date = prevHearing;
  out.future_date = nextHearing;

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
