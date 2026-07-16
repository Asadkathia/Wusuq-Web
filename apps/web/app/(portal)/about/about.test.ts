// Node-env unit test (see jest.config.js testEnvironment: 'node'). Rendering
// <AboutPage> to assert on output would need jsdom + @testing-library/react,
// which aren't web devDependencies (same call as
// components/consumer-ticket-board.test.ts). Guard against regressions with
// source-level assertions instead: the About page must show the exact
// attribution string, and the About nav entry must appear in the staff
// (buildNavItems) list but never in the clerk (buildClerkItems) list.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Jest runs this suite as an ESM module (see jest.config.js
// extensionsToTreatAsEsm), so __dirname isn't defined — derive it from
// import.meta.url instead.
const currentDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const navSource = readFileSync(join(currentDir, '..', '..', '..', 'components', 'nav.tsx'), 'utf8');

function extractFunctionBody(source: string, fnName: string): string {
  const start = source.indexOf(`function ${fnName}(`);
  if (start === -1) throw new Error(`function ${fnName} not found in nav.tsx`);
  const nextFnMarkers = ['function buildClerkItems(', 'function readIsClerk('];
  let end = source.length;
  for (const marker of nextFnMarkers) {
    const idx = source.indexOf(marker, start + 1);
    if (idx !== -1 && idx < end) end = idx;
  }
  return source.slice(start, end);
}

describe('About page', () => {
  it('renders the exact attribution string', () => {
    expect(pageSource).toContain('ATTRIBUTION');
  });

  it('uses DEVELOPER constant for the dl entry, not a hardcoded string', () => {
    expect(pageSource).toContain('{DEVELOPER}');
    // Ensure the hardcoded literal is NOT present in the dd
    expect(pageSource).not.toMatch(/<dd[^>]*>@2026-Klarus AI<\/dd>/);
  });

  it('imports the shared ShellFooter helpers, not a hardcoded string', () => {
    expect(pageSource).toContain("from '@/components/ui/shell-footer'");
  });
});

describe('About nav entry', () => {
  const staffBody = extractFunctionBody(navSource, 'buildNavItems');
  const clerkBody = extractFunctionBody(navSource, 'buildClerkItems');

  it('is present in buildNavItems (staff/admin nav)', () => {
    expect(staffBody).toContain("href: '/about'");
    expect(staffBody).toContain("label: 'About'");
  });

  it('is absent from buildClerkItems (clerk nav)', () => {
    expect(clerkBody).not.toContain("href: '/about'");
    expect(clerkBody).not.toContain("label: 'About'");
  });
});
