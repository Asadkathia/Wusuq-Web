import { Trophy } from 'lucide-react';
import { PanelCard } from '@/components/ui/panel-card';

export type Paralegal = {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  completed: number;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function TopParalegals({ paralegals }: { paralegals: Paralegal[] }) {
  const max = paralegals.reduce((m, p) => Math.max(m, p.completed), 0) || 1;

  return (
    <PanelCard className="flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Trophy className="h-4 w-4 text-amber-500" /> Top Paralegals
        </h3>
        <span className="text-xs font-medium text-slate-500">By completed in range</span>
      </div>

      {paralegals.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No completed assignments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {paralegals.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3">
              <span
                className={[
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  i === 0
                    ? 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200'
                    : 'bg-slate-100 text-slate-600',
                ].join(' ')}
              >
                {i + 1}
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
                {initials(p.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {p.city ?? p.email ?? '-'}
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.max(8, (p.completed / max) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                {p.completed}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
