// Source-level guards (Jest runs testEnvironment:'node', no jsdom/Testing
// Library — see users-board.test.ts for the established pattern).
//
// C2 — a "View" (preview) action must exist beside Download in each file
// row, using the shared <DocumentPreview> component.
// D1 — the cohort header must render the case title (from caseMeta) when
// present.
// D2 — per-row selection + a bulk "Delete selected" action bar, wired to
// DELETE /personal-files/bulk.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, 'cohort-group.tsx'), 'utf8');

describe('CohortGroup — View action (C2)', () => {
  it('imports DocumentPreview', () => {
    expect(source).toMatch(/import \{ DocumentPreview \} from '@\/components\/document-preview';/);
  });

  it('renders <DocumentPreview> for the selected preview file', () => {
    expect(source).toMatch(/<DocumentPreview\b/);
  });

  it('opens the preview via a dedicated View button (not reusing Download)', () => {
    expect(source).toMatch(/aria-label="View"/);
    expect(source).toMatch(/onClick=\{\(\) => setPreviewFile\(f\)\}/);
  });
});

describe('CohortGroup — case title header (D1)', () => {
  it('accepts a caseTitle prop', () => {
    expect(source).toMatch(/caseTitle\?:\s*string \| null/);
  });

  it('renders the case title in the cohort header when present', () => {
    expect(source).toMatch(/\{caseTitle \? <p[^>]*>\{caseTitle\}<\/p> : null\}/);
  });
});

describe('CohortGroup — bulk delete (D2)', () => {
  it('renders a per-row selection checkbox', () => {
    expect(source).toMatch(/type="checkbox"[\s\S]{0,80}checked=\{selected\.has\(f\.id\)\}/);
  });

  it('renders a "Delete selected" action wired to handleBulkDelete', () => {
    expect(source).toMatch(/onClick=\{handleBulkDelete\}/);
    expect(source).toMatch(/Delete selected/);
  });

  it('calls DELETE /personal-files/bulk with the selected ids', () => {
    expect(source).toMatch(/apiClient\.delete[\s\S]{0,120}'\/personal-files\/bulk'/);
    expect(source).toMatch(/JSON\.stringify\(\{ ids: Array\.from\(selected\) \}\)/);
  });
});
