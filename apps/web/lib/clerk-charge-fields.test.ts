import { chargeFieldVisibility, readSetType } from './clerk-charge-fields';

describe('readSetType', () => {
  it('reads the three real values and rejects anything else', () => {
    expect(readSetType({ set_type: 'attested' })).toBe('attested');
    expect(readSetType({ set_type: 'non_attested' })).toBe('non_attested');
    expect(readSetType({ set_type: 'both' })).toBe('both');
    for (const junk of [{}, null, undefined, { set_type: '' }, { set_type: 'nope' }]) {
      expect(readSetType(junk as never)).toBeNull();
    }
  });
});

describe('chargeFieldVisibility (batch-7 5.1)', () => {
  it('hides the ATTESTED pair when only non-attested was ordered', () => {
    // The client's exact case: "he has asked for a non-attested file, so it is
    // not necessary to have these two options."
    expect(chargeFieldVisibility({ set_type: 'non_attested' }, true)).toEqual({
      attested: false, nonAttested: true,
    });
  });

  it('hides the NON-ATTESTED pair when only attested was ordered', () => {
    expect(chargeFieldVisibility({ set_type: 'attested' }, true)).toEqual({
      attested: true, nonAttested: false,
    });
  });

  it('shows both when both were ordered', () => {
    expect(chargeFieldVisibility({ set_type: 'both' }, true)).toEqual({
      attested: true, nonAttested: true,
    });
  });

  it('shows BOTH when no set type was recorded — never hide a chargeable line by default', () => {
    // Legacy tickets and flows that never ask. Hiding on absence could
    // silently lose a charge the representative needs to enter.
    expect(chargeFieldVisibility({}, true)).toEqual({ attested: true, nonAttested: true });
    expect(chargeFieldVisibility(null, true)).toEqual({ attested: true, nonAttested: true });
  });

  it('hides both when the flow has no attestation leg at all', () => {
    expect(chargeFieldVisibility({ set_type: 'both' }, false)).toEqual({
      attested: false, nonAttested: false,
    });
  });
});
