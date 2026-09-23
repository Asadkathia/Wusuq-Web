import { TOUR_AUTO_OFF_ID, TOUR_META } from '@wusuq/shared';
import { isTourSeen, shouldAutoPlay, type AutoPlayInput } from './auto-play';

const v = TOUR_META['consumer.wallet'].version;
const base: AutoPlayInput = {
  tourId: 'consumer.wallet',
  appliesToRole: true,
  progress: [],
  sessionSeen: new Set(),
  impersonating: false,
  ready: true,
  tourRunning: false,
  dialogOpen: false,
  gettingStartedDone: true,
};

describe('isTourSeen', () => {
  it('is seen at the current version, not at an older one', () => {
    expect(isTourSeen('consumer.wallet', [{ tourId: 'consumer.wallet', version: v, status: 'DISMISSED' }])).toBe(true);
    expect(isTourSeen('consumer.wallet', [{ tourId: 'consumer.wallet', version: v - 1, status: 'COMPLETED' }])).toBe(false);
    expect(isTourSeen('consumer.wallet', [])).toBe(false);
  });
});

describe('shouldAutoPlay', () => {
  it('plays an unseen, applicable tour on a ready page', () => {
    expect(shouldAutoPlay(base)).toBe(true);
  });

  it.each<[string, Partial<AutoPlayInput>]>([
    ['progress failed to load (fail closed)', { progress: null }],
    ['role does not apply', { appliesToRole: false }],
    ['already seen at this version', { progress: [{ tourId: 'consumer.wallet', version: v, status: 'COMPLETED' }] }],
    ['already ended this session', { sessionSeen: new Set(['consumer.wallet']) }],
    ['auto-play turned off', { progress: [{ tourId: TOUR_AUTO_OFF_ID, version: 1, status: 'DISMISSED' }] }],
    ['impersonating', { impersonating: true }],
    ['page not ready', { ready: false }],
    ['another tour running', { tourRunning: true }],
    ['a dialog is open', { dialogOpen: true }],
    ['getting-started not done yet', { gettingStartedDone: false }],
  ])('does not play when %s', (_label, patch) => {
    expect(shouldAutoPlay({ ...base, ...patch })).toBe(false);
  });

  it('getting-started itself does not wait for getting-started', () => {
    expect(
      shouldAutoPlay({ ...base, tourId: 'consumer.getting-started', gettingStartedDone: false }),
    ).toBe(true);
  });

  it('replays after a version bump (older version row)', () => {
    expect(
      shouldAutoPlay({ ...base, progress: [{ tourId: 'consumer.wallet', version: v - 1, status: 'COMPLETED' }] }),
    ).toBe(true);
  });
});
