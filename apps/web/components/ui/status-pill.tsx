import type { ReactNode } from 'react';

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusPillProps {
  label: string;
  variant?: StatusVariant;
  icon?: ReactNode;
  className?: string;
}

const variants: Record<StatusVariant, string> = {
  success: 'bg-emerald-100 text-emerald-700 ring-emerald-600/20',
  warning: 'bg-amber-100 text-amber-700 ring-amber-600/20',
  error: 'bg-rose-100 text-rose-700 ring-rose-600/20',
  info: 'bg-primary-100 text-primary-700 ring-primary-600/20',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-600/20',
};

export function StatusPill({ label, variant = 'neutral', icon, className = '' }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${variants[variant]} ${className}`}
    >
      {icon && <span className="h-3.5 w-3.5">{icon}</span>}
      {label}
    </span>
  );
}
