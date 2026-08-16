/**
 * Single source for turning a ticket's hearing-date column into the
 * `yyyy-MM-dd` string the wizard's `<input type="date">` fields expect.
 *
 * Batch-5 D shipped two byte-identical private copies of this (one in
 * future-tickets.ts, one in regenerate-ticket.ts) — hoisted here before they
 * could drift.
 *
 * Why the textual fast path matters: the naive
 * `new Date(v).toISOString().slice(0, 10)` is correct for the UTC-midnight
 * timestamps the clerk UI produces today, but it silently shifts an
 * offset-bearing ISO string back a day (`2026-08-12T00:00:00+05:00` →
 * `2026-08-11`). `CreateTicketIntakeDto.scheduledDate` is only
 * `@IsDateString()`, so an offset-bearing value is accepted by the API — a
 * consumer would then see the hearing prefilled one day early, which is
 * exactly the class of quiet wrongness this batch exists to remove. So when
 * the input already starts with a calendar date, take those characters
 * verbatim and never construct a Date at all.
 */
const YMD_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/** Returns '' for anything unparseable, so callers' `||` fallbacks fire. */
export function toDateInput(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '';

  // Already carries a calendar date (yyyy-MM-dd, or any ISO string starting
  // with one) — that IS the intended day, whatever offset follows it.
  const literal = YMD_PREFIX.exec(v)?.[1];
  if (literal) return literal;

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
