// Source-level guard (see users-board.test.ts for the established pattern).
// D1 — CaseFilesBoard must thread the cohort's caseTitle through to
// <CohortGroup>, or the header-level display added in cohort-group.tsx has
// nothing to render.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, 'case-files-board.tsx'), 'utf8');

describe('CaseFilesBoard — passes caseTitle through to CohortGroup (D1)', () => {
  it('declares caseTitle on the Cohort type', () => {
    expect(source).toMatch(/caseTitle\?:\s*string \| null;/);
  });

  it('passes cohort.caseTitle as a prop on <CohortGroup>', () => {
    expect(source).toMatch(/<CohortGroup[\s\S]{0,300}caseTitle=\{cohort\.caseTitle\}/);
  });
});

describe('case-files-board (D1 — judge name passed to the cohort header)', () => {
  it('passes cohort.judgeName into CohortGroup alongside caseTitle', () => {
    expect(source).toMatch(/judgeName=\{cohort\.judgeName\}/);
  });

  it('the upload drawer captures a judge name and appends it to the form', () => {
    const drawer = readFileSync(
      join(currentDir, 'case-files-board/upload-drawer.tsx'),
      'utf8',
    );
    expect(drawer).toMatch(/setCaseMetaField\('judgeName'/);
    expect(drawer).toMatch(/form\.append\('judgeName'/);
  });
})
