import {
  courtTierFromCourtType,
  docBundleLabel,
  parseBench,
  type CourtTier,
} from '@/lib/intake-flows';

export type CaseTone = 'pending' | 'decided' | 'unknown';
export type CaseBlock = 'summary' | 'bench' | 'hearings';
export type CaseView = {
  title: string | null;
  status: { label: string; tone: CaseTone } | null;
  summary: Array<{ label: string; value: string }>;
  bench: { designation: string | null; judges: string[] } | null;
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

// Allowlisted summary keys → labels (ids/source/enum keys are intentionally absent).
const SUMMARY_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'case_no', label: 'Case No' },
  { key: 'case_type', label: 'Case Type' },
  { key: 'select_court', label: 'Court' },
  { key: 'institution_date', label: 'Institution Date' },
  { key: 'fir_no', label: 'FIR No' },
  { key: 'fir_year', label: 'FIR Year' },
  { key: 'police_station', label: 'Police Station' },
  { key: 'offence', label: 'Offence' },
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
  if (!designation && names.length === 0) return null;
  return { designation, judges: names };
}

function hearingsOf(p: P): CaseView['hearings'] {
  const previous = val(p, 'case_date');
  const next = val(p, 'future_date', 'scheduledDate');
  if (!previous && !next) return null;
  return { previous, next };
}

export function buildCaseView(payload: P, tier: CourtTier | null): CaseView {
  const resolvedTier = tier ?? courtTierFromCourtType(payload?.select_court_type);
  const summary: Array<{ label: string; value: string }> = [];
  for (const f of SUMMARY_FIELDS) {
    const v = val(payload, f.key);
    if (v) summary.push({ label: f.label, value: v });
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
    hearings: hearingsOf(payload),
    blockOrder,
  };
}
