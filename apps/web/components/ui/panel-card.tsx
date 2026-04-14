import type { HTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'muted' | 'elevated';

interface PanelCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  default: 'bg-surface ring-1 ring-border-soft shadow-elev-1',
  muted: 'bg-surface-muted ring-1 ring-border-soft',
  elevated: 'bg-surface shadow-elev-2 ring-1 ring-border-soft',
};

export function PanelCard({
  children,
  className = '',
  noPadding = false,
  variant = 'default',
  ...rest
}: PanelCardProps) {
  return (
    <div
      className={[
        'rounded-2xl',
        variantClass[variant],
        noPadding ? '' : 'p-6',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
