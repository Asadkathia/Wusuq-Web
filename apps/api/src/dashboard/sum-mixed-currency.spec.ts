import { sumMixedCurrencyToPkr } from '@wusuq/shared';

/**
 * Batch-8 item 6 — hoisted out of two private API copies so the web can reach
 * it. The contract every multi-ticket aggregate depends on: PKR passes
 * through, non-PKR converts at its OWN stamped rate, and a row with no usable
 * rate is EXCLUDED AND COUNTED rather than silently dropped or summed raw.
 */
describe('sumMixedCurrencyToPkr', () => {
  it('passes PKR rows straight through', () => {
    expect(
      sumMixedCurrencyToPkr([
        {
          totalAmount: 1100,
          amountPaid: 400,
          currency: 'PKR',
          fxRateToPkr: null,
        },
        {
          totalAmount: 900,
          amountPaid: 900,
          currency: 'PKR',
          fxRateToPkr: null,
        },
      ]),
    ).toEqual({
      totalAmountPkr: 2000,
      amountPaidPkr: 1300,
      unconvertedCount: 0,
    });
  });

  it('converts a non-PKR row at its own stamped rate', () => {
    // The live case: a $15 ticket stamped at 285 is PKR 4,275 staff-side.
    expect(
      sumMixedCurrencyToPkr([
        { totalAmount: 15, amountPaid: 15, currency: 'USD', fxRateToPkr: 285 },
      ]),
    ).toEqual({
      totalAmountPkr: 4275,
      amountPaidPkr: 4275,
      unconvertedCount: 0,
    });
  });

  it('treats a missing currency as PKR', () => {
    expect(
      sumMixedCurrencyToPkr([{ totalAmount: 50, amountPaid: 0 }])
        .totalAmountPkr,
    ).toBe(50);
  });

  // THE DEFECT THIS PREVENTS: summing a rate-less USD row raw would report a
  // $35 ticket as "35", understating a PKR total by ~285x and doing it
  // invisibly. Excluding it silently is only marginally better — the count is
  // what lets the UI say "N excluded — FX rate not set".
  it('EXCLUDES and COUNTS a non-PKR row with no usable rate', () => {
    for (const rate of [null, undefined, 0, -1, '' as const]) {
      expect(
        sumMixedCurrencyToPkr([
          {
            totalAmount: 1000,
            amountPaid: 0,
            currency: 'PKR',
            fxRateToPkr: null,
          },
          {
            totalAmount: 35,
            amountPaid: 35,
            currency: 'USD',
            fxRateToPkr: rate,
          },
        ]),
      ).toEqual({
        totalAmountPkr: 1000,
        amountPaidPkr: 0,
        unconvertedCount: 1,
      });
    }
  });

  it('accepts Decimal-like objects (Prisma columns) without importing Prisma', () => {
    const decimal = (v: string) => ({ toString: () => v });
    expect(
      sumMixedCurrencyToPkr([
        {
          totalAmount: decimal('15'),
          amountPaid: decimal('0'),
          currency: 'USD',
          fxRateToPkr: decimal('285'),
        },
      ]),
    ).toEqual({ totalAmountPkr: 4275, amountPaidPkr: 0, unconvertedCount: 0 });
  });

  it('rounds to 2dp rather than accumulating float drift', () => {
    const rows = Array.from({ length: 3 }, () => ({
      totalAmount: 0.1,
      amountPaid: 0.2,
      currency: 'PKR',
      fxRateToPkr: null,
    }));
    const out = sumMixedCurrencyToPkr(rows);
    expect(out.totalAmountPkr).toBe(0.3);
    expect(out.amountPaidPkr).toBe(0.6);
  });

  it('returns zeroes for an empty set', () => {
    expect(sumMixedCurrencyToPkr([])).toEqual({
      totalAmountPkr: 0,
      amountPaidPkr: 0,
      unconvertedCount: 0,
    });
  });
});
