// H2 data-loss guard: `openEdit` must populate the address/geo fields from the
// user object being edited, not hard-reset them to ''. A regression here
// means opening "Edit User" then clicking Save silently blanks an existing
// user's saved address/province/district/city (the PATCH sends whatever is
// in `form`). Source-level guard (Jest runs testEnvironment:'node', no
// jsdom/Testing Library) — mirrors the pattern in
// consumer-ticket-board.test.ts.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Jest treats this suite as ESM (see jest.config.js extensionsToTreatAsEsm),
// so __dirname is undefined here — derive it from import.meta.url instead.
const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, 'users-board.tsx'), 'utf8');

// Isolate the openEdit function body so the assertions can't be satisfied by
// unrelated code elsewhere in the file (e.g. emptyForm's blank defaults, or
// openCreate resetting the form to emptyForm).
function openEditBody(src: string): string {
  const start = src.indexOf('const openEdit = ');
  if (start === -1) throw new Error('openEdit not found in users-board.tsx');
  const end = src.indexOf('const saveUser', start);
  if (end === -1) throw new Error('could not bound openEdit body');
  return src.slice(start, end);
}

describe('users-board openEdit (H2 address/geo data-loss guard)', () => {
  const body = openEditBody(source);

  it('populates address from the user being edited, not a blank literal', () => {
    expect(body).toMatch(/address:\s*u\.address\s*\?\?\s*''/);
  });

  it('populates province/district/city from the user being edited', () => {
    expect(body).toMatch(/province:\s*u\.province\s*\?\?\s*''/);
    expect(body).toMatch(/district:\s*u\.district\s*\?\?\s*''/);
    expect(body).toMatch(/city:\s*u\.city\s*\?\?\s*''/);
  });

  it('does not hard-reset any of the four fields to a bare empty-string literal', () => {
    // The pre-fix bug: `address: '', province: '', district: '', city: ''`
    // inside openEdit's setForm call. Assert none of the four keys are wired
    // to a bare '' anywhere in the isolated openEdit body.
    expect(body).not.toMatch(/address:\s*''/);
    expect(body).not.toMatch(/province:\s*''/);
    expect(body).not.toMatch(/district:\s*''/);
    expect(body).not.toMatch(/city:\s*''/);
  });
});
