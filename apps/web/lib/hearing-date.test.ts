import { toDateInput } from './hearing-date';

describe('toDateInput', () => {
  it('passes a plain yyyy-MM-dd through untouched', () => {
    expect(toDateInput('2026-08-12')).toBe('2026-08-12');
  });

  it('takes the calendar date out of a UTC timestamp', () => {
    expect(toDateInput('2026-08-12T00:00:00.000Z')).toBe('2026-08-12');
  });

  it('does NOT shift an offset-bearing ISO string back a day', () => {
    // The bug this helper exists to prevent: `new Date(v).toISOString()` turns
    // 2026-08-12T00:00:00+05:00 into 2026-08-11T19:00Z, so the naive
    // .slice(0, 10) prefills the hearing one day EARLY. The API accepts such a
    // value — CreateTicketIntakeDto.scheduledDate is only @IsDateString().
    expect(toDateInput('2026-08-12T00:00:00+05:00')).toBe('2026-08-12');
    expect(toDateInput('2026-08-12T23:30:00-08:00')).toBe('2026-08-12');
  });

  it('returns empty string for blank or unparseable input so `||` fallbacks fire', () => {
    for (const bad of ['', '   ', null, undefined, 'not-a-date']) {
      expect(toDateInput(bad as never)).toBe('');
    }
  });
});
