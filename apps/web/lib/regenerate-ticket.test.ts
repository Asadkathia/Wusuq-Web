import { applyAuthoritativeHearingDates } from './regenerate-ticket';


describe('applyAuthoritativeHearingDates (batch-5 D)', () => {
  it('fills a blank next hearing from the ticket scheduledDate', () => {
    // The client's case: the clerk recorded the hearing on the ticket, so the
    // copied payload had no future_date and the field rendered blank.
    const out = applyAuthoritativeHearingDates(
      { case_no: '123', future_date: '' },
      '2026-08-12T00:00:00.000Z',
      null,
    );
    expect(out.future_date).toBe('2026-08-12');
    expect(out.case_no).toBe('123');
  });

  it('overrides a stale payload date with the authoritative one', () => {
    const out = applyAuthoritativeHearingDates(
      { future_date: '2026-07-27', case_date: '2026-07-01' },
      '2026-08-12T00:00:00.000Z',
      '2026-07-30T00:00:00.000Z',
    );
    expect(out.future_date).toBe('2026-08-12');
    expect(out.case_date).toBe('2026-07-30');
  });

  it('leaves the payload untouched when the ticket has no authoritative dates', () => {
    const out = applyAuthoritativeHearingDates(
      { future_date: '2026-07-27', case_date: '2026-07-01' },
      null,
      undefined,
    );
    expect(out.future_date).toBe('2026-07-27');
    expect(out.case_date).toBe('2026-07-01');
  });

  it('ignores unparseable dates rather than blanking a good payload value', () => {
    const out = applyAuthoritativeHearingDates(
      { future_date: '2026-07-27' },
      'not-a-date',
      null,
    );
    expect(out.future_date).toBe('2026-07-27');
  });
});
