// Source-level guard (see users-board.test.ts for the established pattern).
// C1 — the Actions column previously rendered ONE same-tab <a href> labelled
// "Download/View File" with no real preview. It must now render a dedicated
// View button that opens the shared <DocumentPreview> modal, alongside the
// (still-present) Download link.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, 'documents-board.tsx'), 'utf8');

describe('DocumentsBoard — View action (C1)', () => {
  it('imports DocumentPreview', () => {
    expect(source).toMatch(/import \{ DocumentPreview \} from '@\/components\/document-preview';/);
  });

  it('renders <DocumentPreview> for the selected preview doc', () => {
    expect(source).toMatch(/<DocumentPreview\b/);
  });

  it('opens the preview via a dedicated View button targeting the ticket document-download route', () => {
    expect(source).toMatch(/aria-label="View"/);
    expect(source).toMatch(
      /url: `\/tickets\/\$\{item\.ticket\.id\}\/documents\/\$\{item\.id\}\/download`/,
    );
  });

  it('keeps a real Download action distinct from View', () => {
    expect(source).toMatch(/aria-label="Download"/);
    expect(source).toMatch(/href=\{item\.fileUrl \|\| '#'\}/);
  });
});
