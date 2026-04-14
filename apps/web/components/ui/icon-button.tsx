'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'ghost' | 'solid' | 'subtle' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon: ReactNode;
  'aria-label': string;
};

const variantClass: Record<Variant, string> = {
  ghost: 'bg-transparent text-slate-500 hover:bg-surface-muted hover:text-slate-900',
  solid: 'bg-surface text-slate-700 ring-1 ring-border-soft hover:bg-surface-hover shadow-elev-1',
  subtle: 'bg-surface-muted text-slate-700 hover:bg-surface-muted/80',
  danger: 'bg-transparent text-rose-500 hover:bg-rose-50 hover:text-rose-700',
};

const sizeClass: Record<Size, string> = {
  sm: 'h-7 w-7 rounded-md',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-11 w-11 rounded-xl',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', icon, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center',
        'transition-[background-color,color,box-shadow,transform] duration-200 ease-silk',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        'active:scale-95',
        variantClass[variant],
        sizeClass[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {icon}
    </button>
  );
});
