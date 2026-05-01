import Link from 'next/link';
import { ArrowRight, CheckCircle2, AlertTriangle, Clock, Info } from 'lucide-react';
import { PanelCard } from '@/components/ui/panel-card';

export type PendingAction = {
  key: string;
  label: string;
  count: number;
  oldestAgeHours: number | null;
  deepLink: string;
  severity: 'info' | 'warning' | 'danger';
};

function formatAge(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h old`;
  const days = Math.round(hours / 24);
  return `${days}d old`;
}

function severityStyles(severity: PendingAction['severity']) {
  switch (severity) {
    case 'danger':
      return {
        ring: 'ring-rose-100',
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        chip: 'bg-rose-100 text-rose-700',
        icon: AlertTriangle,
        iconClass: 'text-rose-600',
      };
    case 'warning':
      return {
        ring: 'ring-amber-100',
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        chip: 'bg-amber-100 text-amber-800',
        icon: Clock,
        iconClass: 'text-amber-600',
      };
    default:
      return {
        ring: 'ring-blue-100',
        bg: 'bg-blue-50',
        text: 'text-blue-800',
        chip: 'bg-blue-100 text-blue-800',
        icon: Info,
        iconClass: 'text-blue-600',
      };
  }
}

export function ActionCenter({ actions }: { actions: PendingAction[] }) {
  const visible = actions.filter((a) => a.count > 0);

  return (
    <PanelCard className="flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Action Center</h3>
        <span className="text-xs font-medium text-slate-500">
          {visible.length} item{visible.length === 1 ? '' : 's'} need attention
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-emerald-50 px-6 py-10 text-center ring-1 ring-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-semibold text-emerald-800">All clear</p>
          <p className="text-xs text-emerald-700">No pending items right now.</p>
        </div>
      ) : (
        <ul className="flex flex-1 flex-col gap-2.5">
          {visible.map((action) => {
            const s = severityStyles(action.severity);
            const Icon = s.icon;
            const age = formatAge(action.oldestAgeHours);
            return (
              <li key={action.key}>
                <Link
                  href={action.deepLink}
                  className={`group flex items-center justify-between gap-3 rounded-xl ${s.bg} px-3.5 py-3 ring-1 ring-inset ${s.ring} transition-shadow hover:shadow-elev-1`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon className={`h-5 w-5 shrink-0 ${s.iconClass}`} />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${s.text} truncate`}>{action.label}</p>
                      {age ? (
                        <p className="text-[11px] font-medium text-slate-500">Oldest {age}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${s.chip}`}
                    >
                      {action.count.toLocaleString()}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}
