'use client';

const RANGES = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
] as const;

export type DashboardRange = (typeof RANGES)[number]['key'];

export function RangeTabs({
  value,
  onChange,
}: {
  value: DashboardRange;
  onChange: (next: DashboardRange) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-border-soft bg-surface p-1 shadow-elev-1">
      {RANGES.map((r) => {
        const active = r.key === value;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onChange(r.key)}
            className={[
              'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
              active
                ? 'bg-brand-500 text-white shadow-elev-1'
                : 'text-slate-600 hover:bg-surface-hover hover:text-slate-900',
            ].join(' ')}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
