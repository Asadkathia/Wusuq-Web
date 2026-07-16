import {
  buildInvoiceLines,
  summariseInvoice,
  formatInvoiceNo,
  type InvoiceTicketInput,
} from './invoice-lines';

const base: InvoiceTicketInput = {
  id: 't1',
  batchNo: '035210',
  currency: 'PKR',
  intakeFlow: 'judicial_case_files',
  formPayload: {
    case_title: 'Ali Ijaz vs Mrs Maryam Ali Ijaz',
    court_name: 'Family Court',
    city: 'Islamabad',
    judge_name: 'Amina Asif Butt',
  },
  serviceCost: 2500,
  additionalServiceCost: 0,
  printingCharges: 2450,
  attestedCharges: 0,
  nonAttestedCharges: 0,
  deliveryCharges: 0,
  additionalCharges: 0,
  discountPrice: 0,
  promoDiscount: 0,
  service: { name: 'Case Files Lower Court 2025' },
};

describe('formatInvoiceNo', () => {
  it('zero-pads to 6 digits', () => {
    expect(formatInvoiceNo(1)).toBe('000001');
    expect(formatInvoiceNo(348)).toBe('000348');
    expect(formatInvoiceNo(364692)).toBe('364692');
  });

  it('does not truncate past 6 digits', () => {
    expect(formatInvoiceNo(1234567)).toBe('1234567');
  });
});

describe('buildInvoiceLines', () => {
  it('numbers positions from 1', () => {
    const lines = buildInvoiceLines([base, { ...base, id: 't2', batchNo: '345579' }]);
    expect(lines.map((l) => l.position)).toEqual([1, 2]);
  });

  it('builds the template description block', () => {
    const [l] = buildInvoiceLines([base]);
    expect(l.description).toBe('Case Files Lower Court 2025');
    expect(l.courtLine).toBe('(Family Court - Islamabad)');
    expect(l.caseTitle).toBe('Ali Ijaz vs Mrs Maryam Ali Ijaz');
    expect(l.judge).toBe('Amina Asif Butt');
  });

  it('folds additionalServiceCost into the Service Cost column', () => {
    const [l] = buildInvoiceLines([{ ...base, additionalServiceCost: 500 }]);
    expect(l.serviceCost).toBe(3000);
  });

  it('sums lineTotal across the six money columns, excluding tax/discount', () => {
    const [l] = buildInvoiceLines([
      { ...base, attestedCharges: 1000, deliveryCharges: 1200, additionalCharges: 300, discountPrice: 9999 },
    ]);
    // 2500 service + 2450 printing + 1000 attested + 1200 delivery + 300 additional
    expect(l.lineTotal).toBe(7450);
  });

  it('omits the judge when absent (never renders empty parens)', () => {
    const [l] = buildInvoiceLines([{ ...base, formPayload: { case_title: 'X' } }]);
    expect(l.judge).toBeNull();
  });

  it('survives a legacy ticket with no formPayload', () => {
    const [l] = buildInvoiceLines([{ ...base, formPayload: null, service: null }]);
    expect(l.courtLine).toBeNull();
    expect(l.caseTitle).toBeNull();
    expect(l.description).toBe('Ticket 035210');
  });
});

describe('summariseInvoice', () => {
  const lines = buildInvoiceLines([base]);  // lineTotal 4950, service 2500

  it('sums subtotal from line totals', () => {
    expect(summariseInvoice(lines, { taxRate: 0, discountTotal: 0 }).subtotal).toBe(4950);
  });

  it('taxes the SERVICE base only, not the whole bill', () => {
    const s = summariseInvoice(lines, { taxRate: 0.17, discountTotal: 0 });
    expect(s.taxableBase).toBe(2500);          // service only, NOT 4950
    expect(s.taxAmount).toBe(425);             // 2500 * 0.17
    expect(s.grandTotal).toBe(5375);           // 4950 + 425
  });

  it('applies discount before tax and to the grand total', () => {
    const s = summariseInvoice(lines, { taxRate: 0.17, discountTotal: 500 });
    expect(s.taxableBase).toBe(2000);          // 2500 - 500
    expect(s.taxAmount).toBe(340);
    expect(s.grandTotal).toBe(4790);           // (4950 - 500) + 340
  });

  it('never goes negative on an over-large discount', () => {
    const s = summariseInvoice(lines, { taxRate: 0.17, discountTotal: 99999 });
    expect(s.taxableBase).toBe(0);
    expect(s.taxAmount).toBe(0);
    expect(s.grandTotal).toBe(0);
  });

  it('sums a 4-ticket invoice like the owner sample', () => {
    const many = buildInvoiceLines([
      { ...base, id: 'a', serviceCost: 10500, printingCharges: 24500, deliveryCharges: 4500, additionalCharges: 7000 },
      { ...base, id: 'b', serviceCost: 2500, printingCharges: 2450 },
      { ...base, id: 'c', serviceCost: 1500, printingCharges: 0 },
      { ...base, id: 'd', serviceCost: 2000, printingCharges: 0 },
    ]);
    expect(summariseInvoice(many, { taxRate: 0, discountTotal: 0 }).subtotal).toBe(54950);
  });
});
