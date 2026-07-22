import { Prisma } from '@prisma/client';
import { convertToPkr, formatStaffMoney } from '@wusuq/shared';

describe('convertToPkr', () => {
  it('multiplies by the rate', () => {
    expect(convertToPkr(35, 285)).toBe(9975);
  });

  it('accepts string/Decimal-ish inputs', () => {
    expect(convertToPkr('35', '285')).toBe(9975);
  });

  it('rounds to 2 decimals', () => {
    expect(convertToPkr(35, 277.7)).toBe(9719.5);
  });

  it('returns null when the rate is missing — never falls back to 1', () => {
    expect(convertToPkr(35, null)).toBeNull();
    expect(convertToPkr(35, undefined)).toBeNull();
  });

  it('treats a missing amount as 0, not null', () => {
    expect(convertToPkr(null, 285)).toBe(0);
  });

  // A guard narrowed to `rate == null` would still pass every test above while
  // letting a 0/negative/garbage rate produce a confidently wrong figure. These
  // pin the full absence check.
  it.each([
    ['empty string', ''],
    ['zero', 0],
    ['negative', -285],
    ['non-numeric', 'abc'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('returns null for a %s rate', (_label, rate) => {
    expect(convertToPkr(35, rate as never)).toBeNull();
  });

  it('coerces a real Prisma Decimal, not just a plain string', () => {
    // Prisma returns Decimal objects from the DB, never numbers. A refactor
    // that branched on `typeof rate === 'string'` would break every real call
    // site while the plain-string test above kept passing.
    expect(
      convertToPkr(new Prisma.Decimal('35'), new Prisma.Decimal('285')),
    ).toBe(9975);
  });
});

describe('formatStaffMoney', () => {
  it('passes PKR straight through', () => {
    expect(formatStaffMoney(500, 'PKR')).toBe('PKR 500');
  });

  it('ignores a stray rate on a PKR ticket', () => {
    expect(formatStaffMoney(500, 'PKR', 285)).toBe('PKR 500');
  });

  it('renders the PKR equivalent for a USD ticket', () => {
    expect(formatStaffMoney(35, 'USD', 285)).toBe('PKR 9,975');
  });

  it('marks a USD ticket with no rate instead of showing a wrong number', () => {
    expect(formatStaffMoney(35, 'USD', null)).toBe('$35.00 (rate not set)');
  });
});
