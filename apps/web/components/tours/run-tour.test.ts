/**
 * Source-level guard for run-tour.ts's driver.js config. Not a behavioral
 * test (driver.js isn't importable/runnable in this node Jest env — see
 * resolve-steps.test.ts for the pure logic it wraps); this pins the literal
 * config key so a future edit can't silently drop it and leave highlighted
 * controls (Pay now/later, drafts delete, wallet top-up, sidebar links…)
 * clickable under the tour spotlight again (final-review finding I1).
 *
 * Mutation-tested: flipping the value to `false`, or deleting the line,
 * both fail this test (see final-fix-report.md for the recorded runs).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

it('driver.js is configured with disableActiveInteraction: true', () => {
  const src = readFileSync(join(here, 'run-tour.ts'), 'utf8');
  expect(src).toMatch(/disableActiveInteraction:\s*true/);
});
