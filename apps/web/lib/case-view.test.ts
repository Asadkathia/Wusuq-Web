import { buildCaseView, isCaseViewEmpty } from './case-view';
import { BENCH_TYPE_LABELS } from './bench-types';

const lower = {
  select_court_type: 'Lower Court',
  case_title: 'A vs B',
  case_no: '123/2026',
  case_type: 'Civil Suit',
  case_status: 'Pending Case',
  judge_designation: 'Additional Session Judge',
  judge_name: 'Zahid',
  case_date: '2026-06-23',
  future_date: '2026-07-10',
  select_court: 'Sessions Court',
  city_id: 'cmABC123',        // must NOT appear anywhere
  source: 'next-web-intake',  // must NOT appear anywhere
};

describe('buildCaseView', () => {
  it('maps title, status tone, judge, hearings', () => {
    const v = buildCaseView(lower, 'lower');
    expect(v.title).toBe('A vs B');
    expect(v.status).toEqual({ label: 'Pending Case', tone: 'pending' });
    // bench.type is null because `lower` has no `bench` key in its payload
    expect(v.bench).toEqual({ designation: 'Additional Session Judge', judges: ['Zahid'], type: null });
    expect(v.hearings).toEqual({ previous: '2026-06-23', next: '2026-07-10' });
  });

  it('summary carries case no + type + court, and never raw ids/source', () => {
    const v = buildCaseView(lower, 'lower');
    const labels = v.summary.map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(['Case No', 'Case Type', 'Court']));
    const blob = JSON.stringify(v);
    expect(blob).not.toContain('cmABC123');
    expect(blob).not.toContain('next-web-intake');
  });

  it('decided → green tone; unknown → gray', () => {
    expect(buildCaseView({ case_status: 'Decided Case' }, 'high').status!.tone).toBe('decided');
    expect(buildCaseView({ case_status: 'Unknown Case' }, 'high').status!.tone).toBe('unknown');
  });

  it('block order differs by tier: lower ends with bench, apex puts bench before hearings', () => {
    expect(buildCaseView(lower, 'lower').blockOrder).toEqual(['summary', 'hearings', 'bench']);
    expect(buildCaseView({ ...lower, select_court_type: 'High Court' }, 'high').blockOrder)
      .toEqual(['summary', 'bench', 'hearings']);
  });

  it('omits empty blocks (no hearings → hearings null)', () => {
    const v = buildCaseView({ case_title: 'X', case_status: 'Pending Case' }, 'lower');
    expect(v.hearings).toBeNull();
    expect(v.bench).toBeNull();
  });

  it('humanizes the document bundle value when present', () => {
    const v = buildCaseView({ ...lower, required_documentations: 'doc_petition_plus_complete_order' }, 'lower');
    const row = v.summary.find((r) => r.label === 'Document Bundle');
    expect(row?.value).not.toContain('doc_');
  });

  it('null payload → empty view', () => {
    const v = buildCaseView(null, null);
    expect(v.title).toBeNull();
    expect(v.summary).toEqual([]);
  });

  // ── Finding 1: bench type ────────────────────────────────────────────────

  it('bench.type is populated from a structured bench payload', () => {
    const payload = {
      ...lower,
      bench: JSON.stringify({ benchType: 'db_2', judges: ['Judge X', 'Judge Y'] }),
    };
    const v = buildCaseView(payload, 'high');
    expect(v.bench).not.toBeNull();
    expect(v.bench!.type).toBe(BENCH_TYPE_LABELS.db_2); // 'Divisional Bench (2 Judges)'
    expect(v.bench!.judges).toEqual(['Judge X', 'Judge Y']);
  });

  it('bench.type is null when no bench key is present in the payload', () => {
    const v = buildCaseView(lower, 'lower');
    // lower has no `bench` field — parseBench fallback must NOT bleed through
    expect(v.bench!.type).toBeNull();
  });

  it('bench type resolves for all known bench-type keys', () => {
    const keys: Array<keyof typeof BENCH_TYPE_LABELS> = [
      'single_judge', 'db_2', 'fb_3', 'larger', 'larger_5', 'larger_7',
    ];
    for (const k of keys) {
      const p = { bench: JSON.stringify({ benchType: k, judges: [] }) };
      const v = buildCaseView(p, 'high');
      expect(v.bench!.type).toBe(BENCH_TYPE_LABELS[k]);
    }
  });

  it('bench.type is null for an unknown benchType string', () => {
    // Include a judge so bench is non-null despite the unrecognized type key.
    const p = { bench: JSON.stringify({ benchType: 'unknown_future_type', judges: ['Judge A'] }) };
    const v = buildCaseView(p, 'high');
    expect(v.bench).not.toBeNull();
    expect(v.bench!.type).toBeNull();
  });

  // ── Finding 2: operational summary fields ───────────────────────────────

  it('set_type is humanized in the summary', () => {
    const v = buildCaseView({ ...lower, set_type: 'attested' }, 'lower');
    const row = v.summary.find((r) => r.label === 'Set Type');
    expect(row).toBeDefined();
    expect(row!.value).toBe('Attested');
  });

  it('want_pdf_before_dispatch appears as "PDF Copy" and preserves mixed-case value', () => {
    const v = buildCaseView({ ...lower, want_pdf_before_dispatch: 'Yes' }, 'lower');
    const row = v.summary.find((r) => r.label === 'PDF Copy');
    expect(row).toBeDefined();
    expect(row!.value).toBe('Yes'); // 'Yes' starts uppercase → not humanized
  });

  it('search_method humanizes to Title Case', () => {
    const v = buildCaseView({ ...lower, search_method: 'both' }, 'lower');
    const row = v.summary.find((r) => r.label === 'Search Method');
    expect(row).toBeDefined();
    expect(row!.value).toBe('Both');
  });

  it('case_year / year dual-key lookup works for both aliases', () => {
    const v1 = buildCaseView({ ...lower, case_year: '2021' }, 'lower');
    expect(v1.summary.find((r) => r.label === 'Case Year')?.value).toBe('2021');

    const v2 = buildCaseView({ ...lower, year: '2022' }, 'lower');
    expect(v2.summary.find((r) => r.label === 'Case Year')?.value).toBe('2022');

    // case_year wins over year when both present
    const v3 = buildCaseView({ ...lower, case_year: '2021', year: '2020' }, 'lower');
    expect(v3.summary.find((r) => r.label === 'Case Year')?.value).toBe('2021');
  });

  it('new operational fields appear when present', () => {
    const payload = {
      ...lower,
      decided_date: '2025-03-15',
      case_type_other: 'Corruption',
      sets: '3',
      attested_qty: '2',
      subject_full_name: 'Ali Hassan',
      subject_cnic: '35202-1234567-1',
      cnic: '42201-9876543-0',
      purpose: 'litigation',
    };
    const v = buildCaseView(payload, 'lower');
    const labels = v.summary.map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Decided Date',
      'Case Type (Other)',
      'Sets',
      'Attested Copies',
      'Subject Name',
      'Subject CNIC',
      'CNIC',
      'Purpose',
    ]));
    // purpose is a snake_case-ish value → humanized
    expect(v.summary.find((r) => r.label === 'Purpose')?.value).toBe('Litigation');
    // names and CNIC values are not humanized (spaces / hyphens)
    expect(v.summary.find((r) => r.label === 'Subject Name')?.value).toBe('Ali Hassan');
    expect(v.summary.find((r) => r.label === 'Subject CNIC')?.value).toBe('35202-1234567-1');
  });

  // ── Finding 3: police station dual-key ──────────────────────────────────

  it('police_station falls back to station alias', () => {
    const v1 = buildCaseView({ ...lower, police_station: 'Gulberg' }, 'lower');
    expect(v1.summary.find((r) => r.label === 'Police Station')?.value).toBe('Gulberg');

    const v2 = buildCaseView({ ...lower, station: 'Cantt' }, 'lower');
    expect(v2.summary.find((r) => r.label === 'Police Station')?.value).toBe('Cantt');

    // police_station wins over station when both present
    const v3 = buildCaseView({ ...lower, police_station: 'Model Town', station: 'Gulberg' }, 'lower');
    expect(v3.summary.find((r) => r.label === 'Police Station')?.value).toBe('Model Town');
  });

  // ── Value humanizer unit tests ───────────────────────────────────────────

  it('value humanizer Title-cases snake_case but leaves other strings unchanged', () => {
    // Humanized
    expect(buildCaseView({ ...lower, set_type: 'both' }, 'lower')
      .summary.find((r) => r.label === 'Set Type')?.value).toBe('Both');
    expect(buildCaseView({ ...lower, set_type: 'non_attested' }, 'lower')
      .summary.find((r) => r.label === 'Set Type')?.value).toBe('Non Attested');

    // Case number with slash → untouched
    const caseNoRow = buildCaseView(lower, 'lower').summary.find((r) => r.label === 'Case No');
    expect(caseNoRow?.value).toBe('123/2026');

    // Name with space → untouched
    const namePayload = { ...lower, subject_full_name: 'Muhammad Asad' };
    const nameRow = buildCaseView(namePayload, 'lower').summary.find((r) => r.label === 'Subject Name');
    expect(nameRow?.value).toBe('Muhammad Asad');
  });

  // ── city_id / source still never leak (cnic IS now allowed) ─────────────

  it('city_id and source values never appear; cnic value IS allowed', () => {
    const payload = {
      ...lower,
      cnic: '42201-9876543-0',
      city_id: 'cmABC123',
      source: 'next-web-intake',
    };
    const v = buildCaseView(payload, 'lower');
    const blob = JSON.stringify(v);
    expect(blob).not.toContain('cmABC123');
    expect(blob).not.toContain('next-web-intake');
    // cnic value IS present (it's in the allowlist)
    expect(blob).toContain('42201-9876543-0');
  });

  // ── Finding 1 (review-4): case_petition_no dual-key ────────────────────

  it('case_petition_no (without case_no) produces a "Case No" summary row', () => {
    const v = buildCaseView({ case_petition_no: '999/2026' }, null);
    const row = v.summary.find((r) => r.label === 'Case No');
    expect(row).toBeDefined();
    expect(row!.value).toBe('999/2026');
  });

  it('case_petition_no wins over case_no when both present', () => {
    const v = buildCaseView({ case_petition_no: '999/2026', case_no: '111/2026' }, null);
    const row = v.summary.find((r) => r.label === 'Case No');
    expect(row!.value).toBe('999/2026');
  });

  // ── Finding 2 (review-4): court type + service type ────────────────────

  it('select_court_type appears as "Court Type" when present', () => {
    const v = buildCaseView({ ...lower, select_court_type: 'High Court' }, 'high');
    const row = v.summary.find((r) => r.label === 'Court Type');
    expect(row).toBeDefined();
    expect(row!.value).toBe('High Court');
  });

  it('select_service appears as "Service Type" when present', () => {
    const v = buildCaseView({ ...lower, select_service: 'Lower Court Paralegal Service' }, 'lower');
    const row = v.summary.find((r) => r.label === 'Service Type');
    expect(row).toBeDefined();
    expect(row!.value).toBe('Lower Court Paralegal Service');
  });

  // ── Finding 3 (review-4): isCaseViewEmpty ──────────────────────────────

  it('isCaseViewEmpty returns true for an empty payload', () => {
    expect(isCaseViewEmpty(buildCaseView({}, null))).toBe(true);
  });

  it('isCaseViewEmpty returns true for a null payload', () => {
    expect(isCaseViewEmpty(buildCaseView(null, null))).toBe(true);
  });

  it('isCaseViewEmpty returns false when title is present', () => {
    expect(isCaseViewEmpty(buildCaseView({ case_title: 'X vs Y' }, null))).toBe(false);
  });

  it('isCaseViewEmpty returns false when any summary field is present', () => {
    expect(isCaseViewEmpty(buildCaseView({ case_no: '1/2026' }, null))).toBe(false);
  });

  it('isCaseViewEmpty returns false when status is present', () => {
    expect(isCaseViewEmpty(buildCaseView({ case_status: 'Pending Case' }, null))).toBe(false);
  });
});
