import { buildChargePatchBody, readSetType, visibleChargeFields, type GatedChargeAmounts } from './clerk-charge-fields';

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

describe('buildChargePatchBody (batch-9 final review — merge blocker)', () => {
  // The admin Ticket Charges board (`ticket-charges-board.tsx`) used to
  // render and POST Delivery / Printing / Attested / Non-Attested
  // unconditionally, while `finance.updateCharge` (server-side,
  // `resolveGatedCharge`) force-zeroes Printing on every Case-Files ticket
  // and all four on every USD ticket. An admin who edited a gated field saw
  // "Charges updated." while the server silently discarded it. This suite
  // proves the board's own PATCH-body builder now agrees with the server's
  // gate through the single source `visibleChargeFields`.
  const ALL_SET: GatedChargeAmounts = {
    serviceCost: '1000',
    deliveryCharges: '300',
    printingCharges: '250',
    attestedCharges: '200',
    nonAttestedCharges: '150',
    additionalCharges: '50',
    additionalServiceCost: '75',
    discountPrice: '10',
  };

  it('a Case-Files PKR ticket omits Printing (gated false) but keeps Delivery/Attested/Non-Attested', () => {
    const body = buildChargePatchBody('judicial_case_files', 'PKR', ALL_SET);
    expect(body).not.toHaveProperty('printingCharges');
    expect(body.deliveryCharges).toBe(300);
    expect(body.attestedCharges).toBe(200);
    expect(body.nonAttestedCharges).toBe(150);
  });

  it('a USD ticket omits all four capability-gated charges regardless of flow', () => {
    const body = buildChargePatchBody('judicial_case_files', 'USD', ALL_SET);
    expect(body).not.toHaveProperty('deliveryCharges');
    expect(body).not.toHaveProperty('printingCharges');
    expect(body).not.toHaveProperty('attestedCharges');
    expect(body).not.toHaveProperty('nonAttestedCharges');
  });

  it('the four ungated fields are always sent, even when every capability-gated one is omitted', () => {
    const body = buildChargePatchBody('judicial_case_files', 'USD', ALL_SET);
    expect(body).toEqual({
      serviceCost: 1000,
      additionalCharges: 50,
      additionalServiceCost: 75,
      discountPrice: 10,
    });
  });

  it('a non-judicial copy flow (photocopy, no attestation leg) omits both attestation charges but keeps printing/delivery', () => {
    const body = buildChargePatchBody('non_judicial_copy_of_fir', 'PKR', ALL_SET);
    expect(body).not.toHaveProperty('attestedCharges');
    expect(body).not.toHaveProperty('nonAttestedCharges');
    expect(body.printingCharges).toBe(250);
    expect(body.deliveryCharges).toBe(300);
  });

  it('a digital PKR flow (no phase-2 charge capability at all) omits all four', () => {
    const body = buildChargePatchBody('judicial_case_information', 'PKR', ALL_SET);
    expect(body).not.toHaveProperty('deliveryCharges');
    expect(body).not.toHaveProperty('printingCharges');
    expect(body).not.toHaveProperty('attestedCharges');
    expect(body).not.toHaveProperty('nonAttestedCharges');
  });

  it('a legacy null-flow ticket also omits all four (accepted trade-off — see resolveGatedCharge docblock)', () => {
    const body = buildChargePatchBody(null, 'PKR', ALL_SET);
    expect(body).not.toHaveProperty('deliveryCharges');
    expect(body).not.toHaveProperty('printingCharges');
    expect(body).not.toHaveProperty('attestedCharges');
    expect(body).not.toHaveProperty('nonAttestedCharges');
  });
});
