import {
  prefillOwnSubmittedCharge,
  resolveOwnSubmittedCharge,
} from './clerk-costs-prefill';

// Batch-9 Task 5, fix round 1 (§6.3): the representative's "Update ticket
// payments" dialog opened BLANK on reopen because it read the flat columns
// findAll withholds from representatives. These helpers prefer the
// representative's own frozen clerk*Charges snapshot, falling back to the
// flat column, with strict null-vs-zero handling (a genuine submitted 0
// must render as "0", never blank — the exact coercion bug the old
// `ticket.deliveryCharges ? String(...) : ''` line had).

describe('resolveOwnSubmittedCharge', () => {
  it('prefers the clerk snapshot when present, even when it is a genuine 0', () => {
    expect(resolveOwnSubmittedCharge(500, 0)).toBe(0);
    expect(resolveOwnSubmittedCharge('500', '0')).toBe(0);
  });

  it('falls back to the flat column when no clerk submission was recorded (snapshot is null)', () => {
    expect(resolveOwnSubmittedCharge(500, null)).toBe(500);
    expect(resolveOwnSubmittedCharge(500, undefined)).toBe(500);
  });

  it('a genuine flat 0 (no snapshot) resolves to 0, not null', () => {
    expect(resolveOwnSubmittedCharge(0, null)).toBe(0);
  });

  it('returns null when neither the snapshot nor the flat column has a value', () => {
    expect(resolveOwnSubmittedCharge(null, null)).toBeNull();
    expect(resolveOwnSubmittedCharge(undefined, undefined)).toBeNull();
  });

  it('does not produce NaN from junk input', () => {
    expect(resolveOwnSubmittedCharge('abc', 'xyz')).toBeNull();
    expect(resolveOwnSubmittedCharge('abc', 250)).toBe(250);
  });

  it('the clerk snapshot strictly wins over a different flat value (own submission, not the admin-edited figure)', () => {
    // A representative's own snapshot is 300; the flat (consumer-facing)
    // column has since been raised to 900 by an admin markup at finalize —
    // this dialog is about the representative's OWN prior submission, so it
    // must show 300, not the admin's 900.
    expect(resolveOwnSubmittedCharge(900, 300)).toBe(300);
  });
});

describe('prefillOwnSubmittedCharge', () => {
  it('renders a genuine submitted 0 as the string "0", never blank', () => {
    // THE BUG this fix round closes: the old inline
    // `ticket.deliveryCharges ? String(ticket.deliveryCharges) : ''` used a
    // falsy check, so a real 0 rendered as an empty input.
    expect(prefillOwnSubmittedCharge(500, 0)).toBe('0');
  });

  it('falls back to the flat column string when the snapshot is absent', () => {
    expect(prefillOwnSubmittedCharge(500, null)).toBe('500');
  });

  it('yields empty string (not "0") when there is nothing to prefill', () => {
    expect(prefillOwnSubmittedCharge(null, null)).toBe('');
    expect(prefillOwnSubmittedCharge(undefined, undefined)).toBe('');
  });

  it('does not produce the string "NaN" from junk', () => {
    expect(prefillOwnSubmittedCharge('abc', 'xyz')).toBe('');
  });
});
