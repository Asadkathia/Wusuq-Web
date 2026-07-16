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
