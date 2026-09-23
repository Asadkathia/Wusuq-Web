import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOUR_IDS } from '@wusuq/shared';
import { TOUR_DEFINITIONS } from './registry';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..', '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.next') return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

const source = [...tsxFiles(join(webRoot, 'components')), ...tsxFiles(join(webRoot, 'app'))]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/** Match the JSX attribute, never the bare id (an import or comment must not satisfy it). */
function renderedAsAttribute(target: string): boolean {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`data-tour=["'{\`]{1,2}${escaped}["'\`}]`).test(source);
}

describe('tour registry integrity', () => {
  it('has content keyed by its own id for every shared tour id', () => {
    for (const id of TOUR_IDS) expect(TOUR_DEFINITIONS[id].id).toBe(id);
  });

  it('every step target and mobileTarget is rendered as a data-tour attribute', () => {
    const missing: string[] = [];
    for (const id of TOUR_IDS) {
      for (const step of TOUR_DEFINITIONS[id].steps) {
        for (const t of [step.target, step.mobileTarget]) {
          if (t && !renderedAsAttribute(t)) missing.push(`${id} → ${t}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every chain points at a registered tour with a page', () => {
    for (const id of TOUR_IDS) {
      const next = TOUR_DEFINITIONS[id].next;
      if (next) expect(next.href.startsWith('/')).toBe(true);
    }
  });
});
