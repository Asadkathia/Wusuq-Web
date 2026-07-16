import { round2 } from '@wusuq/shared';

export interface InvoiceTicketInput {
  id: string;
  batchNo: string;
  currency: string;
  intakeFlow?: string | null;
  formPayload?: unknown;
  serviceCost: number;
  additionalServiceCost: number;
  printingCharges: number;
  attestedCharges: number;
  nonAttestedCharges: number;
  deliveryCharges: number;
  additionalCharges: number;
  discountPrice: number;
  promoDiscount: number;
  service?: { name?: string | null } | null;
}

export interface InvoiceLine {
  position: number;
  ticketId: string;
  batchNo: string;
  description: string;
  courtLine: string | null;
  caseTitle: string | null;
  judge: string | null;
  serviceCost: number;
  printing: number;
  attested: number;
  nonAttested: number;
  delivery: number;
  additional: number;
  lineTotal: number;
}

/** Sequence value -> the template's bare 6-digit number. Never truncates. */
export function formatInvoiceNo(seq: number): string {
  return String(seq).padStart(6, '0');
}

function str(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function buildLine(t: InvoiceTicketInput, position: number): InvoiceLine {
  const payload = (t.formPayload ?? {}) as Record<string, unknown>;

  const court = str(payload, 'court_name', 'select_court', 'court');
  const city = str(payload, 'city', 'service_city');
  const courtLine =
    court && city ? `(${court} - ${city})` : court ? `(${court})` : city ? `(${city})` : null;

  const serviceCost = round2(Number(t.serviceCost) + Number(t.additionalServiceCost));
  const printing = round2(Number(t.printingCharges));
  const attested = round2(Number(t.attestedCharges));
  const nonAttested = round2(Number(t.nonAttestedCharges));
  const delivery = round2(Number(t.deliveryCharges));
  const additional = round2(Number(t.additionalCharges));

  return {
    position,
    ticketId: t.id,
    batchNo: t.batchNo,
    description: t.service?.name?.trim() || `Ticket ${t.batchNo}`,
    courtLine,
    caseTitle: str(payload, 'case_title', 'caseTitle'),
    // The owner's sample renders "Case Judge ()" when empty. That's a defect —
    // null here means the renderer omits the line entirely.
    judge: str(payload, 'judge_name', 'judge'),
    serviceCost,
    printing,
    attested,
    nonAttested,
    delivery,
    additional,
    // Tax and discount are invoice-level, never per-line.
    lineTotal: round2(serviceCost + printing + attested + nonAttested + delivery + additional),
  };
}

export function buildInvoiceLines(tickets: InvoiceTicketInput[]): InvoiceLine[] {
  return tickets.map((t, i) => buildLine(t, i + 1));
}

/**
 * Invoice-level totals.
 *
 * Mirrors computeTicketTotal's contract: tax applies to the SERVICE base only
 * (serviceCost + additionalServiceCost, already folded into line.serviceCost),
 * NOT the whole bill. Delivery/printing/attested/non-attested/additional stay
 * in the total but untaxed.
 */
export function summariseInvoice(
  lines: InvoiceLine[],
  opts: { taxRate: number; discountTotal: number },
): { subtotal: number; taxableBase: number; taxAmount: number; grandTotal: number } {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const serviceBase = round2(lines.reduce((s, l) => s + l.serviceCost, 0));
  const discount = Math.max(0, round2(opts.discountTotal));

  const taxableBase = Math.max(0, round2(serviceBase - discount));
  const taxAmount = round2(taxableBase * Math.max(0, opts.taxRate));
  const grandTotal = Math.max(0, round2(Math.max(0, subtotal - discount) + taxAmount));

  return { subtotal, taxableBase, taxAmount, grandTotal };
}
