import { existsSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { formatMoney, type Currency } from '@wusuq/shared';
import type { CompanySettings } from '../settings/settings.service';
import type { InvoiceLine } from './invoice-lines';

export interface InvoiceView {
  invoiceNo: string;
  issueDate: Date;
  currency: Currency;
  company: CompanySettings;
  billTo: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  lines: InvoiceLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  payment?: {
    accountTitle?: string | null;
    jazzCash?: string | null;
    easyPaisa?: string | null;
    accountNumber?: string | null;
    bankName?: string | null;
  } | null;
}

const PURPLE = '#7b248d';
const HEADER_BG = '#f1f5f9';
const STRIPE = '#f8fafc';
const MUTED = '#64748b';
const INK = '#121f35';

const M = 50; // page margin
const PAGE_W = 595; // A4 portrait
const CONTENT_W = PAGE_W - M * 2; // 495

// Column x-offsets from the left margin. 22 + 155 + 7*45 = 492 <= 495.
const COL_NUM_W = 22;
const COL_DESC_W = 155;
const MONEY_W = 45;
const MONEY_COLS = [
  'Service',
  'Printing',
  'Attested',
  'Non-Att',
  'Delivery',
  'Additional',
  'Total',
] as const;

function moneyX(i: number): number {
  return M + COL_NUM_W + COL_DESC_W + i * MONEY_W;
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/**
 * Bare, thousands-separated number with NO currency prefix — for line-item
 * money cells, which are too narrow (45pt) to carry `formatMoney`'s "PKR "/"$"
 * prefix without wrapping to two lines. `formatMoney` (packages/shared) isn't
 * exported as a prefix-less variant, so this mirrors its exact decimal rule
 * (USD 2dp, PKR 0dp) via the same `Intl.NumberFormat` call rather than
 * inventing a different one. The totals block still uses `formatMoney`
 * directly — it has room and the prefix matters most there.
 */
function bareAmount(amount: number, currency: Currency): string {
  const decimals = currency === 'USD' ? 2 : 0;
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-PK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/** Exact rate — "TAX (17.5%)", never Math.round (which made the old PDF lie). */
function taxLabel(rate: number): string {
  if (!rate) return 'TAX';
  const pct = rate * 100;
  const shown = Number.isInteger(pct)
    ? String(pct)
    : String(Number(pct.toFixed(2)));
  return `TAX (${shown}%)`;
}

function logoPath(): string | null {
  // Rendered white-on-purple in the header tile, mirroring the owner's template.
  const p = join(
    process.cwd(),
    '..',
    'web',
    'public',
    'brand',
    'wusuq-mark-white.png',
  );
  return existsSync(p) ? p : null;
}

function drawHeader(doc: PDFKit.PDFDocument, v: InvoiceView): void {
  const tile = 56;
  doc.roundedRect(M, M, tile, tile, 6).fill(PURPLE);
  const logo = logoPath();
  if (logo) {
    try {
      doc.image(logo, M + 10, M + 10, {
        fit: [tile - 20, tile - 20],
        align: 'center',
        valign: 'center',
      });
    } catch {
      // A missing/corrupt asset must never fail an invoice.
    }
  }

  const right = M + CONTENT_W;
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(v.company.name, right - 200, M + 4, { width: 200, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text(v.company.country, right - 200, doc.y, {
    width: 200,
    align: 'right',
  });
  doc.text(v.company.phone, right - 200, doc.y, { width: 200, align: 'right' });
  doc
    .fillColor(PURPLE)
    .text(v.company.email, right - 200, doc.y, { width: 200, align: 'right' });

  const ruleY = M + tile + 12;
  doc
    .moveTo(M, ruleY)
    .lineTo(right, ruleY)
    .lineWidth(0.5)
    .strokeColor('#cbd5e1')
    .stroke();
}

function drawBillTo(doc: PDFKit.PDFDocument, v: InvoiceView): number {
  const top = M + 90;
  doc.rect(M, top, 2, 42).fill(PURPLE);

  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text('INVOICE TO:', M + 8, top);
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(v.billTo.name, M + 8, top + 12);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  let y = top + 28;
  if (v.billTo.address) {
    doc.text(v.billTo.address, M + 8, y, { width: 220 });
    y = doc.y;
  }
  if (v.billTo.phone) {
    doc.text(v.billTo.phone, M + 8, y);
    y = doc.y;
  }
  if (v.billTo.email) {
    doc.fillColor(PURPLE).text(v.billTo.email, M + 8, y);
    y = doc.y;
  }

  const right = M + CONTENT_W;
  doc
    .fillColor(PURPLE)
    .font('Helvetica')
    .fontSize(20)
    .text(`INVOICE ${v.invoiceNo}`, right - 240, top, {
      width: 240,
      align: 'right',
    });
  doc
    .fillColor(MUTED)
    .fontSize(8)
    .text(`Date of Invoice: ${fmtDate(v.issueDate)}`, right - 240, top + 26, {
      width: 240,
      align: 'right',
    });
  // Currency stated ONCE here (not per money cell) — bold + ink so a USD
  // invoice can never be mistaken for PKR now that line-item cells are bare
  // numbers. Placed beside the invoice's other identity facts (No., Date),
  // where a reader already looks, rather than squeezed into a 45pt-wide
  // 7pt column header ("Service (PKR)") that has no room left after this fix.
  doc
    .font('Helvetica-Bold')
    .fillColor(INK)
    .text(`Currency: ${v.currency}`, right - 240, top + 38, {
      width: 240,
      align: 'right',
    });

  return Math.max(y, top + 58) + 18;
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const h = 26;
  doc.rect(M, y, CONTENT_W, h).fill(HEADER_BG);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7);
  doc.text('#', M + 6, y + 10);
  doc.text('DESCRIPTION', M + COL_NUM_W + 6, y + 10);
  MONEY_COLS.forEach((label, i) => {
    doc.text(label, moneyX(i), y + 10, { width: MONEY_W - 4, align: 'right' });
  });
  return y + h;
}

function drawLine(
  doc: PDFKit.PDFDocument,
  line: InvoiceLine,
  y: number,
  c: Currency,
  striped: boolean,
): number {
  const desc: string[] = [];
  if (line.courtLine) desc.push(line.courtLine);
  if (line.caseTitle) desc.push(`Case Title (${line.caseTitle})`);
  // Omitted entirely when absent — the sample's "Case Judge ()" is a defect.
  if (line.judge) desc.push(`Case Judge (${line.judge})`);

  const title = `${line.batchNo} - ${line.description}`;
  const titleH = doc
    .font('Helvetica')
    .fontSize(9)
    .heightOfString(title, { width: COL_DESC_W - 12 });
  const subH = desc.length
    ? doc
        .fontSize(7)
        .heightOfString(desc.join('\n'), { width: COL_DESC_W - 12 })
    : 0;
  const h = Math.max(38, titleH + subH + 16);

  if (striped) doc.rect(M, y, CONTENT_W, h).fill(STRIPE);
  doc.rect(M, y, COL_NUM_W, h).fill(PURPLE);
  doc
    .fillColor('#ffffff')
    .font('Helvetica')
    .fontSize(9)
    .text(String(line.position), M, y + h / 2 - 5, {
      width: COL_NUM_W,
      align: 'center',
    });

  doc
    .fillColor(PURPLE)
    .font('Helvetica')
    .fontSize(9)
    .text(title, M + COL_NUM_W + 6, y + 6, { width: COL_DESC_W - 12 });
  if (desc.length) {
    doc
      .fillColor(MUTED)
      .fontSize(7)
      .text(desc.join('\n'), M + COL_NUM_W + 6, y + 6 + titleH + 2, {
        width: COL_DESC_W - 12,
      });
  }

  const amounts = [
    line.serviceCost,
    line.printing,
    line.attested,
    line.nonAttested,
    line.delivery,
    line.additional,
    line.lineTotal,
  ];
  doc.fillColor(INK).font('Helvetica').fontSize(8);
  amounts.forEach((amt, i) => {
    // Bare number, no currency prefix — currency is stated once near the
    // invoice identity (drawBillTo), not per cell (that's what wrapped).
    // Explicit x + width — `continued: true` + align:'right' does NOT make a column.
    doc.text(bareAmount(amt, c), moneyX(i), y + h / 2 - 4, {
      width: MONEY_W - 4,
      align: 'right',
    });
  });

  return y + h;
}

function drawTotals(
  doc: PDFKit.PDFDocument,
  v: InvoiceView,
  y: number,
): number {
  const right = M + CONTENT_W;
  const rows: Array<[string, number, boolean]> = [
    ['SUBTOTAL', v.subtotal, false],
    [taxLabel(v.taxRate), v.taxAmount, false],
    ['GRAND TOTAL', v.grandTotal, true],
  ];
  let cur = y + 10;
  for (const [label, amount, strong] of rows) {
    doc
      .fillColor(strong ? PURPLE : INK)
      .font('Helvetica')
      .fontSize(strong ? 13 : 10)
      .text(label, right - 300, cur, { width: 190, align: 'right' })
      .text(formatMoney(amount, v.currency), right - 100, cur, {
        width: 100,
        align: 'right',
      });
    cur += strong ? 26 : 20;
  }
  doc
    .moveTo(M, cur + 4)
    .lineTo(right, cur + 4)
    .lineWidth(1)
    .strokeColor(PURPLE)
    .stroke();
  return cur + 16;
}

function drawPaymentAndFooter(
  doc: PDFKit.PDFDocument,
  v: InvoiceView,
  y: number,
): void {
  const p = v.payment;
  let cur = y;
  if (p) {
    const lines = [
      p.accountTitle ? `Name: ${p.accountTitle}` : null,
      p.jazzCash ? `JazzCash Account: ${p.jazzCash}` : null,
      p.easyPaisa ? `EasyPaisa Account: ${p.easyPaisa}` : null,
      p.accountNumber ? `Bank Account : ${p.accountNumber}` : null,
    ].filter(Boolean) as string[];

    if (lines.length) {
      const h = 22 + lines.length * 11;
      doc.rect(M, cur, CONTENT_W, h).fill(HEADER_BG);
      doc
        .fillColor(PURPLE)
        .font('Helvetica')
        .fontSize(10)
        .text('Payment Information', M + 12, cur + 8);
      doc
        .fillColor(MUTED)
        .fontSize(7.5)
        .text(lines.join('\n'), M + 12, cur + 22, { width: CONTENT_W - 24 });
      cur += h + 24;
    }
  }

  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(
      'Helping you is our purpose satisfying you is our business.',
      M,
      cur,
      { width: CONTENT_W, align: 'center' },
    );
  doc
    .fillColor(PURPLE)
    .font('Helvetica')
    .fontSize(15)
    .text('THANK YOU FOR USING WUSUQ!', M, cur + 24, {
      width: CONTENT_W,
      align: 'center',
    });
}

export function renderInvoicePdf(v: InvoiceView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    // Node stream 'error' events conventionally emit an Error, but this
    // mirrors the try/catch below rather than trust that convention blindly —
    // reject() must always receive a real Error either way.
    doc.on('error', (err: unknown) =>
      reject(err instanceof Error ? err : new Error(String(err))),
    );

    try {
      drawHeader(doc, v);
      let y = drawBillTo(doc, v);
      y = drawTableHeader(doc, y);

      v.lines.forEach((line, i) => {
        // Reserve room for the totals block; break before it collides.
        if (y > 700) {
          doc.addPage();
          y = M;
          y = drawTableHeader(doc, y);
        }
        y = drawLine(doc, line, y, v.currency, i % 2 === 1);
      });

      if (y > 620) {
        doc.addPage();
        y = M;
      }
      y = drawTotals(doc, v, y);
      drawPaymentAndFooter(doc, v, y);
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
