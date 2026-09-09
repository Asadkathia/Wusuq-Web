import { applyAuthoritativeHearingDates, buildRegeneratePayload } from './regenerate-ticket';


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

describe('buildRegeneratePayload — non-string payload values (batch-7 1.6)', () => {
  it('keeps a structured delivery_address that arrives as an OBJECT', () => {
    // "Regenerate ticket misses the Address": the old `typeof value ===
    // 'string'` guard dropped every non-string value, and delivery_address
    // is a structured object (parseDeliveryAddress accepts both shapes
    // precisely because Prisma Json round-trips it as one). Plain-string
    // fields survived, so only the address went missing.
    const out = buildRegeneratePayload({
      case_no: '12345',
      delivery_address: { house: '213 R-1 Johar Town', block: '', mainArea: '', city: 'Lahore' },
    } as Record<string, unknown>);
    expect(out.case_no).toBe('12345');
    expect(JSON.parse(out.delivery_address!)).toEqual({
      house: '213 R-1 Johar Town', block: '', mainArea: '', city: 'Lahore',
    });
  });

  it('keeps a delivery_address that arrives as a JSON STRING unchanged', () => {
    const json = JSON.stringify({ house: 'H 12', block: '', mainArea: '', city: 'Lahore' });
    expect(buildRegeneratePayload({ delivery_address: json }).delivery_address).toBe(json);
  });

  it('stringifies scalars rather than discarding them', () => {
    const out = buildRegeneratePayload({ case_year: 2025, want_pdf: true } as Record<string, unknown>);
    expect(out.case_year).toBe('2025');
    expect(out.want_pdf).toBe('true');
  });

  it('still drops null/undefined and the internal lineage stamp', () => {
    const out = buildRegeneratePayload({
      parent_ticket_id: 'tkt_1', a: null, b: undefined, c: 'keep',
    } as Record<string, unknown>);
    expect(out).toEqual({ c: 'keep' });
  });
});
