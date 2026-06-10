import { caseInfoBundleBase } from './pricing.service';

// 2026-06 #4/#5: For Case Information the chosen document bundle IS the base fee
// (region-keyed) — no separate add-on. These are the owner-confirmed numbers
// from the 2026-06 rate screenshots — locking them so a refactor can't drift.
describe('caseInfoBundleBase', () => {
  const PUNJAB: Record<string, number> = {
    doc_only_petition: 500,
    doc_petition_plus_last_order: 700,
    doc_petition_plus_complete_order: 800,
    doc_only_last_order: 350,
    doc_only_complete_order_sheet: 500,
  };
  const OTHER: Record<string, number> = {
    doc_only_petition: 1200,
    doc_petition_plus_last_order: 1500,
    doc_petition_plus_complete_order: 1500,
    doc_only_last_order: 750,
    doc_only_complete_order_sheet: 1200,
  };

  it('returns the Punjab base fee per bundle', () => {
    for (const [bundle, amount] of Object.entries(PUNJAB)) {
      expect(
        caseInfoBundleBase('judicial_case_information', 'Punjab', bundle),
      ).toBe(amount);
    }
  });

  it('returns the other-than-Punjab base fee per bundle', () => {
    for (const [bundle, amount] of Object.entries(OTHER)) {
      expect(
        caseInfoBundleBase('judicial_case_information', 'other', bundle),
      ).toBe(amount);
    }
  });

  it('treats an undefined region as other-than-Punjab', () => {
    expect(
      caseInfoBundleBase(
        'judicial_case_information',
        undefined,
        'doc_only_petition',
      ),
    ).toBe(1200);
  });

  it('returns 0 for non-Case-Information flows', () => {
    expect(
      caseInfoBundleBase(
        'judicial_case_files',
        'Punjab',
        'doc_only_last_order',
      ),
    ).toBe(0);
  });

  it('returns 0 when no bundle or an unknown bundle is supplied', () => {
    expect(
      caseInfoBundleBase('judicial_case_information', 'Punjab', undefined),
    ).toBe(0);
    expect(
      caseInfoBundleBase(
        'judicial_case_information',
        'Punjab',
        'doc_complete_file',
      ),
    ).toBe(0);
  });
});
