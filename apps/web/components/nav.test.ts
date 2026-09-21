// Node-env unit test (see jest.config.js testEnvironment: 'node'). No jsdom /
// Testing Library in web tests, so this asserts on the nav.tsx SOURCE
// (the pattern about.test.ts established), not on rendered output.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navSource = readFileSync(join(here, 'nav.tsx'), 'utf8');

function extractFunctionBody(source: string, fnName: string): string {
  const start = source.indexOf(`function ${fnName}(`);
  if (start === -1) throw new Error(`function ${fnName} not found in nav.tsx`);
  // Mirrors about.test.ts's extraction: buildClerkItems is bounded by
  // readIsClerk immediately after it. Do not reorder those declarations.
  const nextFnMarkers = ['function buildClerkItems(', 'function readIsClerk('];
  let end = source.length;
  for (const marker of nextFnMarkers) {
    const idx = source.indexOf(marker, start + 1);
    if (idx !== -1 && idx < end) end = idx;
  }
  return source.slice(start, end);
}

// Batch-9 §8 — client's rep dashboard showed "Delivered 2" with nothing in
// the left nav: buildClerkItems had no Delivered entry at all (not as a nav
// item, not as a count), so a ticket that reaches DELIVERED — leaving
// COMPLETED, which "Ready to Dispatch" tracks — vanishes from the
// representative's navigation entirely.
describe('buildClerkItems (representative nav) — Delivered entry (§8)', () => {
  const clerkBody = extractFunctionBody(navSource, 'buildClerkItems');

  // Matched as ONE contiguous object literal — a bare toContain/toMatch on
  // each field separately would also be satisfied by the (pre-existing)
  // "Delivered Tickets" row buried in the collapsed "Paralegal Tickets"
  // children list, which is exactly the "not as a nav item" half of the bug
  // this guard exists to catch (verified: removing only the top-level item
  // while leaving that children-list row left this regex the only one of
  // the three that still failed).
  const topLevelDeliveredItem =
    /label:\s*'Delivered',\s*href:\s*'\/tickets\/delivered',\s*icon:\s*Truck,\s*count:\s*counts\['DELIVERED'\],/;

  it('renders a top-level Delivered nav item (icon, href, count)', () => {
    expect(clerkBody).toMatch(topLevelDeliveredItem);
  });
});
