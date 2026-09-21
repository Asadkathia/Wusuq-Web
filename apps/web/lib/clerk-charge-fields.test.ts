import { chargeFieldVisibility, readSetType, visibleChargeFields } from './clerk-charge-fields';

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

describe('visibleChargeFields (batch-9 Task 1 — dynamic phase-2 rows)', () => {
  it('Case Files + non_attested shows exactly the non-attested pair and no photocopy', () => {
    // The client's confirmed red ✗: Case Files bills its pages through the
    // attested/non-attested counts, so photocopy is a redundant third counter.
    expect(visibleChargeFields('judicial_case_files', 'PKR', 'non_attested')).toEqual({
      attested: false,
      nonAttested: true,
      printing: false,
      delivery: true,
    });
  });

  it('Case Files + attested shows exactly the attested pair and no photocopy', () => {
    expect(visibleChargeFields('judicial_case_files', 'PKR', 'attested')).toEqual({
      attested: true,
      nonAttested: false,
      printing: false,
      delivery: true,
    });
  });

  it('Case Files + both shows both attestation pairs and still no photocopy', () => {
    expect(visibleChargeFields('judicial_case_files', 'PKR', 'both')).toEqual({
      attested: true,
      nonAttested: true,
      printing: false,
      delivery: true,
    });
  });

  it('Case Files + absent/unrecognised set type shows BOTH attestation pairs, never neither', () => {
    // A legacy ticket must never be stranded with no way to enter its charges.
    expect(visibleChargeFields('judicial_case_files', 'PKR', null)).toEqual({
      attested: true,
      nonAttested: true,
      printing: false,
      delivery: true,
    });
  });

  it('non_judicial_copy_of_fir shows the photocopy pair and neither attestation pair', () => {
    // No attestation leg at all, and no set_type is ever recorded for this flow.
    expect(visibleChargeFields('non_judicial_copy_of_fir', 'PKR', null)).toEqual({
      attested: false,
      nonAttested: false,
      printing: true,
      delivery: true,
    });
  });

  it('non_judicial_registry_deed and non_judicial_criminal_record_search match the FIR shape', () => {
    for (const flow of ['non_judicial_registry_deed', 'non_judicial_criminal_record_search']) {
      expect(visibleChargeFields(flow, 'PKR', null)).toEqual({
        attested: false,
        nonAttested: false,
        printing: true,
        delivery: true,
      });
    }
  });

  it('a digital flow (no charge capabilities) shows no phase-2 rows at all', () => {
    for (const flow of [
      'judicial_case_information',
      'judicial_case_search',
      'judicial_case_filing',
      'judicial_power_of_attorney',
    ]) {
      expect(visibleChargeFields(flow, 'PKR', 'both')).toEqual({
        attested: false,
        nonAttested: false,
        printing: false,
        delivery: false,
      });
    }
  });

  it('a USD ticket shows no phase-2 rows regardless of flow or set type', () => {
    // USD is an all-inclusive flat price — chargeCapabilitiesFor -> NO_CHARGES.
    expect(visibleChargeFields('judicial_case_files', 'USD', 'both')).toEqual({
      attested: false,
      nonAttested: false,
      printing: false,
      delivery: false,
    });
  });

  it('an unknown/absent flow shows no phase-2 rows', () => {
    expect(visibleChargeFields(undefined, 'PKR', 'both')).toEqual({
      attested: false,
      nonAttested: false,
      printing: false,
      delivery: false,
    });
    expect(visibleChargeFields(null, 'PKR', 'both')).toEqual({
      attested: false,
      nonAttested: false,
      printing: false,
      delivery: false,
    });
  });
});
