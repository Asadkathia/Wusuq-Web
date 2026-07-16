import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { ATTRIBUTION, copyrightLine } from './shell-footer';

const currentDir = dirname(fileURLToPath(import.meta.url));

describe('attribution', () => {
  it('is the exact agreed string', () => {
    expect(ATTRIBUTION).toBe('Developed by @2026-Klarus AI');
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

  it.each(AUTH_PAGES)('%s shows the attribution', (rel) => {
    expect(readFileSync(join(WEB, rel), 'utf8')).toContain('ATTRIBUTION');
  });

  it.each(AUTH_PAGES)('%s shows it on mobile too, not only in the lg-only hero', (rel) => {
    const body = readFileSync(join(WEB, rel), 'utf8');
    // The hero is `hidden lg:flex`; the attribution must appear at least twice
    // (hero + mobile block) or mobile users never see it.
    const hits = body.match(/ATTRIBUTION/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
