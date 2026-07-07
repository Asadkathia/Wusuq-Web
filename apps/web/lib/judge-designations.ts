/**
 * Case-type-driven judge designation override (B7). Family Court and
 * Guardian Court case types have exactly one correct judge designation
 * regardless of which sub-court/tier the wizard resolved from
 * `select_court` — checked FIRST in `judgeDesignationOptions`
 * (intake-wizard.tsx), before the existing sub-court/court-type lookup.
 * Pure + exported so it's unit-testable without pulling React into the
 * Jest (node-env) test run.
 */
export function judgeDesignationsForCaseType(caseType?: string | null): string[] | null {
  const t = (caseType ?? '').toLowerCase();
  if (/guardian/.test(t)) return ['Guardian Judge'];
  if (/family/.test(t)) return ['Family Judge'];
  return null; // no category match → caller falls back to the subCourt map
}
