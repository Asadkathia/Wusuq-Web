import { renderInvoicePdf, type InvoiceView } from './invoice.pdf';

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
});
