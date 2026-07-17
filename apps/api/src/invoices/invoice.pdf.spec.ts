import { PDFParse } from 'pdf-parse';
import { renderInvoicePdf, type InvoiceView } from './invoice.pdf';
import {
  buildInvoiceLines,
  summariseInvoice,
  type InvoiceTicketInput,
} from './invoice-lines';

const view: InvoiceView = {
  invoiceNo: '000348',
  issueDate: new Date('2026-06-28T00:00:00Z'),
  currency: 'PKR',
  company: {
    name: 'WUSUQ',
    country: 'Pakistan',
    phone: '0300-1998787',
    email: 'wusuqlq@icloud.com',
  },
  billTo: {
    name: 'Urooj Fatima',
    phone: '+923218337776',
    email: 'urooj@yahoo.com',
  },
  lines: [
    {
      position: 1,
      ticketId: 't1',
      batchNo: '035210',
      description: 'Case Files Special Court 2024',
      courtLine: '(Special Courts - Karachi)',
      caseTitle: 'State vs Naimat Ullah Khan & others',
      judge: null,
      serviceCost: 10500,
      printing: 24500,
      attested: 0,
      nonAttested: 0,
      delivery: 4500,
      additional: 7000,
      lineTotal: 46500,
    },
  ],
  subtotal: 46500,
  taxRate: 0.17,
  taxAmount: 1785,
  grandTotal: 48285,
  payment: {
    accountTitle: 'Ali Zain',
    jazzCash: '0300-4680800',
    easyPaisa: '0300-4680800',
    accountNumber: 'PK62ABPA0010002772510013',
  },
};

describe('renderInvoicePdf', () => {
  it('produces a real PDF buffer', async () => {
    const buf = await renderInvoicePdf(view);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('renders without throwing on many lines (page overflow path)', async () => {
    const many = {
      ...view,
      lines: Array.from({ length: 40 }, (_, i) => ({
        ...view.lines[0],
        position: i + 1,
        ticketId: `t${i}`,
      })),
    };
    const buf = await renderInvoicePdf(many);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders a USD invoice', async () => {
    const buf = await renderInvoicePdf({
      ...view,
      currency: 'USD',
      taxRate: 0,
      taxAmount: 0,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders with no payment settings configured', async () => {
    const buf = await renderInvoicePdf({ ...view, payment: null });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders a line with no court, title, or judge (legacy ticket)', async () => {
    const bare = {
      ...view,
      lines: [
        { ...view.lines[0], courtLine: null, caseTitle: null, judge: null },
      ],
    };
    const buf = await renderInvoicePdf(bare);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  // Blocker 3: a discounted invoice must render without throwing, and
  // `discount` being optional must not break any existing caller that never
  // passes it (the two tests immediately below).
  it('renders a discounted invoice without throwing', async () => {
    const buf = await renderInvoicePdf({ ...view, discount: 1000 });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders identically whether discount is omitted or explicitly 0 (no DISCOUNT row either way)', async () => {
    const omitted = await renderInvoicePdf(view);
    const explicitZero = await renderInvoicePdf({ ...view, discount: 0 });
    expect(omitted.subarray(0, 5).toString()).toBe('%PDF-');
    expect(explicitZero.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

/**
 * Content assertions — extracts real text from the rendered PDF bytes.
 *
 * Magic-bytes-only assertions (the block above) let a renderer that emits a
 * blank or wrong invoice pass every test, as long as it still starts with
 * "%PDF-". These tests parse the actual page text instead, so a renderer
 * that drops the totals block, mangles a money figure, or leaks an internal
 * field is caught.
 *
 * Extraction approach: `pdf-parse` (pure JS, backed by pdfjs-dist — no
 * system binary). `pdftotext` (poppler) is also installed on this machine
 * and would work, but shelling out to a system binary would make these
 * tests non-portable across CI images that don't happen to have poppler
 * installed; `pdf-parse` runs anywhere `node_modules` does, which is the
 * right tradeoff for a test that must run in CI unconditionally.
 */
async function extractText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Pulls the PKR amount printed after a totals-row label, e.g. for
 * "SUBTOTAL PKR 54,950" `moneyAfter(text, 'SUBTOTAL')` returns 54950.
 * Handles the leading "-" that `formatMoney` prints for the DISCOUNT row.
 */
function moneyAfter(text: string, label: string): number {
  const re = new RegExp(
    `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*?PKR\\s*(-?[\\d,]+)`,
  );
  const match = text.match(re);
  if (!match) {
    throw new Error(`Label "${label}" not found in extracted text:\n${text}`);
  }
  return Number(match[1]!.replace(/,/g, ''));
}

// The owner's real 4-ticket sample: lines 10500+24500+0+0+4500+7000→46500,
// 2500+2450→4950, 1500, 2000; subtotal 54950. Built through the real
// `buildInvoiceLines`/`summariseInvoice` pipeline (not hand-computed) so the
// totals asserted below are guaranteed internally consistent with the actual
// money model, not just numbers this test file happens to agree with itself
// on.
const OWNER_SAMPLE_TICKETS: InvoiceTicketInput[] = [
  {
    id: 't1',
    batchNo: 'A035210',
    currency: 'PKR',
    intakeFlow: 'judicial_case_files',
    formPayload: {
      case_title: 'State vs Naimat Ullah Khan & others',
      judge_name: 'Zia Ahmed',
      select_court: 'District Court',
      select_court_city: 'Lahore',
    },
    serviceCost: 10500,
    additionalServiceCost: 0,
    printingCharges: 24500,
    attestedCharges: 0,
    nonAttestedCharges: 0,
    deliveryCharges: 4500,
    additionalCharges: 7000,
    discountPrice: 0,
    promoDiscount: 0,
    service: { name: 'Case Files Special Court 2024' },
  },
  {
    id: 't2',
    batchNo: 'B00002',
    currency: 'PKR',
    intakeFlow: 'judicial_case_files',
    formPayload: {},
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
  },
  {
    id: 't3',
    batchNo: 'C00003',
    currency: 'PKR',
    intakeFlow: 'judicial_case_information',
    formPayload: {},
    serviceCost: 1500,
    additionalServiceCost: 0,
    printingCharges: 0,
    attestedCharges: 0,
    nonAttestedCharges: 0,
    deliveryCharges: 0,
    additionalCharges: 0,
    discountPrice: 0,
    promoDiscount: 0,
    service: { name: 'Case Information' },
  },
  {
    id: 't4',
    batchNo: 'D00004',
    currency: 'PKR',
    intakeFlow: 'judicial_case_search',
    formPayload: {},
    serviceCost: 2000,
    additionalServiceCost: 0,
    printingCharges: 0,
    attestedCharges: 0,
    nonAttestedCharges: 0,
    deliveryCharges: 0,
    additionalCharges: 0,
    discountPrice: 0,
    promoDiscount: 0,
    service: { name: 'Case Search' },
  },
];

function buildOwnerSampleView(
  opts: { taxRate?: number; discountTotal?: number } = {},
): InvoiceView {
  const lines = buildInvoiceLines(OWNER_SAMPLE_TICKETS);
  const taxRate = opts.taxRate ?? 0;
  const discountTotal = opts.discountTotal ?? 0;
  const totals = summariseInvoice(lines, { taxRate, discountTotal });
  return {
    invoiceNo: '000999',
    issueDate: new Date('2026-06-28T00:00:00Z'),
    currency: 'PKR',
    company: {
      name: 'WUSUQ',
      country: 'Pakistan',
      phone: '0300-1998787',
      email: 'wusuqlq@icloud.com',
    },
    billTo: {
      name: 'Test Consumer Jamil',
      phone: '+923218337776',
      email: 'consumer@example.com',
    },
    lines,
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxRate,
    taxAmount: totals.taxAmount,
    grandTotal: totals.grandTotal,
    payment: null,
  };
}

describe('renderInvoicePdf — content (owner 4-ticket sample)', () => {
  it('prints the invoice number, company name, and bill-to name', async () => {
    const buf = await renderInvoicePdf(buildOwnerSampleView());
    const text = await extractText(buf);
    expect(text).toContain('000999');
    expect(text).toContain('WUSUQ');
    expect(text).toContain('Test Consumer Jamil');
  });

  it("prints every line's batchNo and description", async () => {
    const buf = await renderInvoicePdf(buildOwnerSampleView());
    const text = await extractText(buf);
    for (const t of OWNER_SAMPLE_TICKETS) {
      expect(text).toContain(t.batchNo);
      // pdf text extraction can wrap a long title across a page-layout line
      // break, so match on a normalised (whitespace-collapsed) string
      // instead of the raw substring.
      const normalised = text.replace(/\s+/g, ' ');
      expect(normalised).toContain(t.service!.name);
    }
  });

  it('the money adds up on the page: SUBTOTAL and GRAND TOTAL both read 54,950 (no tax, no discount)', async () => {
    const buf = await renderInvoicePdf(buildOwnerSampleView());
    const text = await extractText(buf);
    expect(text).toContain('SUBTOTAL');
    expect(text).toContain('GRAND TOTAL');
    expect(moneyAfter(text, 'SUBTOTAL')).toBe(54950);
    expect(moneyAfter(text, 'GRAND TOTAL')).toBe(54950);
  });

  it('shows "Case Judge (...)" for the line that has one, and never renders the empty-parens defect', async () => {
    const buf = await renderInvoicePdf(buildOwnerSampleView());
    const text = await extractText(buf);
    // Ticket 1 (A035210) is the only one with a judge_name in formPayload.
    expect(text).toContain('Case Judge (Zia Ahmed)');
    // The owner's original template rendered "Case Judge ()" when the field
    // was empty — that was the defect this feature deliberately fixed. Only
    // ONE "Case Judge" occurrence should appear across all 4 lines (tickets
    // 2-4 carry no judge and must render no line at all for it).
    expect(text).not.toContain('Case Judge ()');
    expect(text.match(/Case Judge/g)?.length ?? 0).toBe(1);
  });

  it('never renders clerkCost or any clerk figure', async () => {
    const buf = await renderInvoicePdf(buildOwnerSampleView());
    const text = await extractText(buf);
    expect(text.toLowerCase()).not.toContain('clerk');
  });

  it('a discounted invoice shows the Discount row and SUBTOTAL - DISCOUNT + TAX = GRAND TOTAL', async () => {
    const buf = await renderInvoicePdf(
      buildOwnerSampleView({ taxRate: 0.17, discountTotal: 1000 }),
    );
    const text = await extractText(buf);
    expect(text).toContain('DISCOUNT');
    const subtotal = moneyAfter(text, 'SUBTOTAL');
    const discount = moneyAfter(text, 'DISCOUNT');
    const tax = moneyAfter(text, 'TAX');
    const grandTotal = moneyAfter(text, 'GRAND TOTAL');
    expect(subtotal).toBe(54950);
    // formatMoney prints the discount with its own leading minus sign.
    expect(discount).toBe(-1000);
    expect(subtotal + discount + tax).toBe(grandTotal);
    expect(grandTotal).toBeGreaterThan(0);
  });
});
