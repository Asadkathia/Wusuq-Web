import { orderRequiredFirst } from './field-order';

type F = { key: string; showWhen?: { field: string } };
const req = (keys: string[]) => (f: F) => keys.includes(f.key);
const keys = (fs: F[]) => fs.map((f) => f.key);

describe('orderRequiredFirst', () => {
  it('lifts required fields above optional ones', () => {
    // The client's exact Case Details complaint: Case Type / Case No / Year
    // (optional) rendered above Case Title / Judge Designation / Judge Name.
    const fields: F[] = [
      { key: 'case_type' },
      { key: 'case_no' },
      { key: 'year' },
      { key: 'case_title' },
      { key: 'judge_designation' },
    ];
    expect(keys(orderRequiredFirst(fields, req(['case_title', 'judge_designation'])))).toEqual([
      'case_title',
      'judge_designation',
      'case_type',
      'case_no',
      'year',
    ]);
  });

  it('preserves declared order inside each group (stable)', () => {
    const fields: F[] = [
      { key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' },
    ];
    expect(keys(orderRequiredFirst(fields, req(['b', 'd'])))).toEqual(['b', 'd', 'a', 'c']);
  });

  it('promotes a field gated by an EARLIER step', () => {
    // judge_name is showWhen'd on select_court_type, which lives in Step 1 —
    // not on this step, so promoting it cannot outrank its gate.
    const fields: F[] = [
      { key: 'case_type' },
      { key: 'judge_name', showWhen: { field: 'select_court_type' } },
    ];
    expect(keys(orderRequiredFirst(fields, req(['judge_name'])))).toEqual(['judge_name', 'case_type']);
  });

  it('NEVER lifts a field above the same-step field that gates it', () => {
    // The hazard this rule exists for: station_id is required but only
    // appears once fir_mode is answered. Promoting it would put a required
    // input above the question that reveals it — the exact "silently
    // committed to a branch" confusion batch-6 D1 fixed.
    const fields: F[] = [
      { key: 'fir_mode' },
      { key: 'station_id', showWhen: { field: 'fir_mode' } },
    ];
    expect(keys(orderRequiredFirst(fields, req(['station_id'])))).toEqual(['fir_mode', 'station_id']);
  });

  it('is a no-op when nothing is required, and when everything is', () => {
    const fields: F[] = [{ key: 'a' }, { key: 'b' }];
    expect(keys(orderRequiredFirst(fields, () => false))).toEqual(['a', 'b']);
    expect(keys(orderRequiredFirst(fields, () => true))).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const fields: F[] = [{ key: 'a' }, { key: 'b' }];
    orderRequiredFirst(fields, req(['b']));
    expect(keys(fields)).toEqual(['a', 'b']);
  });
});
