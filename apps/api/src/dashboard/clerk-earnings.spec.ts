import { computeClerkEarnings, PDF_CLERK_FEE } from '@wusuq/shared';

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
    expect(computeClerkEarnings({ clerkCost: null, defaultClerkCost: 700 })).toBe(700);
  });

  it('keeps an explicit clerkCost of 0 (does not fall back)', () => {
    expect(computeClerkEarnings({ clerkCost: 0, defaultClerkCost: 700, printingCharges: 50 })).toBe(50);
  });

  it('adds the PDF clerk fee when wantPdf', () => {
    expect(computeClerkEarnings({ clerkCost: 700, wantPdf: true })).toBe(700 + PDF_CLERK_FEE);
  });

  it('adds the PDF clerk fee when a pdfSurcharge was charged', () => {
    expect(computeClerkEarnings({ clerkCost: 700, pdfSurcharge: 300 })).toBe(800);
  });

  it('does NOT add the PDF fee without a PDF', () => {
    expect(computeClerkEarnings({ clerkCost: 700, pdfSurcharge: 0, wantPdf: false })).toBe(700);
  });

  it('coerces string/decimal-like inputs', () => {
    expect(computeClerkEarnings({ clerkCost: '700', attestedCharges: '100' })).toBe(800);
  });
});
