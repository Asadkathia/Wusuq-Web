import { formatMoney } from '@wusuq/shared';

describe('formatMoney', () => {
  it('formats USD with a $ prefix', () => {
    expect(formatMoney(1234, 'USD')).toBe('$1,234');
  });
  it('formats PKR with a PKR prefix', () => {
    expect(formatMoney(1234, 'PKR')).toBe('PKR 1,234');
  });
  it('respects a decimals option', () => {
    expect(formatMoney(1234.5, 'USD', { decimals: 2 })).toBe('$1,234.50');
  });
});
