import { buildCaseView } from './case-view';

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
    expect(v.bench).toEqual({ designation: 'Additional Session Judge', judges: ['Zahid'] });
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
});
