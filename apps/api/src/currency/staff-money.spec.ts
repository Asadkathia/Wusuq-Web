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
