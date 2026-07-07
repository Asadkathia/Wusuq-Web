import { judgeDesignationsForCaseType } from './judge-designations';

describe('judgeDesignationsForCaseType', () => {
  it('maps Family Cases to Family Judge', () => {
    expect(judgeDesignationsForCaseType('Family Cases')).toEqual(['Family Judge']);
  });
  it('maps Guardianship Cases to Guardian Judge', () => {
    expect(judgeDesignationsForCaseType('Guardianship Cases')).toEqual(['Guardian Judge']);
  });
  it('is case-insensitive', () => {
    expect(judgeDesignationsForCaseType('FAMILY CASES')).toEqual(['Family Judge']);
    expect(judgeDesignationsForCaseType('guardianship matters')).toEqual(['Guardian Judge']);
  });
  it('returns null for an unrelated case type', () => {
    expect(judgeDesignationsForCaseType('Application for Succession')).toBeNull();
  });
  it('returns null for an empty string', () => {
    expect(judgeDesignationsForCaseType('')).toBeNull();
  });
  it('returns null for undefined/null', () => {
    expect(judgeDesignationsForCaseType(undefined)).toBeNull();
    expect(judgeDesignationsForCaseType(null)).toBeNull();
  });
});
