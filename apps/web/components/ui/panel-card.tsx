import type { ReactNode } from 'react';

interface PanelCardProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function PanelCard({ children, className = '', noPadding = false }: PanelCardProps) {
  return (
    <div className={`rounded-2xl border border-border-soft bg-surface shadow-soft ${noPadding ? '' : 'p-6'} ${className}`}>
      {children}
    </div>
  );
}
