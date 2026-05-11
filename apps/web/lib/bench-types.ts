/**
 * Canonical mapping of `benchType` (as captured in `payload.bench`) to its
 * human-friendly label. Shared by the consumer intake wizard (which writes
 * the value) and the staff ticket-detail panel (which reads it).
 *
 * Keep this in sync with `BENCH_TYPES_BY_TIER` in
 * `apps/web/components/intake-wizard.tsx` — that map governs which bench
 * types are *offered* per court tier; this map governs how any bench type
 * is *displayed* regardless of tier.
 */
export const BENCH_TYPE_LABELS = {
  single_judge: 'Single Judge',
  db_2: 'Divisional Bench (2 Judges)',
  fb_3: 'Full Bench (3 Judges)',
  larger: 'Larger Bench (5 Judges)',
  larger_5: 'Larger Bench (5 Judges)',
  larger_7: 'Larger Bench (7 Judges)',
} as const satisfies Record<string, string>;

export type BenchTypeKey = keyof typeof BENCH_TYPE_LABELS;
