/**
 * Source-level guards for tour-provider.tsx invariants that can't be
 * exercised without React Testing Library (this repo's web Jest runs in
 * plain node, no jsdom — see CLAUDE.md's "Web tests run as ESM" note). Each
 * guard matches the actual usage, not a bare identifier, and is
 * mutation-tested (see final-fix-report.md for the recorded runs).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'tour-provider.tsx'), 'utf8');

/** The requested-tour (chain/menu) timer block, isolated from the rest of the file. */
function requestedTourBlock(): string {
  const start = src.indexOf('if (requestedReady) {');
  const end = src.indexOf('const gettingStartedCandidate');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('requestedReady block markers not found — has tour-provider.tsx been restructured?');
  }
  return src.slice(start, end);
}

describe('I2 — requested (chained/menu) tours must still play while impersonating', () => {
  it('the requested-tour timer does not re-check isImpersonating()', () => {
    expect(requestedTourBlock()).not.toMatch(/isImpersonating/);
  });

  it('the requested-tour timer still re-checks isDialogOpen()', () => {
    expect(requestedTourBlock()).toMatch(/isDialogOpen\(\)/);
  });

  it('the bare auto-play candidate path (not a request) still gates on impersonation', () => {
    const candidateBlock = src.slice(src.indexOf('const gettingStartedCandidate'));
    expect(candidateBlock).toMatch(/impersonating/);
  });
});

describe('driver.js is destroyed on unmount', () => {
  it('the unmount cleanup destroys any live driver handle', () => {
    expect(src).toMatch(/driverHandleRef\.current\?\.destroy\(\)/);
  });

  it('the play() callback bails out once unmounted, before touching state or persisting', () => {
    const playStart = src.indexOf('const play = useCallback');
    const playEnd = src.indexOf('const gettingStartedCandidate');
    expect(playStart).toBeGreaterThan(-1);
    expect(playEnd).toBeGreaterThan(playStart);
    expect(src.slice(playStart, playEnd)).toMatch(/if \(!mountedRef\.current\) return;/);
  });
});

describe('manual replay abort feedback', () => {
  it('a manually-started tour shows a toast on an aborted outcome', () => {
    expect(src).toMatch(/outcome === 'aborted' && !opts\.silent/);
    expect(src).toMatch(/toast\.info\(ABORT_MESSAGE\)/);
  });

  it('the bare auto-play candidate is played silently (no abort toast)', () => {
    expect(src).toMatch(/play\(candidate, \{ silent: true \}\)/);
  });
});

describe('M6 — no auto-play while onboarding', () => {
  it('both auto-play candidates are gated on isOnboardingPath', () => {
    const candidateBlock = src.slice(src.indexOf('const onboarding ='), src.indexOf('const candidate = gettingStartedCandidate'));
    expect(candidateBlock).toMatch(/isOnboardingPath\(pathname\)/);
    const gettingStartedCandidateDecl = candidateBlock.slice(candidateBlock.indexOf('const gettingStartedCandidate'), candidateBlock.indexOf('const pageCandidateId'));
    const pageCandidateDecl = candidateBlock.slice(candidateBlock.indexOf('const pageCandidateId'));
    expect(gettingStartedCandidateDecl).toMatch(/!onboarding/);
    expect(pageCandidateDecl).toMatch(/!onboarding/);
  });
});
