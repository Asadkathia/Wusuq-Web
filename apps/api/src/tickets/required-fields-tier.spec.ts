import { requiredFieldsFor } from '@wusuq/shared';

// 5-24-26 #16: Lower Court must never force case number / year. These assert the
// shared per-tier drop list (REQUIRED_FIELDS_OPTIONAL_BY_TIER) stays in
// lock-step with the wizard's requiredByCourtTier — drift here is the classic
// "passes on the page, fails on submit" bug (QA B6/B7).
describe('requiredFieldsFor — lower-tier case number/year drops (#16)', () => {
  const BASE = [
    'select_service',
    'case_petition_no',
    'case_year',
    'case_type',
    'case_status',
    'case_title',
  ];

  it('drops case_year (and case number) for Case Filing at the lower tier', () => {
    const req = requiredFieldsFor('judicial_case_filing', BASE, 'lower');
    expect(req).not.toContain('case_year');
    expect(req).not.toContain('case_petition_no');
  });

  it('keeps case_year required for Case Filing at the high tier', () => {
    const req = requiredFieldsFor('judicial_case_filing', BASE, 'high');
    expect(req).toContain('case_year');
  });

  it('drops case_year and case number for Power of Attorney at the lower tier', () => {
    const req = requiredFieldsFor('judicial_power_of_attorney', BASE, 'lower');
    expect(req).not.toContain('case_year');
    expect(req).not.toContain('case_petition_no');
  });

  it('drops case_title (and year/type) for Case Files at the high tier (#22)', () => {
    const req = requiredFieldsFor('judicial_case_files', BASE, 'high');
    expect(req).not.toContain('case_title');
    expect(req).not.toContain('case_year');
  });
});
