import {
  computeClerkEarnings,
  computeClerkEarningsBreakdown,
  PDF_CLERK_FEE,
} from '@wusuq/shared';

describe('computeClerkEarnings', () => {
  it('sums base + phase-2 charges', () => {
    expect(
      computeClerkEarnings({
        clerkCost: 700,
        attestedCharges: 100,
        nonAttestedCharges: 0,
        printingCharges: 500,
        deliveryCharges: 300,
      }),
    ).toBe(1600);
  });

  it('falls back to defaultClerkCost when clerkCost is null', () => {
    expect(
      computeClerkEarnings({ clerkCost: null, defaultClerkCost: 700 }),
    ).toBe(700);
  });

  it('keeps an explicit clerkCost of 0 (does not fall back)', () => {
    expect(
      computeClerkEarnings({
        clerkCost: 0,
        defaultClerkCost: 700,
        printingCharges: 50,
      }),
    ).toBe(50);
  });

  it('adds the PDF clerk fee when wantPdf', () => {
    expect(computeClerkEarnings({ clerkCost: 700, wantPdf: true })).toBe(
      700 + PDF_CLERK_FEE,
    );
  });

  it('adds the PDF clerk fee when a pdfSurcharge was charged', () => {
    expect(computeClerkEarnings({ clerkCost: 700, pdfSurcharge: 300 })).toBe(
      800,
    );
  });

  it('does NOT add the PDF fee without a PDF', () => {
    expect(
      computeClerkEarnings({ clerkCost: 700, pdfSurcharge: 0, wantPdf: false }),
    ).toBe(700);
  });

  it('coerces string/decimal-like inputs', () => {
    expect(
      computeClerkEarnings({ clerkCost: '700', attestedCharges: '100' }),
    ).toBe(800);
  });
});

describe('computeClerkEarningsBreakdown — admin markup is capped out', () => {
  it('pays the clerk their submitted rate when the admin marks UP', () => {
    // The client's exact demonstrated case: clerk 50 pages @ 5 = 250,
    // admin re-rates to 10/page = 500. Clerk keeps 250.
    const b = computeClerkEarningsBreakdown({
      clerkCost: 400,
      nonAttestedCharges: 500,
      clerkNonAttestedCharges: 250,
      deliveryCharges: 200,
      clerkDeliveryCharges: 200,
    });
    expect(b.nonAttested).toBe(250);
    expect(b.total).toBe(850);
  });

  it('applies an admin correction DOWNWARD', () => {
    const b = computeClerkEarningsBreakdown({
      clerkCost: 400,
      nonAttestedCharges: 250,
      clerkNonAttestedCharges: 500,
    });
    expect(b.nonAttested).toBe(250);
    expect(b.total).toBe(650);
  });

  it('falls back to the final column when no clerk value was recorded', () => {
    const b = computeClerkEarningsBreakdown({
      clerkCost: 400,
      nonAttestedCharges: 500,
      clerkNonAttestedCharges: null,
    });
    expect(b.nonAttested).toBe(500);
    expect(b.total).toBe(900);
  });

  it('caps every line independently', () => {
    const b = computeClerkEarningsBreakdown({
      clerkCost: 100,
      attestedCharges: 900,
      clerkAttestedCharges: 300,
      nonAttestedCharges: 900,
      clerkNonAttestedCharges: 400,
      printingCharges: 900,
      clerkPrintingCharges: 500,
      deliveryCharges: 900,
      clerkDeliveryCharges: 600,
    });
    expect(b).toMatchObject({
      attested: 300,
      nonAttested: 400,
      printing: 500,
      delivery: 600,
    });
    expect(b.total).toBe(1900);
  });

  it('breakdown fields sum to total and match the wrapper', () => {
    const input = {
      clerkCost: 700,
      attestedCharges: 100,
      clerkAttestedCharges: 100,
      wantPdf: true,
    };
    const b = computeClerkEarningsBreakdown(input);
    expect(
      b.base + b.attested + b.nonAttested + b.printing + b.delivery + b.pdfFee,
    ).toBe(b.total);
    expect(b.pdfFee).toBe(100);
    expect(computeClerkEarnings(input)).toBe(b.total);
  });

  it('null clerk columns must not cap the payout to zero', () => {
    const b = computeClerkEarningsBreakdown({
      clerkCost: 400,
      nonAttestedCharges: 500,
      clerkNonAttestedCharges: null,
    });
    expect(b.total).toBe(900);
  });

  it('a clerk-submitted 0 caps to 0 and does not fall back to the marked-up final', () => {
    const b = computeClerkEarningsBreakdown({
      clerkCost: 400,
      nonAttestedCharges: 500,
      clerkNonAttestedCharges: 0,
    });
    expect(b.nonAttested).toBe(0);
    expect(b.total).toBe(400);
  });
});
