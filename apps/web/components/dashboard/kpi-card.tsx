import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type { ReactNode } from 'react';

type KpiCardProps = {
  title: string;
  value: string | number;
  icon?: ReactNode;
  delta?: number | null;
  href?: string;
  hint?: string;
  spark?: number[];
};

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return null;
  const w = 80;
  const h = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`)
    .join(' ');
  const stroke = positive ? '#10b981' : '#f43f5e';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-70">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

export function KpiCard({ title, value, icon, delta, href, hint, spark }: KpiCardProps) {
  const inner = (
    <div
      className={[
        'group h-full rounded-2xl bg-surface p-5 ring-1 ring-border-soft shadow-elev-1',
        'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-elev-2',
        href ? 'cursor-pointer hover:ring-brand-200' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{title}</h3>
        <div className="flex items-center gap-1.5">
          {icon ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-slate-500">
              {icon}
            </span>
          ) : null}
          {href ? (
            <ArrowUpRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-brand-500" />
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
        {delta != null ? (
          <span
            className={[
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
              delta > 0
                ? 'bg-emerald-50 text-emerald-700'
                : delta < 0
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-slate-100 text-slate-600',
            ].join(' ')}
          >
            {delta > 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : delta < 0 ? (
              <ArrowDownRight className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {delta > 0 ? '+' : ''}
            {delta}%
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : <span />}
        {spark && spark.length > 1 ? (
          <Sparkline data={spark} positive={(delta ?? 0) >= 0} />
        ) : null}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
