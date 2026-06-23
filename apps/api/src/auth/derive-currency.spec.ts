import { deriveCurrency } from '@wusuq/shared';

describe('deriveCurrency', () => {
  it('returns PKR for a +92 phone', () => {
    expect(deriveCurrency({ phone: '+923001234567' })).toBe('PKR');
  });
  it('treats a +92 phone with stray spaces as PKR', () => {
    expect(deriveCurrency({ phone: ' +92 300 1234567 ' })).toBe('PKR');
  });
  it('returns USD for a non-+92 phone', () => {
    expect(deriveCurrency({ phone: '+447911123456' })).toBe('USD');
  });
  it('treats locally-stored PK forms (no +) as PKR', () => {
    expect(deriveCurrency({ phone: '923001234567' })).toBe('PKR');
    expect(deriveCurrency({ phone: '0092 300 1234567' })).toBe('PKR');
    expect(deriveCurrency({ phone: '03001234567' })).toBe('PKR');
    expect(deriveCurrency({ phone: '3001234567' })).toBe('PKR');
  });
  it('falls back to country ISO when phone is absent', () => {
    expect(deriveCurrency({ country: 'PK' })).toBe('PKR');
    expect(deriveCurrency({ country: 'GB' })).toBe('USD');
  });
  it('prefers phone over country (phone dial code wins)', () => {
    expect(deriveCurrency({ phone: '+447911123456', country: 'PK' })).toBe(
      'USD',
    );
  });
  it('defaults to PKR when nothing is provided', () => {
    expect(deriveCurrency({})).toBe('PKR');
    expect(deriveCurrency({ phone: null, country: null })).toBe('PKR');
  });
});
