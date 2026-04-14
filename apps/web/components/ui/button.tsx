'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'brand' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
};

const variantClass: Record<Variant, string> = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-500 shadow-elev-1 hover:shadow-elev-2',
  brand:
    'bg-brand-500 text-white hover:bg-brand-600 shadow-elev-1 hover:shadow-elev-2',
  secondary:
    'bg-surface text-slate-900 ring-1 ring-inset ring-border-soft hover:bg-surface-hover',
  ghost:
    'bg-transparent text-slate-700 hover:bg-surface-muted',
  danger:
    'bg-rose-600 text-white hover:bg-rose-500 shadow-elev-1',
  subtle:
    'bg-brand-50 text-brand-700 hover:bg-brand-100 ring-1 ring-inset ring-brand-100',
};

const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-sm rounded-xl gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth,
    className = '',
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-semibold whitespace-nowrap',
        'transition-[background-color,box-shadow,transform,color] duration-200 ease-silk',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500/50',
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none',
        'active:scale-[0.98]',
        variantClass[variant],
        sizeClass[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
      <span>{children}</span>
      {!loading && rightIcon}
    </button>
  );
});
