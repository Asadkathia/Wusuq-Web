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
  // Realistic wizard payload shape (apps/web/components/intake-wizard.tsx):
  // select_court + select_court_city, NOT the fabricated court_name/service_city
  // keys the pre-fix code read.
  formPayload: {
    case_title: 'Ali Ijaz vs Mrs Maryam Ali Ijaz',
    select_court: 'Family Court',
    select_court_city: 'Islamabad',
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

  it('builds the template description block from the real wizard payload shape', () => {
    const [l] = buildInvoiceLines([base]);
    expect(l.description).toBe('Case Files Lower Court 2025');
    expect(l.courtLine).toBe('(Family Court - Islamabad)');
    expect(l.caseTitle).toBe('Ali Ijaz vs Mrs Maryam Ali Ijaz');
    expect(l.judge).toBe('Amina Asif Butt');
  });

  it('falls back to the generic city key when select_court_city is absent', () => {
    const [l] = buildInvoiceLines([
      { ...base, formPayload: { select_court: 'Family Court', city: 'Lahore' } },
    ]);
    expect(l.courtLine).toBe('(Family Court - Lahore)');
  });

  it('prefers select_court_city over a plain city key when both are present', () => {
    const [l] = buildInvoiceLines([
      {
        ...base,
        formPayload: { select_court: 'Family Court', select_court_city: 'Islamabad', city: 'Lahore' },
      },
    ]);
    expect(l.courtLine).toBe('(Family Court - Islamabad)');
  });

  it('resolves caseTitle through the shared case_title aliases (title, title_party_a)', () => {
    const withTitle = buildInvoiceLines([{ ...base, formPayload: { title: 'Aliased Title' } }]);
    expect(withTitle[0].caseTitle).toBe('Aliased Title');

    const withTitleParty = buildInvoiceLines([
      { ...base, formPayload: { title_party_a: 'Aliased Party Title' } },
    ]);
    expect(withTitleParty[0].caseTitle).toBe('Aliased Party Title');
  });

  it('does not read the fabricated court_name/service_city/caseTitle/judge keys', () => {
    const [l] = buildInvoiceLines([
      {
        ...base,
        formPayload: {
          court_name: 'Fabricated Court',
          service_city: 'Fabricated City',
          caseTitle: 'Fabricated Case Title',
          judge: 'Fabricated Judge',
        },
      },
    ]);
    expect(l.courtLine).toBeNull();
    expect(l.caseTitle).toBeNull();
    expect(l.judge).toBeNull();
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

  it('resolves the judge from a structured `bench` payload (High/Supreme/Shariat/FCC shape)', () => {
    const [l] = buildInvoiceLines([
      {
        ...base,
        formPayload: {
          case_title: 'X',
          select_court_type: 'High Court',
          bench: JSON.stringify({ benchType: 'single_judge', judges: ['Amina Asif Butt'] }),
        },
      },
    ]);
    expect(l.judge).toBe('Amina Asif Butt');
  });

  it('still resolves the judge from the flat `judge_name` field (Lower/Special Court shape)', () => {
    const [l] = buildInvoiceLines([
      { ...base, formPayload: { case_title: 'X', judge_name: 'Justice Tariq Mehmood' } },
    ]);
    expect(l.judge).toBe('Justice Tariq Mehmood');
  });

  it('joins a multi-judge bench with a comma (matches the case card\'s rendering)', () => {
    const [l] = buildInvoiceLines([
      {
        ...base,
        formPayload: {
          case_title: 'X',
          bench: JSON.stringify({
            benchType: 'db_2',
            judges: ['Justice A. Rehman', 'Justice B. Khan'],
          }),
        },
      },
    ]);
    expect(l.judge).toBe('Justice A. Rehman, Justice B. Khan');
  });

  it('prefers a non-empty bench over a stale flat judge_name (bench is authoritative for its tier)', () => {
    const [l] = buildInvoiceLines([
      {
        ...base,
        formPayload: {
          case_title: 'X',
          judge_name: 'Stale Flat Judge',
          bench: JSON.stringify({ benchType: 'single_judge', judges: ['Fresh Bench Judge'] }),
        },
      },
    ]);
    expect(l.judge).toBe('Fresh Bench Judge');
  });

  it('falls back to flat judge_name when the bench has no non-empty judges', () => {
    const [l] = buildInvoiceLines([
      {
        ...base,
        formPayload: {
          case_title: 'X',
          judge_name: 'Fallback Judge',
          bench: JSON.stringify({ benchType: 'single_judge', judges: ['', '   '] }),
        },
      },
    ]);
    expect(l.judge).toBe('Fallback Judge');
  });

  it('returns null when a malformed/unparseable `bench` value is present with no flat judge_name', () => {
    const cases: unknown[] = [
      'not json {{{',
      42,
      { judges: 'not-an-array' },
      ['array', 'not', 'object'],
      null,
    ];
    for (const bench of cases) {
      const [l] = buildInvoiceLines([{ ...base, formPayload: { case_title: 'X', bench } }]);
      expect(l.judge).toBeNull();
    }
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
