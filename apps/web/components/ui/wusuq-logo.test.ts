import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(currentDir, 'wusuq-logo.tsx'), 'utf8');

describe('WusuqLogo', () => {
  it('uses next/image rather than a raw <img>', () => {
    expect(src).toContain("from 'next/image'");
    expect(src).not.toMatch(/<img\s/);
  });

  it('references the generated brand assets', () => {
    expect(src).toContain('/brand/wusuq-mark.png');
    expect(src).toContain('/brand/wusuq-mark-white.png');
    expect(src).toContain('/brand/wusuq-full.png');
  });

  it('hardcodes no @2x path — next/image downscales one high-res source', () => {
    expect(src).not.toContain('@2x');
  });

  it('exports the WusuqLogo component', () => {
    expect(src).toMatch(/export function WusuqLogo/);
  });
});

describe('no hand-rolled W tiles remain', () => {
  const SITES = [
    './shell-nav.tsx',
    '../../app/staff-portal/page.tsx',
    '../../app/(auth)/consumer/login/page.tsx',
    '../../app/(auth)/consumer/signup/page.tsx',
    '../../app/elections/page.tsx',
  ];

  it.each(SITES)('%s renders WusuqLogo, not a letter-W div', (rel) => {
    const body = readFileSync(join(currentDir, rel), 'utf8');
    expect(body).toContain('WusuqLogo');
    // The old tiles were a <div className="...">\n  W\n</div>
    expect(body).not.toMatch(/>\s*\n\s*W\s*\n\s*</);
  });
});

describe('tone/surface pairing — the art is purple-on-transparent', () => {
  // A regression here (default `tone="brand"` used on a dark surface) renders
  // a near-invisible purple-on-dark-purple/near-black mark. Assert the JSX
  // usage directly (`<WusuqLogo ... tone="white"`), not just that the string
  // "tone" appears somewhere in the file.
  const DARK_SURFACE_SITES = [
    ['../../app/staff-portal/page.tsx', 'ink-900 hero'],
    ['../../app/(auth)/consumer/login/page.tsx', 'brand-500 hero'],
    ['../../app/(auth)/consumer/signup/page.tsx', 'brand-500 hero'],
  ] as const;

  it.each(DARK_SURFACE_SITES)('%s (%s) renders WusuqLogo with tone="white"', (rel) => {
    const body = readFileSync(join(currentDir, rel), 'utf8');
    expect(body).toMatch(/<WusuqLogo[^>]*tone="white"/);
  });
});
