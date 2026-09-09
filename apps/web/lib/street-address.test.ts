import {
  EMPTY_STREET_ADDRESS,
  formatStreetAddress,
  parseStreetAddress,
} from './street-address';

describe('parseStreetAddress (batch-7 1.4)', () => {
  it('NEVER guesses a split — a stored line stays whole (review finding 15)', () => {
    // "H 12, Johar Town, Lahore" is an ordinary address whose third part is
    // the CITY. Splitting on comma count would label it "Block / sector /
    // street", and the consumer would then "correct" it into a wrong value.
    // There is no marker telling a composed line from a typed one, so any
    // split is a guess.
    expect(parseStreetAddress('H 12, Johar Town, Lahore')).toEqual({
      house: 'H 12, Johar Town, Lahore', town: '', block: '',
    });
    expect(parseStreetAddress('H 12, Johar Town, Block R-1')).toEqual({
      house: 'H 12, Johar Town, Block R-1', town: '', block: '',
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

  it('composing then parsing keeps the full line (no round-trip split)', () => {
    const parts = { house: 'H 12', town: 'Johar Town', block: 'Block R-1' };
    const line = formatStreetAddress(parts);
    expect(line).toBe('H 12, Johar Town, Block R-1');
    // Deliberately NOT symmetric — see the parse test above.
    expect(parseStreetAddress(line)).toEqual({ house: line, town: '', block: '' });
  });

  it('is empty for empty parts', () => {
    expect(formatStreetAddress(EMPTY_STREET_ADDRESS)).toBe('');
  });
});
