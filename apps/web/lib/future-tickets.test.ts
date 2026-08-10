import { buildFutureTicketsPayload } from './future-tickets';

describe('buildFutureTicketsPayload', () => {
  const SOURCE_ID = 'cmp0aaa000000000000000';

  it('keeps city, court, and case identifier fields', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: {
        city: 'Lahore',
        city_id: 'cmp104imq003207izpk28blll',
        select_court: 'Sessions Court',
        select_court_id: 'court-1',
        select_court_type: 'Lower Court',
        select_court_city: 'Lahore',
        case_type: 'Bail Application (S)',
        case_no: '1234',
        case_title: 'State vs Ahmed',
        case_year: '2026',
        bench: '{"benchType":"single_judge","judges":["A"]}',
        judge_name: 'J. A',
        judge_designation: 'Sessions Judge',
        case_status: 'Pending Case',
        case_date: '2026-04-10',
        future_date: '2026-05-13',
        required_documentations: 'doc_only_last_order',
        set_type: 'attested',
        attested_qty: '2',
        delivery_mode: 'TCS',
        delivery_address: '{"house":"H1"}',
        notes: 'leave at gate',
      },
    });
    expect(out.city).toBe('Lahore');
    expect(out.city_id).toBe('cmp104imq003207izpk28blll');
    expect(out.select_court).toBe('Sessions Court');
    expect(out.select_court_id).toBe('court-1');
    expect(out.select_court_type).toBe('Lower Court');
    expect(out.select_court_city).toBe('Lahore');
    expect(out.case_type).toBe('Bail Application (S)');
    expect(out.case_no).toBe('1234');
    expect(out.case_title).toBe('State vs Ahmed');
    expect(out.case_year).toBe('2026');
    expect(out.bench).toBe('{"benchType":"single_judge","judges":["A"]}');
    expect(out.judge_name).toBe('J. A');
    expect(out.judge_designation).toBe('Sessions Judge');
  });

  // Batch-5 D — DELIBERATE SEMANTIC CHANGE. This used to roll the source's
  // future_date into case_date and clear future_date, on the assumption the
  // hearing had already passed. But "Order Future Tickets" fires on an UPCOMING
  // hearing ("Next hearing 12 Aug"), so the new ticket is FOR that hearing.
  // Client: "the 12th, the upcoming one, should come here."
  it('carries the hearing dates across: source next -> future_date, source previous -> case_date', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: {
        city: 'Lahore',
        case_date: '2026-04-10',
        future_date: '2026-05-13',
        case_status: 'Pending Case',
      },
    });
    expect(out.future_date).toBe('2026-05-13');
    expect(out.case_date).toBe('2026-04-10');
  });

  it("prefers the ticket's authoritative columns over the intake payload keys", () => {
    // The clerk rescheduled on the ticket; the intake payload is stale. Reading
    // only the payload keys is what left the date blank/stale for the client.
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: { case_date: '2026-04-10', future_date: '2026-05-13' },
      sourceNextHearing: '2026-08-12T00:00:00.000Z',
      sourcePreviousHearing: '2026-07-30T00:00:00.000Z',
    });
    expect(out.future_date).toBe('2026-08-12');
    expect(out.case_date).toBe('2026-07-30');
  });

  it('fills the next hearing even when intake left future_date blank', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: { future_date: '' },
      sourceNextHearing: '2026-08-12T00:00:00.000Z',
    });
    expect(out.future_date).toBe('2026-08-12');
  });

  it('falls back to the payload keys when the ticket carries no authoritative dates', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: { case_date: '2026-04-10', future_date: '2026-05-13' },
      sourceNextHearing: null,
      sourcePreviousHearing: null,
    });
    expect(out.future_date).toBe('2026-05-13');
    expect(out.case_date).toBe('2026-04-10');
  });

  it('forces case_status back to Pending Case (a follow-up at next hearing is by definition still pending)', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: {
        case_status: 'Pending Case',
        city: 'Lahore',
        future_date: '2026-05-13',
      },
    });
    expect(out.case_status).toBe('Pending Case');
  });

  it('clears delivery preferences and document selections', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: {
        required_documentations: 'doc_only_last_order',
        set_type: 'attested',
        attested_qty: '2',
        non_attested_qty: '1',
        delivery_mode: 'TCS',
        delivery_address: '{"house":"H1","block":"B","mainArea":"M"}',
        want_pdf_before_dispatch: 'Yes',
        notes: 'leave at gate',
        case_status: 'Pending Case',
        city: 'Lahore',
        future_date: '2026-05-13',
      },
    });
    expect(out.required_documentations).toBe('');
    expect(out.set_type).toBe('');
    expect(out.attested_qty).toBe('');
    expect(out.non_attested_qty).toBe('');
    expect(out.delivery_mode).toBe('');
    expect(out.delivery_address).toBe('');
    expect(out.want_pdf_before_dispatch).toBe('');
    expect(out.notes).toBe('');
  });

  it('tags parent_ticket_id with the source id', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: { case_status: 'Pending Case', city: 'Lahore', future_date: '2026-05-13' },
    });
    expect(out.parent_ticket_id).toBe(SOURCE_ID);
  });

  it('ignores unknown / extra keys from the source payload', () => {
    const out = buildFutureTicketsPayload({
      sourceTicketId: SOURCE_ID,
      sourcePayload: {
        case_status: 'Pending Case',
        city: 'Lahore',
        future_date: '2026-05-13',
        random_legacy_key: 'foo',
        clerk_secret_metadata: 'bar',
      } as Record<string, string>,
    });
    expect((out as Record<string, string | undefined>).random_legacy_key).toBeUndefined();
    expect((out as Record<string, string | undefined>).clerk_secret_metadata).toBeUndefined();
  });
});
