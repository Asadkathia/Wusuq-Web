/**
 * Batch-5 A: Wusuq's margin is a subtraction ACROSS currencies.
 *
 * The consumer total is in the ticket's own currency; clerk pay is ALWAYS PKR
 * (payouts are domestic regardless of what the consumer was billed). The old
 * computeWusuqMargin(total, clerkEarnings) subtracted them raw, so every USD
 * ticket rendered a NEGATIVE margin — the client's ticket TKT-62581265-543774
 * showed "Wusuq earnings PKR -2,325" when the real profit was PKR 11,875.
 */
import { computeWusuqMargin, computeWusuqMarginPkr } from '@wusuq/shared';

describe('computeWusuqMarginPkr', () => {
  // The client's ticket: $50 USD billed, rate 285, clerk paid PKR 2,375.
  const USD_TOTAL = 50;
  const RATE = 285;
  const CLERK_PKR = 2375;

  it("reproduces the client's case: 50 USD @285 minus PKR 2,375 clerk = PKR 11,875", () => {
    expect(computeWusuqMarginPkr(USD_TOTAL, 'USD', RATE, CLERK_PKR)).toBe(
      11875,
    );
  });

  it('the old same-currency helper is what produced the negative figure', () => {
    // Documents the defect: raw subtraction of PKR clerk pay from a USD total.
    expect(computeWusuqMargin(USD_TOTAL, CLERK_PKR)).toBe(-2325);
  });

  it('passes PKR tickets straight through (no conversion)', () => {
    expect(computeWusuqMarginPkr(14250, 'PKR', null, CLERK_PKR)).toBe(11875);
  });

  it('ignores a stray rate on a PKR ticket', () => {
    expect(computeWusuqMarginPkr(14250, 'PKR', 285, CLERK_PKR)).toBe(11875);
  });

  it('returns null for a USD ticket with no usable rate — never an unconverted number', () => {
    for (const bad of [null, undefined, '', 0, -285, Number.NaN]) {
      expect(
        computeWusuqMarginPkr(USD_TOTAL, 'USD', bad as never, CLERK_PKR),
      ).toBeNull();
    }
  });

  it('can still be legitimately negative when the clerk genuinely costs more', () => {
    // A real loss must survive — only the CURRENCY bug is being fixed here.
    expect(computeWusuqMarginPkr(1000, 'PKR', null, 1500)).toBe(-500);
  });

  it('handles string/Decimal-ish totals from Prisma', () => {
    expect(computeWusuqMarginPkr('50', 'USD', '285', CLERK_PKR)).toBe(11875);
  });
});
