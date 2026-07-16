import { round2, readAliased, parseBench } from '@wusuq/shared';

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

/** Reads a canonical field via the shared alias table, trimming to a string. */
function strAliased(payload: Record<string, unknown>, canonical: string): string | null {
  const v = readAliased<unknown>(payload, canonical);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Resolves the judge for the invoice's `Case Judge (...)` line, mirroring
 * `benchOf()` in apps/web/lib/case-view.ts EXACTLY: for High/Supreme/Shariat/
 * FCC tickets the judge identity lives ONLY inside the structured `bench`
 * field (the wizard's flat `judge_name` field is rendered exclusively for
 * Lower/Special Court — see intake-flows.ts:616-651), so reading `judge_name`
 * alone silently omitted the judge for the entire bench-tier class.
 *
 * `parseBench` (shared with the web case card) never throws on a malformed
 * value — it falls back to zero judges — so this always degrades to the flat
 * `judge_name` fallback rather than crashing.
 *
 * Multi-judge benches join with ', ' (matches the case card's rendering —
 * `view.bench.judges.join(', ')` in case-record-card.tsx) rather than the
 * wizard's internal `J. <name> & J. <name>` convention, which is only used to
 * synthesize the single-judge legacy `judge_name` field, not to display a
 * multi-judge bench.
 */
function judgeOf(payload: Record<string, unknown>): string | null {
  const benchJudges = parseBench(payload.bench)
    .judges.map((j) => (typeof j === 'string' ? j.trim() : ''))
    .filter(Boolean);
  if (benchJudges.length) return benchJudges.join(', ');
  return str(payload, 'judge_name');
}

function buildLine(t: InvoiceTicketInput, position: number): InvoiceLine {
  const payload = (t.formPayload ?? {}) as Record<string, unknown>;

  // 'select_court' is the only real wizard key (intake-wizard.tsx writes it
  // at select_court: court.name / select_court: only.name). 'court_name' and
  // bare 'court' never appear anywhere in the codebase — removed.
  const court = str(payload, 'select_court');
  // Precedence mirrors buildPricingResolveInput's city resolution EXACTLY
  // (packages/shared/src/index.ts: `p.select_court_city ?? p.city ?? p.select_city`).
  // select_court_city is what the wizard actually writes for judicial flows
  // (intake-wizard.tsx); do not reorder or the city silently drops again.
  const city = str(payload, 'select_court_city', 'city', 'select_city');
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
    // case_title is canonical; PAYLOAD_FIELD_ALIASES['case_title'] = ['title',
    // 'title_party_a']. Resolved via the shared readAliased helper (not a
    // hand-rolled key list) so this stays in lock-step with the API's intake
    // normalisation. 'caseTitle' (camelCase) is not a real formPayload key —
    // removed.
    caseTitle: strAliased(payload, 'case_title'),
    // The owner's sample renders "Case Judge ()" when empty. That's a defect —
    // null here means the renderer omits the line entirely.
    // Bare 'judge' never appears anywhere in the codebase — not read. See
    // judgeOf() above: bench-tier tickets (High/Supreme/Shariat/FCC) carry the
    // judge only inside the structured `bench` field, not `judge_name`.
    judge: judgeOf(payload),
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
