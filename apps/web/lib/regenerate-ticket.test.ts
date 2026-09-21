import { applyAuthoritativeHearingDates, buildRegeneratePayload } from './regenerate-ticket';
import { judicialFlows } from './intake-flows';

const caseFilesFlow = judicialFlows.find((f) => f.key === 'judicial_case_files')!;
const caseInformationFlow = judicialFlows.find((f) => f.key === 'judicial_case_information')!;


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

describe('buildRegeneratePayload — flow prune (batch-9 §2, closes batch-7 1.5)', () => {
  it('keeps every key when the target flow is the SAME as the source (no targetFlow arg)', () => {
    // Backward-compatible: callers that don't pass a targetFlow (or pass
    // the flow the payload actually came from) get the old full-copy
    // behaviour for the declared-keys half of the prune.
    const out = buildRegeneratePayload({
      case_no: '123', set_type: 'attested', attested_qty: '1', delivery_address: 'H1',
    });
    expect(out).toEqual({
      case_no: '123', set_type: 'attested', attested_qty: '1', delivery_address: 'H1',
    });
  });

  it('regenerating Case Files → Case Information drops Case-Files-only keys', () => {
    // The reported bug: a consumer regenerates a Case Files ticket but
    // picks Power of Attorney / Case Information on the service picker —
    // the wizard must not carry Case-Files-only fields (set_type,
    // attested_qty, the physical delivery_address/coordinates — Case
    // Information is digital-only) into the new flow.
    const sourcePayload = {
      case_no: '123/2026',
      case_title: 'A vs B',
      set_type: 'attested',
      attested_qty: '2',
      delivery_address: JSON.stringify({ house: 'H1' }),
      coordinates: '31.5204, 74.3587',
    };
    const out = buildRegeneratePayload(sourcePayload, caseInformationFlow);
    expect(out.case_no).toBe('123/2026');
    expect(out.case_title).toBe('A vs B');
    expect(out.set_type).toBeUndefined();
    expect(out.attested_qty).toBeUndefined();
    expect(out.delivery_address).toBeUndefined();
    expect(out.coordinates).toBeUndefined();
  });

  it('keeps Case-Files fields when regenerating into the SAME flow', () => {
    const sourcePayload = {
      case_no: '123/2026', set_type: 'attested', attested_qty: '2',
    };
    const out = buildRegeneratePayload(sourcePayload, caseFilesFlow);
    expect(out.set_type).toBe('attested');
    expect(out.attested_qty).toBe('2');
  });

  it('keeps cross-flow geo/court state even when the target flow does not literally declare it', () => {
    // city_id / select_court / select_court_city / province / district_id
    // are rendered by dedicated geo components, not literal IntakeFields,
    // for the judicial flows — they must survive a Case Files → Case
    // Information switch (both need a city + court) even though neither
    // flow's `steps[].fields[]` declares them.
    const sourcePayload = {
      city_id: 'cmCITY1', select_court: 'Sessions Court', select_court_city: 'Lahore',
    };
    const out = buildRegeneratePayload(sourcePayload, caseInformationFlow);
    expect(out.city_id).toBe('cmCITY1');
    expect(out.select_court).toBe('Sessions Court');
    expect(out.select_court_city).toBe('Lahore');
  });
});

describe('buildRegeneratePayload — set-type quantity prune (batch-9 §1(a))', () => {
  it('drops attested_qty when set_type is non_attested (the reported symptom)', () => {
    const out = buildRegeneratePayload(
      { set_type: 'non_attested', non_attested_qty: '1', attested_qty: '1' },
      caseFilesFlow,
    );
    expect(out.non_attested_qty).toBe('1');
    expect(out.attested_qty).toBeUndefined();
  });

  it('keeps only attested_qty when set_type is attested', () => {
    const out = buildRegeneratePayload(
      { set_type: 'attested', attested_qty: '1', non_attested_qty: '3', both_attested_qty: '5' },
      caseFilesFlow,
    );
    expect(out.attested_qty).toBe('1');
    expect(out.non_attested_qty).toBeUndefined();
    expect(out.both_attested_qty).toBeUndefined();
  });

  it('keeps both both_* keys when set_type is both', () => {
    const out = buildRegeneratePayload(
      { set_type: 'both', both_attested_qty: '2', both_non_attested_qty: '4', attested_qty: '9' },
      caseFilesFlow,
    );
    expect(out.both_attested_qty).toBe('2');
    expect(out.both_non_attested_qty).toBe('4');
    expect(out.attested_qty).toBeUndefined();
  });

  it('drops every quantity key when set_type is absent', () => {
    const out = buildRegeneratePayload(
      { attested_qty: '1', non_attested_qty: '2' },
      caseFilesFlow,
    );
    expect(out.attested_qty).toBeUndefined();
    expect(out.non_attested_qty).toBeUndefined();
  });
});
