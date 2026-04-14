import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  hint?: string;
  className?: string;
}

export function StatCard({ title, value, icon, trend, hint, className = '' }: StatCardProps) {
  return (
    <div
      className={[
        'rounded-2xl bg-surface p-5 ring-1 ring-border-soft shadow-elev-1',
        'transition-shadow duration-200 hover:shadow-elev-2',
        className,
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{title}</h3>
        {icon ? <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-slate-500">{icon}</span> : null}
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
        {trend ? (
          <span className={['text-xs font-semibold tabular-nums', trend.isPositive ? 'text-emerald-600' : 'text-rose-600'].join(' ')}>
            {trend.isPositive ? '+' : ''}
            {trend.value}%
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
