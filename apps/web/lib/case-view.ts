import {
  courtTierFromCourtType,
  docBundleLabel,
  parseBench,
  type CourtTier,
} from '@/lib/intake-flows';
import { BENCH_TYPE_LABELS } from '@/lib/bench-types';

export type CaseTone = 'pending' | 'decided' | 'unknown';
export type CaseBlock = 'summary' | 'bench' | 'hearings';
export type CaseView = {
  title: string | null;
  status: { label: string; tone: CaseTone } | null;
  summary: Array<{ label: string; value: string }>;
  bench: { designation: string | null; judges: string[]; type: string | null } | null;
  hearings: { previous: string | null; next: string | null } | null;
  blockOrder: CaseBlock[];
};

type P = Record<string, string | undefined> | null | undefined;

function val(p: P, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = p?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

/**
 * Title-cases snake_case enum-ish values (e.g. 'both' → 'Both',
 * 'non_attested' → 'Non Attested'). Leaves other values (dates with hyphens,
 * names with spaces, case numbers with slashes, doc bundles) untouched because
 * they don't match the all-lowercase/digit + underscore pattern.
 */
function humanizeValue(value: string): string {
  if (/^[a-z0-9]+(_[a-z0-9]+)*$/.test(value)) {
    return value
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return value;
}

// Allowlisted summary fields → labels.
// Multiple keys are tried left-to-right (first non-blank wins).
// `*_id` / `source` / enum-typed keys are intentionally absent.
const SUMMARY_FIELDS: Array<{ keys: string[]; label: string }> = [
  { keys: ['case_petition_no', 'case_no'], label: 'Case No' },
  { keys: ['case_type'], label: 'Case Type' },
  { keys: ['select_court'], label: 'Court' },
  { keys: ['select_court_type'], label: 'Court Type' },
  { keys: ['select_service'], label: 'Service Type' },
  { keys: ['case_year', 'year'], label: 'Case Year' },
  { keys: ['decided_date'], label: 'Decided Date' },
  { keys: ['case_type_other'], label: 'Case Type (Other)' },
  { keys: ['set_type'], label: 'Set Type' },
  { keys: ['sets'], label: 'Sets' },
  { keys: ['attested_qty'], label: 'Attested Copies' },
  { keys: ['want_pdf_before_dispatch'], label: 'PDF Copy' },
  { keys: ['search_method'], label: 'Search Method' },
  { keys: ['subject_full_name'], label: 'Subject Name' },
  { keys: ['subject_cnic'], label: 'Subject CNIC' },
  { keys: ['cnic'], label: 'CNIC' },
  { keys: ['purpose'], label: 'Purpose' },
  { keys: ['institution_date'], label: 'Institution Date' },
  { keys: ['fir_no'], label: 'FIR No' },
  { keys: ['fir_year'], label: 'FIR Year' },
  { keys: ['police_station', 'station'], label: 'Police Station' },
  { keys: ['offence'], label: 'Offence' },
];

function statusOf(p: P): CaseView['status'] {
  const s = val(p, 'case_status');
  if (!s) return null;
  const l = s.toLowerCase();
  const tone: CaseTone = l.includes('pending')
    ? 'pending'
    : l.includes('decided')
      ? 'decided'
      : 'unknown';
  return { label: s, tone };
}

function benchOf(p: P): CaseView['bench'] {
  const designation = val(p, 'judge_designation');
  const parsed = parseBench(p?.bench);
  const judges = parsed?.judges?.filter((j) => j && j.trim()) ?? [];
  const single = val(p, 'judge_name');
  const names = judges.length ? judges : single ? [single] : [];
  // Only resolve the bench type when the payload actually carried a bench
  // object — parseBench falls back to 'single_judge' for undefined/empty
  // values, which would incorrectly show a "Single Judge" label on tickets
  // that never specified bench data.
  const hasBenchData = !!(p?.bench && String(p.bench).trim());
  const type = hasBenchData
    ? ((BENCH_TYPE_LABELS as Record<string, string>)[parsed.benchType] ?? null)
    : null;
  if (!designation && names.length === 0 && !type) return null;
  return { designation, judges: names, type };
}

function hearingsOf(
  p: P,
  opts?: { scheduledDate?: string | null; previousHearingDate?: string | null },
): CaseView['hearings'] {
  // Batch-4 D: a clerk-recorded previousHearingDate (the date this ticket held
  // before the clerk last rescheduled) outranks the intake-time payload value,
  // mirroring how scheduledDate outranks payload.future_date for `next`.
  // Without it, rescheduling erased the previous hearing from the case card.
  const previous = (opts?.previousHearingDate ?? '').trim() || val(p, 'case_date');
  const next = (opts?.scheduledDate ?? '').trim() || val(p, 'future_date');
  if (!previous && !next) return null;
  return { previous, next };
}

export function isCaseViewEmpty(view: CaseView): boolean {
  return (
    !view.title && !view.status && view.summary.length === 0 && !view.bench && !view.hearings
  );
}

export function buildCaseView(
  payload: P,
  tier: CourtTier | null,
  opts?: { scheduledDate?: string | null; previousHearingDate?: string | null },
): CaseView {
  const resolvedTier = tier ?? courtTierFromCourtType(payload?.select_court_type);
  const summary: Array<{ label: string; value: string }> = [];
  for (const f of SUMMARY_FIELDS) {
    const v = val(payload, ...f.keys);
    if (v) summary.push({ label: f.label, value: humanizeValue(v) });
  }
  const bundle = val(payload, 'required_documentations');
  if (bundle) {
    summary.push({ label: 'Document Bundle', value: docBundleLabel(bundle, resolvedTier) });
  }
  const apex =
    resolvedTier === 'high' ||
    resolvedTier === 'supreme' ||
    resolvedTier === 'fcc' ||
    resolvedTier === 'shariat';
  // Importance order per tier: apex courts foreground the bench; lower courts
  // foreground the hearing dates (then the judge).
  const blockOrder: CaseBlock[] = apex
    ? ['summary', 'bench', 'hearings']
    : ['summary', 'hearings', 'bench'];
  return {
    title: val(payload, 'case_title'),
    status: statusOf(payload),
    summary,
    bench: benchOf(payload),
    hearings: hearingsOf(payload, opts),
    blockOrder,
  };
}
