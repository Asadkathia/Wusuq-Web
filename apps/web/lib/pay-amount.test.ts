import { payableInPkr, submitAmountFromPkr } from './pay-amount';

describe('payableInPkr', () => {
  it('converts a USD ticket due amount to PKR using the stamped rate', () => {
    expect(payableInPkr(35, 'USD', 285)).toBe(9975);
  });

  it('passes a PKR ticket amount through unconverted', () => {
    expect(payableInPkr(9975, 'PKR', null)).toBe(9975);
    expect(payableInPkr(9975, 'PKR', 285)).toBe(9975); // rate irrelevant for PKR
  });

  it('returns null for a USD ticket with no stamped rate (no prefill)', () => {
    expect(payableInPkr(35, 'USD', null)).toBeNull();
    expect(payableInPkr(35, 'USD', undefined)).toBeNull();
  });

  it('returns null for a USD ticket with a non-positive or non-finite rate', () => {
    expect(payableInPkr(35, 'USD', 0)).toBeNull();
    expect(payableInPkr(35, 'USD', -5)).toBeNull();
    expect(payableInPkr(35, 'USD', NaN)).toBeNull();
  });
});

describe('submitAmountFromPkr (inverse conversion)', () => {
  it('converts a PKR-entered amount back to the native USD amount', () => {
    expect(submitAmountFromPkr(9975, 'USD', 285)).toBe(35);
  });

  it('passes a PKR ticket amount through unconverted', () => {
    expect(submitAmountFromPkr(9975, 'PKR', null)).toBe(9975);
    expect(submitAmountFromPkr(9975, 'PKR', 285)).toBe(9975); // rate irrelevant for PKR
  });

  it('returns null when the rate is missing, never the raw PKR figure', () => {
    expect(submitAmountFromPkr(9975, 'USD', null)).toBeNull();
    expect(submitAmountFromPkr(9975, 'USD', undefined)).toBeNull();
  });

  it('returns null when the rate is non-positive or non-finite', () => {
    expect(submitAmountFromPkr(9975, 'USD', 0)).toBeNull();
    expect(submitAmountFromPkr(9975, 'USD', -1)).toBeNull();
    expect(submitAmountFromPkr(9975, 'USD', NaN)).toBeNull();
  });
});

describe('round trip: PKR -> native -> PKR', () => {
  it('returns the original figure for a clean rate (285)', () => {
    const dueUsd = 35;
    const rate = 285;
    const pkr = payableInPkr(dueUsd, 'USD', rate);
    expect(pkr).toBe(9975);
    const native = submitAmountFromPkr(pkr as number, 'USD', rate);
    expect(native).toBe(dueUsd);
    const pkrAgain = payableInPkr(native as number, 'USD', rate);
    expect(pkrAgain).toBe(pkr);
  });

  it('returns the original figure for a non-round rate (277.7)', () => {
    const dueUsd = 35;
    const rate = 277.7;
    const pkr = payableInPkr(dueUsd, 'USD', rate);
    const native = submitAmountFromPkr(pkr as number, 'USD', rate);
    expect(native).toBe(dueUsd);
    const pkrAgain = payableInPkr(native as number, 'USD', rate);
    expect(pkrAgain).toBe(pkr);
  });

  it('holds for a range of realistic amounts and rates', () => {
    const rates = [285, 277.7, 300.25, 250];
    const amounts = [1, 12.5, 100, 999.99, 5000];
    for (const rate of rates) {
      for (const dueUsd of amounts) {
        const pkr = payableInPkr(dueUsd, 'USD', rate) as number;
        const native = submitAmountFromPkr(pkr, 'USD', rate) as number;
        // Allow a single cent of float-rounding slack over two conversions.
        expect(Math.abs(native - dueUsd)).toBeLessThanOrEqual(0.01);
      }
    }
  });
});
