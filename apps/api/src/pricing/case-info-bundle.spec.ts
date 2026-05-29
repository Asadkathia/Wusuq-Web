import { caseInfoBundleSurcharge } from './pricing.service';

// 5-24-26 #6/#7: Case Information prices each document bundle as a region-keyed
// add-on on top of the seeded base fee. These are the owner-confirmed numbers
// from the 5-24-26 rate screenshots — locking them so a refactor can't drift.
describe('caseInfoBundleSurcharge', () => {
  const PUNJAB: Record<string, number> = {
    doc_only_petition: 500,
    doc_petition_plus_last_order: 700,
    doc_petition_plus_complete_order: 800,
    doc_only_last_order: 750,
    doc_only_complete_order_sheet: 1500,
  };
  const OTHER: Record<string, number> = {
    doc_only_petition: 750,
    doc_petition_plus_last_order: 1500,
    doc_petition_plus_complete_order: 1500,
    doc_only_last_order: 750,
    doc_only_complete_order_sheet: 1200,
  };

  it('applies the Punjab add-on per bundle', () => {
    for (const [bundle, amount] of Object.entries(PUNJAB)) {
      expect(
        caseInfoBundleSurcharge('judicial_case_information', 'Punjab', bundle),
      ).toBe(amount);
    }
  });

  it('applies the other-than-Punjab add-on per bundle', () => {
    for (const [bundle, amount] of Object.entries(OTHER)) {
      expect(
        caseInfoBundleSurcharge('judicial_case_information', 'other', bundle),
      ).toBe(amount);
    }
  });

  it('treats an undefined region as other-than-Punjab', () => {
    expect(
      caseInfoBundleSurcharge(
        'judicial_case_information',
        undefined,
        'doc_only_petition',
      ),
    ).toBe(750);
  });

  it('returns 0 for non-Case-Information flows', () => {
    expect(
      caseInfoBundleSurcharge(
        'judicial_case_files',
        'Punjab',
        'doc_only_last_order',
      ),
    ).toBe(0);
  });

  it('returns 0 when no bundle or an unknown bundle is supplied', () => {
    expect(
      caseInfoBundleSurcharge('judicial_case_information', 'Punjab', undefined),
    ).toBe(0);
    expect(
      caseInfoBundleSurcharge(
        'judicial_case_information',
        'Punjab',
        'doc_complete_file',
      ),
    ).toBe(0);
  });
});
