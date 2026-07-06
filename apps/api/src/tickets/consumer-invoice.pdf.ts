import PDFDocument from 'pdfkit';
import { formatMoney } from '@wusuq/shared';

export interface ConsumerInvoiceInput {
  batchNo: string;
  status: string;
  consumer: { name?: string | null; email?: string | null };
  serviceCost: number;
  additionalServiceCost: number;
  deliveryCharges: number;
  printingCharges: number;
  attestedCharges: number;
  nonAttestedCharges: number;
  additionalCharges: number;
  discountPrice: number;
  promoDiscount: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  amountPaid: number;
  currency: 'PKR' | 'USD';
  remainderFinalizedAt?: string | null;
  payment?: {
    bankName?: string | null;
    accountTitle?: string | null;
    accountNumber?: string | null;
    iban?: string | null;
    jazzCash?: string | null;
    easyPaisa?: string | null;
  } | null;
}

// Reuse the single consumer-facing money formatter (CLAUDE.md), not a local one.
const money = (n: number, c: 'PKR' | 'USD') => formatMoney(n, c);

// Pure — returns the consumer-safe line items (NO clerk cost); phase-2 lines only when finalized.
export function consumerInvoiceLineItems(
  i: ConsumerInvoiceInput,
): Array<{ label: string; amount: number }> {
  const rows: Array<{ label: string; amount: number }> = [];
  const serviceBase = Number(i.serviceCost) + Number(i.additionalServiceCost);
  if (serviceBase) rows.push({ label: 'Service', amount: serviceBase });
  if (i.remainderFinalizedAt) {
    for (const [label, amt] of [
      ['Delivery', i.deliveryCharges],
      ['Printing', i.printingCharges],
      ['Attested', i.attestedCharges],
      ['Non-attested', i.nonAttestedCharges],
      ['Additional', i.additionalCharges],
    ] as Array<[string, number]>)
      if (Number(amt)) rows.push({ label, amount: Number(amt) });
  }
  const discount = Number(i.discountPrice) + Number(i.promoDiscount);
  if (discount) rows.push({ label: 'Discount', amount: -discount });
  if (Number(i.taxAmount))
    rows.push({
      label: `Tax (${Math.round(i.taxRate * 100)}%)`,
      amount: Number(i.taxAmount),
    });
  return rows;
}

// Renders the PDF to a base64 string using pdfkit.
export function renderConsumerInvoicePdf(
  i: ConsumerInvoiceInput,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);
    doc.fontSize(20).text('Wusuq', { continued: false });
    doc
      .fontSize(10)
      .fillColor('#555')
      .text(`Invoice ${i.batchNo}`)
      .text(`Status: ${i.status}`)
      .moveDown();
    doc
      .fillColor('#000')
      .fontSize(11)
      .text(`Bill to: ${i.consumer.name ?? ''}`)
      .text(i.consumer.email ?? '')
      .moveDown();
    for (const row of consumerInvoiceLineItems(i)) {
      doc
        .text(row.label, { continued: true })
        .text(money(row.amount, i.currency), { align: 'right' });
    }
    doc.moveDown();
    doc
      .font('Helvetica-Bold')
      .text('Total', { continued: true })
      .text(money(i.totalAmount, i.currency), { align: 'right' });
    doc
      .font('Helvetica')
      .text('Paid', { continued: true })
      .text(money(i.amountPaid, i.currency), { align: 'right' });
    doc
      .text('Due', { continued: true })
      .text(money(Math.max(0, i.totalAmount - i.amountPaid), i.currency), {
        align: 'right',
      });
    if (i.payment) {
      doc.moveDown().fontSize(9).fillColor('#555').text('Payment details:');
      if (i.payment.bankName)
        doc.text(
          `Bank: ${i.payment.bankName} — ${i.payment.accountTitle ?? ''} — ${i.payment.accountNumber ?? ''}`,
        );
      if (i.payment.iban) doc.text(`IBAN: ${i.payment.iban}`);
      if (i.payment.jazzCash) doc.text(`JazzCash: ${i.payment.jazzCash}`);
      if (i.payment.easyPaisa) doc.text(`EasyPaisa: ${i.payment.easyPaisa}`);
    }
    doc.end();
  });
}
