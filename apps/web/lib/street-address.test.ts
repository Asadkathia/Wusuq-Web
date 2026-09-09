import {
  EMPTY_STREET_ADDRESS,
  formatStreetAddress,
  parseStreetAddress,
} from './street-address';

describe('parseStreetAddress (batch-7 1.4)', () => {
  it('splits the three parts we write', () => {
    expect(parseStreetAddress('H 12, Johar Town, Block R-1')).toEqual({
      house: 'H 12', town: 'Johar Town', block: 'Block R-1',
    });
  });

  it('keeps a legacy free-text address whole, in `house`', () => {
    // The client's own stored address. Splitting it into the wrong boxes
    // would be worse than leaving it as one line — same rule
    // parseDeliveryAddress follows for legacy wizard values.
    const legacy = 'House 2121, Lake City Block k, Raiwand Road, Lahore';
    expect(parseStreetAddress(legacy)).toEqual({ house: legacy, town: '', block: '' });
  });

  it('does not re-interpret a 2-part address', () => {
    expect(parseStreetAddress('H 12, Lahore')).toEqual({ house: 'H 12, Lahore', town: '', block: '' });
  });

  it('does not treat an empty middle part as structured', () => {
    expect(parseStreetAddress('H 12, , Block R')).toEqual({ house: 'H 12, , Block R', town: '', block: '' });
  });

  it('returns empty parts for blank input', () => {
    for (const blank of ['', '   ', null, undefined]) {
      expect(parseStreetAddress(blank)).toEqual(EMPTY_STREET_ADDRESS);
    }
  });
});

describe('formatStreetAddress', () => {
  it('joins the parts into one line', () => {
    expect(formatStreetAddress({ house: 'H 12', town: 'Johar Town', block: 'Block R-1' }))
      .toBe('H 12, Johar Town, Block R-1');
  });

  it('drops blanks rather than leaving dangling commas', () => {
    expect(formatStreetAddress({ house: 'H 12', town: '', block: '' })).toBe('H 12');
    expect(formatStreetAddress({ house: 'H 12', town: '', block: 'Block R' })).toBe('H 12, Block R');
  });

  it('round-trips a structured address', () => {
    const parts = { house: 'H 12', town: 'Johar Town', block: 'Block R-1' };
    expect(parseStreetAddress(formatStreetAddress(parts))).toEqual(parts);
  });

  it('is empty for empty parts', () => {
    expect(formatStreetAddress(EMPTY_STREET_ADDRESS)).toBe('');
  });
});
