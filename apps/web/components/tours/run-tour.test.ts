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

/**
 * driver.js 1.8 records the active step only when a highlight's animation
 * FINISHES, yet shows the popover halfway through, and its destroy routine
 * fires `onDestroyed` only when an active step is recorded. A tour closed
 * during the first ~400ms (Esc, the X, an unmount) therefore never fired
 * `onDestroyed`: nothing was persisted and the provider's "running" flag
 * stayed true for the rest of the session. The runner must end the tour on
 * `onDestroyStarted` (called on every close attempt, whatever the animation
 * state) and on its own destroy calls — never on `onDestroyed` alone.
 */
it('ends the tour from onDestroyStarted, not only from onDestroyed', () => {
  const src = readFileSync(join(here, 'run-tour.ts'), 'utf8');
  expect(src).toMatch(/onDestroyStarted:\s*\(\)\s*=>\s*\{?\s*finish\('dismissed'\)/);
  expect(src).toMatch(/onDoneClick:\s*\(\)\s*=>\s*\{?\s*finish\('completed'\)/);
});
