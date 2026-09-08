import { prefillPhase2Charge } from './finalize-charges';

describe('prefillPhase2Charge', () => {
  it('opens at the representative-submitted value when the final column is still 0', () => {
    // THE BUG (batch-7 2.7): the client's exact screenshot — Delivery Charges
    // showed 0 with "Clerk submitted: PKR 300" underneath, so approving
    // without touching the box paid min(300, 0) = 0 for delivery.
    expect(prefillPhase2Charge(0, 300)).toBe('300');
    expect(prefillPhase2Charge(null, 300)).toBe('300');
    expect(prefillPhase2Charge('0', '300')).toBe('300');
  });

  it('preserves an admin markup that is already higher', () => {
    // His follow-up: admin types 400 over a submitted 300 -> consumer billed
    // 400, representative still paid 300 by the cap. Reopening must not
    // clobber the 400 back down to 300.
    expect(prefillPhase2Charge(400, 300)).toBe('400');
  });

  it('is a no-op when the two already agree', () => {
    expect(prefillPhase2Charge(700, 700)).toBe('700');
  });

  it('treats an ABSENT snapshot as "no submission recorded", never as 0', () => {
    // Same invariant computeClerkEarningsBreakdown relies on: coercing null
    // to 0 would cap every payout at nothing.
    expect(prefillPhase2Charge(500, null)).toBe('500');
    expect(prefillPhase2Charge(500, undefined)).toBe('500');
    expect(prefillPhase2Charge(0, null)).toBe('');
  });

  it('honours a genuine representative-submitted zero', () => {
    expect(prefillPhase2Charge(0, 0)).toBe('');
  });

  it('yields empty string (not "0") when there is nothing to show, so the input reads blank', () => {
    expect(prefillPhase2Charge(null, null)).toBe('');
    expect(prefillPhase2Charge(undefined, undefined)).toBe('');
  });

  it('does not produce NaN from junk', () => {
    expect(prefillPhase2Charge('abc', 'xyz')).toBe('');
    expect(prefillPhase2Charge('abc', 250)).toBe('250');
  });
});
