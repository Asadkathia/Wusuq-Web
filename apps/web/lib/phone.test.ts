import {
  composeE164,
  normalizeLocalPhone,
  phoneMaxLength,
  phonePlaceholder,
  validateLocalPhone,
} from './phone';

describe('phonePlaceholder (batch-7 10.1)', () => {
  it('has NO trunk zero — the dial code is already on screen', () => {
    // "Remove the Zero": with +92 shown beside it, the old 03001234567
    // placeholder taught people to compose the invalid +9203001234567.
    expect(phonePlaceholder('PK')).toBe('3001234567');
    expect(phonePlaceholder('PK')).not.toMatch(/^0/);
  });
});

describe('normalizeLocalPhone', () => {
  it('drops separators and the habitual leading zero', () => {
    expect(normalizeLocalPhone('0300-123 4567')).toBe('3001234567');
    expect(normalizeLocalPhone('03001234567')).toBe('3001234567');
    expect(normalizeLocalPhone('3001234567')).toBe('3001234567');
  });
});

describe('composeE164', () => {
  it('never doubles the trunk zero into the dial code', () => {
    expect(composeE164('03001234567', '92')).toBe('+923001234567');
    expect(composeE164('3001234567', '+92')).toBe('+923001234567');
  });
});

describe('validateLocalPhone (batch-7 5.9)', () => {
  it('rejects the over-long number the Add-Rep form used to accept', () => {
    // The client pasted 3001234567889998 and it saved; the only feedback was
    // a submit-time error rendered under the JazzCash field.
    expect(validateLocalPhone('3001234567889998', 'PK', '92')).not.toBeNull();
  });

  it('rejects the too-SHORT numbers he found in the saved list', () => {
    // "it works in 9 digits too" — the list showed +9230012345.
    expect(validateLocalPhone('30012345', 'PK', '92')).not.toBeNull();
    expect(validateLocalPhone('300123456', 'PK', '92')).not.toBeNull();
  });

  it('accepts a correct PK mobile, with or without the habitual zero', () => {
    expect(validateLocalPhone('3001234567', 'PK', '92')).toBeNull();
    expect(validateLocalPhone('03001234567', 'PK', '92')).toBeNull();
  });

  it('requires a leading 3 for PK', () => {
    expect(validateLocalPhone('4001234567', 'PK', '92')).not.toBeNull();
  });

  it('allows 7-15 digits elsewhere', () => {
    expect(validateLocalPhone('501234567', 'AE', '971')).toBeNull();
    expect(validateLocalPhone('123456', 'AE', '971')).not.toBeNull();
  });

  it('enforces the COMPOSED length, which a local cap alone cannot', () => {
    // 15 local digits is fine on its own, but a 3-digit dial code composes to
    // +971<15> = 19 chars, past the server's @MaxLength(16).
    expect(validateLocalPhone('123456789012345', 'AE', '971')).not.toBeNull();
  });

  it('rejects an empty number', () => {
    expect(validateLocalPhone('', 'PK', '92')).not.toBeNull();
    expect(validateLocalPhone('   ', 'PK', '92')).not.toBeNull();
  });
});

describe('phoneMaxLength', () => {
  it('caps PK at the 10 local digits', () => {
    expect(phoneMaxLength('PK')).toBe(10);
    expect(phoneMaxLength('AE')).toBe(15);
  });
});
