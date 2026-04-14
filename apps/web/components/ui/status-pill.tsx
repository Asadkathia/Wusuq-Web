import type { ReactNode } from 'react';

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand';

interface StatusPillProps {
  label: string;
  variant?: StatusVariant;
  icon?: ReactNode;
  dot?: boolean;
  className?: string;
}

const variants: Record<StatusVariant, { bg: string; text: string; ring: string; dot: string }> = {
  success: { bg: 'bg-emerald-50',  text: 'text-emerald-700', ring: 'ring-emerald-600/15', dot: 'bg-emerald-500' },
  warning: { bg: 'bg-amber-50',    text: 'text-amber-700',   ring: 'ring-amber-600/15',   dot: 'bg-amber-500' },
  error:   { bg: 'bg-rose-50',     text: 'text-rose-700',    ring: 'ring-rose-600/15',    dot: 'bg-rose-500' },
  info:    { bg: 'bg-indigo-50',   text: 'text-indigo-700',  ring: 'ring-indigo-600/15',  dot: 'bg-indigo-500' },
  neutral: { bg: 'bg-slate-100',   text: 'text-slate-700',   ring: 'ring-slate-600/15',   dot: 'bg-slate-400' },
  brand:   { bg: 'bg-brand-50',    text: 'text-brand-700',   ring: 'ring-brand-500/15',   dot: 'bg-brand-500' },
};

export function StatusPill({ label, variant = 'neutral', icon, dot, className = '' }: StatusPillProps) {
  const v = variants[variant];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] ring-1 ring-inset',
        v.bg,
        v.text,
        v.ring,
        className,
      ].join(' ')}
    >
      {dot ? <span className={['h-1.5 w-1.5 rounded-full', v.dot].join(' ')} /> : null}
      {icon ? <span className="h-3.5 w-3.5">{icon}</span> : null}
      {label}
    </span>
  );
}
