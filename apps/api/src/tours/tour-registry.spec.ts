import {
  TOUR_AUTO_OFF_ID,
  TOUR_IDS,
  TOUR_META,
  expectedTourVersion,
  isKnownTourId,
  tourAppliesToRole,
} from '@wusuq/shared';

describe('shared tour registry', () => {
  it('has metadata with a positive integer version for every id', () => {
    for (const id of TOUR_IDS) {
      expect(Number.isInteger(TOUR_META[id].version)).toBe(true);
      expect(TOUR_META[id].version).toBeGreaterThanOrEqual(1);
    }
  });

  it('accepts registry ids and the auto-off id, rejects anything else', () => {
    expect(isKnownTourId('consumer.wallet')).toBe(true);
    expect(isKnownTourId(TOUR_AUTO_OFF_ID)).toBe(true);
    expect(isKnownTourId('consumer.nope')).toBe(false);
    expect(isKnownTourId('')).toBe(false);
  });

  it('reports the expected version (auto-off is always 1, unknown is null)', () => {
    expect(expectedTourVersion('consumer.wallet')).toBe(
      TOUR_META['consumer.wallet'].version,
    );
    expect(expectedTourVersion(TOUR_AUTO_OFF_ID)).toBe(1);
    expect(expectedTourVersion('nope')).toBeNull();
  });

  it('scopes consumer tours to consumer-class roles only', () => {
    expect(tourAppliesToRole('consumer.wallet', 'consumer')).toBe(true);
    expect(tourAppliesToRole('consumer.wallet', 'lawyer')).toBe(true);
    expect(tourAppliesToRole('consumer.wallet', 'company')).toBe(true);
    expect(tourAppliesToRole('consumer.wallet', 'super-admin')).toBe(false);
    expect(tourAppliesToRole('consumer.wallet', 'representative')).toBe(false);
    expect(tourAppliesToRole('consumer.wallet', undefined)).toBe(false);
  });
});
