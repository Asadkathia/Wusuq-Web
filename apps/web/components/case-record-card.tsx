// apps/web/components/case-record-card.tsx
import type { CaseTone, CaseView } from '@/lib/case-view';

const TONE_CLASS: Record<CaseTone, string> = {
  pending: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  decided: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  unknown: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

export function CaseRecordCard({ view }: { view: CaseView }) {
  const empty =
    !view.title && !view.status && view.summary.length === 0 && !view.bench && !view.hearings;
  if (empty) return null;

  const renderBlock = (block: CaseView['blockOrder'][number]) => {
    if (block === 'summary') {
      if (view.summary.length === 0) return null;
      return (
        <div key="summary" className="divide-y divide-slate-50 rounded-xl ring-1 ring-border-soft bg-surface">
          {view.summary.map((row) => (
            <div key={row.label} className="flex gap-3 px-4 py-2.5 text-sm">
              <span className="w-36 shrink-0 font-medium text-slate-500">{row.label}</span>
              <span className="text-slate-800">{row.value}</span>
            </div>
          ))}
        </div>
      );
    }
    if (block === 'bench') {
      if (!view.bench) return null;
      return (
        <div key="bench" className="rounded-xl ring-1 ring-border-soft bg-surface px-4 py-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bench</div>
          {view.bench.type && (
            <div className="mt-1 text-xs text-slate-500">
              <span className="font-medium">Type:</span> {view.bench.type}
            </div>
          )}
          {view.bench.designation && <div className="mt-1 text-slate-700">{view.bench.designation}</div>}
          {view.bench.judges.length > 0 && (
            <div className="mt-0.5 font-medium text-slate-800">{view.bench.judges.join(', ')}</div>
          )}
        </div>
      );
    }
    // hearings
    if (!view.hearings) return null;
    return (
      <div key="hearings" className="rounded-xl ring-1 ring-border-soft bg-surface px-4 py-3 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hearings</div>
        <div className="mt-1 flex flex-wrap gap-x-8 gap-y-1">
          {view.hearings.previous && (
            <span className="text-slate-700">Previous: <span className="font-medium text-slate-800">{view.hearings.previous}</span></span>
          )}
          {view.hearings.next && (
            <span className="text-slate-700">Next: <span className="font-medium text-slate-800">{view.hearings.next}</span></span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {(view.title || view.status) && (
        <div className="flex flex-wrap items-center gap-3">
          {view.title && <h3 className="text-base font-semibold text-slate-900">{view.title}</h3>}
          {view.status && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASS[view.status.tone]}`}>
              {view.status.label}
            </span>
          )}
        </div>
      )}
      {view.blockOrder.map(renderBlock)}
    </div>
  );
}
