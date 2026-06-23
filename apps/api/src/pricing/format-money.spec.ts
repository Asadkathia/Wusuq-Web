import { formatMoney } from '@wusuq/shared';

describe('formatMoney', () => {
  it('formats USD with a $ prefix and cents by default', () => {
    expect(formatMoney(1234, 'USD')).toBe('$1,234.00');
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
  });
  it('formats PKR with a PKR prefix and whole rupees', () => {
    expect(formatMoney(1234, 'PKR')).toBe('PKR 1,234');
  });
  it('respects an explicit decimals override', () => {
    expect(formatMoney(1234, 'USD', { decimals: 0 })).toBe('$1,234');
  });
});
