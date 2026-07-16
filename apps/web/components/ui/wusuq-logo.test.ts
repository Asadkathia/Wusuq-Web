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

  it('references the generated brand assets by their @1x path', () => {
    expect(src).toContain('/brand/wusuq-mark.png');
    expect(src).toContain('/brand/wusuq-mark-white.png');
    expect(src).toContain('/brand/wusuq-full.png');
  });

  it('never hardcodes the @2x paths (next/image derives srcSet)', () => {
    expect(src).not.toContain('@2x');
  });

  it('exports the WusuqLogo component', () => {
    expect(src).toMatch(/export function WusuqLogo/);
  });
});
