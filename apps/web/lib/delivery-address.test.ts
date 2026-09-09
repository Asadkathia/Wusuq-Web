import { isStructuredAddressComplete, parseDeliveryAddress } from './intake-flows';

/**
 * Batch-6 C: the TCS delivery city is the CONSUMER's, not the court's.
 *
 * The renderer used to pin "Delivering to" read-only to the case city and the
 * wizard re-stamped it at every save. The client's repro: an Islamabad High
 * Court ticket whose delivery address read "213 R-1 Johar Town Lahore" — a
 * Lahore street, addressed to Islamabad.
 *
 * Because the city is now typed by the consumer rather than force-filled, a
 * blank one is a genuinely incomplete address and must block submission.
 */
describe('isStructuredAddressComplete (batch-6 C)', () => {
  const full = {
    house: '213 R-1',
    block: 'Johar Town',
    mainArea: 'Near Emporium',
    city: 'Lahore',
  };

  it('accepts a fully filled address', () => {
    expect(isStructuredAddressComplete(JSON.stringify(full))).toBe(true);
  });

  it('rejects a missing city — TCS cannot deliver without one', () => {
    // This used to PASS: city was excluded from validation because the renderer
    // guaranteed a (wrong) value.
    expect(isStructuredAddressComplete(JSON.stringify({ ...full, city: '' }))).toBe(false);
    const { city: _omitted, ...noCity } = full;
    expect(isStructuredAddressComplete(JSON.stringify(noCity))).toBe(false);
  });

  it('rejects a whitespace-only city', () => {
    expect(isStructuredAddressComplete(JSON.stringify({ ...full, city: '   ' }))).toBe(false);
  });

  it('still rejects a missing street line', () => {
    expect(isStructuredAddressComplete(JSON.stringify({ ...full, house: '' }))).toBe(false);
  });

  it('NO LONGER requires block / mainArea (batch-7 1.3)', () => {
    // Those two inputs were removed: they duplicated the street line the
    // consumer's profile address already supplies, and requiring them forced
    // junk into every ticket — the client typed "12" / "12" purely to clear
    // the red "Please complete the delivery address", so every ticket
    // persisted `...Raiwand Road, Lahore, 12, 12, Lahore`. A deliverable
    // address is the street line plus the city.
    for (const k of ['block', 'mainArea'] as const) {
      expect(isStructuredAddressComplete(JSON.stringify({ ...full, [k]: '' }))).toBe(true);
    }
    expect(isStructuredAddressComplete(JSON.stringify({ house: '213 R-1 Johar Town', city: 'Lahore' }))).toBe(true);
  });

  it('round-trips a consumer city that differs from the court city', () => {
    // The whole point: court = Islamabad, delivery = Lahore, and nothing
    // overwrites it.
    const parsed = parseDeliveryAddress(JSON.stringify(full));
    expect(parsed.city).toBe('Lahore');
  });
});
