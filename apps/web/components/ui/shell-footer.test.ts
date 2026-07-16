import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { ATTRIBUTION, DEVELOPER, copyrightLine } from './shell-footer';

const currentDir = dirname(fileURLToPath(import.meta.url));

describe('attribution', () => {
  it('DEVELOPER is the exact credit without prefix', () => {
    expect(DEVELOPER).toBe('@2026-Klarus AI');
  });

  it('ATTRIBUTION is the exact agreed string', () => {
    expect(ATTRIBUTION).toBe('Developed by @2026-Klarus AI');
  });

  it('ATTRIBUTION is composed from DEVELOPER', () => {
    expect(ATTRIBUTION).toBe(`Developed by ${DEVELOPER}`);
  });

  it('builds the copyright line for a given year', () => {
    expect(copyrightLine(2026)).toBe('© 2026 Wusuq');
  });

  it('defaults to the current year', () => {
    expect(copyrightLine()).toBe(`© ${new Date().getFullYear()} Wusuq`);
  });
});

describe('attribution reaches every required surface', () => {
  const WEB = join(currentDir, '..', '..');
  const SURFACES = [
    'app/(portal)/layout.tsx',
    'app/(consumer)/layout.tsx',
  ];

  it.each(SURFACES)('%s renders ShellFooter', (rel) => {
    expect(readFileSync(join(WEB, rel), 'utf8')).toContain('ShellFooter');
  });

  const AUTH_PAGES = [
    'app/staff-portal/page.tsx',
    'app/(auth)/consumer/login/page.tsx',
    'app/(auth)/consumer/signup/page.tsx',
  ];

  // Match the JSX usage `{ATTRIBUTION}`, never the bare identifier: a bare
  // /ATTRIBUTION/ also matches the import line, so these assertions would pass
  // on a page that imports it and renders it nowhere.
  const renders = (body: string) => body.match(/\{ATTRIBUTION\}/g) ?? [];

  it.each(AUTH_PAGES)('%s renders the attribution', (rel) => {
    expect(renders(readFileSync(join(WEB, rel), 'utf8')).length).toBeGreaterThan(0);
  });

  it.each(AUTH_PAGES)('%s renders it on mobile too, not only in the lg-only hero', (rel) => {
    // The hero is `hidden lg:flex`, so a hero-only attribution is invisible
    // below lg. Two renders = hero + the lg:hidden mobile block.
    expect(renders(readFileSync(join(WEB, rel), 'utf8')).length).toBeGreaterThanOrEqual(2);
  });
});
