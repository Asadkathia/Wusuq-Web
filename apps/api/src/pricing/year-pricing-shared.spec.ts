import {
  computeCaseSearchBase,
  computeDecidedAgeSurcharge,
} from '@wusuq/shared';

// All tests pass a fixed currentYear so assertions are deterministic.
const CURRENT_YEAR = 2026;

describe('computeCaseSearchBase (from @wusuq/shared)', () => {
  it('11-year-old case = 11 × 2000 = 22000', () => {
    expect(computeCaseSearchBase(2015, CURRENT_YEAR)).toBe(11 * 2000);
  });

  it('undefined caseYear (pending/unknown) → 1-year minimum = 2000', () => {
    expect(computeCaseSearchBase(undefined, CURRENT_YEAR)).toBe(2000);
  });

  it('future caseYear → 1-year minimum = 2000', () => {
    expect(computeCaseSearchBase(2030, CURRENT_YEAR)).toBe(2000);
  });
});

describe('computeDecidedAgeSurcharge (from @wusuq/shared)', () => {
  it('Decided Case age 12 in 2026 = (12 - 10) × 1000 = 2000', () => {
    expect(computeDecidedAgeSurcharge('Decided Case', 2014, CURRENT_YEAR)).toBe(
      (12 - 10) * 1000,
    );
  });

  it('Pending Case → 0 (not a decided case)', () => {
    expect(computeDecidedAgeSurcharge('Pending Case', 2014, CURRENT_YEAR)).toBe(0);
  });

  it('current/future year → 0 (age not positive)', () => {
    expect(
      computeDecidedAgeSurcharge('Decided Case', CURRENT_YEAR, CURRENT_YEAR),
    ).toBe(0);
  });

  it('age ≤ threshold (10 years) → 0', () => {
    // 2018: age = 8, below the 10-year threshold
    expect(computeDecidedAgeSurcharge('Decided Case', 2018, CURRENT_YEAR)).toBe(0);
  });
});
