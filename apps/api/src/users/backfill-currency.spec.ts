import {
  LEGACY_CURRENCY_CUTOFF,
  resolveTargetCurrency,
} from '../../scripts/backfill-user-currency';

const BEFORE = new Date('2026-01-01T00:00:00.000Z'); // legacy (pre-cutoff)
const AFTER = new Date('2026-07-01T00:00:00.000Z'); // post-cutoff

describe('resolveTargetCurrency (backfill helper)', () => {
  it('default run derives currency for INACTIVE accounts', () => {
    expect(
      resolveTargetCurrency({
        phone: '+447911123456',
        country: null,
        currentCurrency: 'PKR',
        active: false,
        createdAt: AFTER,
        rederiveLegacy: false,
      }),
    ).toBe('USD');
  });

  it('default run KEEPS an active account currency (lock once active)', () => {
    expect(
      resolveTargetCurrency({
        phone: '+447911123456', // would derive USD
        country: null,
        currentCurrency: 'PKR',
        active: true,
        createdAt: AFTER,
        rederiveLegacy: false,
      }),
    ).toBe('PKR');
  });

  it('default run does NOT touch legacy active accounts', () => {
    expect(
      resolveTargetCurrency({
        phone: '+447911123456',
        country: null,
        currentCurrency: 'PKR',
        active: true,
        createdAt: BEFORE,
        rederiveLegacy: false,
      }),
    ).toBe('PKR');
  });

  it('--rederive-legacy re-derives a LEGACY active account from its phone', () => {
    expect(
      resolveTargetCurrency({
        phone: '+447911123456',
        country: null,
        currentCurrency: 'PKR',
        active: true,
        createdAt: BEFORE,
        rederiveLegacy: true,
      }),
    ).toBe('USD');
  });

  it('--rederive-legacy leaves POST-cutoff active accounts locked', () => {
    expect(
      resolveTargetCurrency({
        phone: '+447911123456',
        country: null,
        currentCurrency: 'PKR',
        active: true,
        createdAt: AFTER,
        rederiveLegacy: true,
      }),
    ).toBe('PKR');
  });

  it('--rederive-legacy falls back to country when a legacy account has no phone', () => {
    expect(
      resolveTargetCurrency({
        phone: null,
        country: 'GB',
        currentCurrency: 'PKR',
        active: true,
        createdAt: BEFORE,
        rederiveLegacy: true,
      }),
    ).toBe('USD');
  });

  it('cutoff constant is the country-based-pricing launch date', () => {
    expect(LEGACY_CURRENCY_CUTOFF.toISOString()).toBe(
      '2026-06-23T00:00:00.000Z',
    );
  });
});
