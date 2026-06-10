import {
  computeCaseSearchBase,
  CASE_SEARCH_PER_YEAR_RATE,
} from './pricing.service';

// Owner 2026-06: Case Search base = max(1, currentYear − caseYear) × Rs 2,000
// per city. Pass a fixed currentYear so the assertions are deterministic.
const CURRENT_YEAR = 2026;

describe('computeCaseSearchBase', () => {
  it('exposes the Rs 2,000 per-year rate', () => {
    expect(CASE_SEARCH_PER_YEAR_RATE).toBe(2000);
  });

  it('scales linearly: an 11-year-old case = 11 × 2,000 = 22,000', () => {
    expect(computeCaseSearchBase(CURRENT_YEAR - 11, CURRENT_YEAR)).toBe(22000);
  });

  it('a 1-year-old case = 1 × 2,000 = 2,000', () => {
    expect(computeCaseSearchBase(CURRENT_YEAR - 1, CURRENT_YEAR)).toBe(2000);
  });

  it('a current-year case charges the 1-year minimum = 2,000', () => {
    expect(computeCaseSearchBase(CURRENT_YEAR, CURRENT_YEAR)).toBe(2000);
  });

  it('an undefined caseYear (pending/unknown) charges the 1-year minimum = 2,000', () => {
    expect(computeCaseSearchBase(undefined, CURRENT_YEAR)).toBe(2000);
  });

  it('a future caseYear charges the 1-year minimum = 2,000', () => {
    expect(computeCaseSearchBase(CURRENT_YEAR + 5, CURRENT_YEAR)).toBe(2000);
  });
});
