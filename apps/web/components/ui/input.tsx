'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, leftIcon, rightIcon, className = '', ...rest },
  ref,
) {
  const base = [
    'h-11 w-full rounded-xl bg-surface text-sm text-slate-900 placeholder:text-slate-400',
    'border transition-[box-shadow,border-color] duration-200 ease-silk',
    'focus:outline-none',
    'disabled:bg-surface-muted disabled:cursor-not-allowed',
    error
      ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25'
      : 'border-border-soft focus:border-primary-500 focus:ring-2 focus:ring-primary-500/25',
  ].join(' ');

  if (leftIcon || rightIcon) {
    return (
      <div className="relative">
        {leftIcon ? (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center">
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          className={[
            base,
            leftIcon ? 'pl-10' : 'pl-4',
            rightIcon ? 'pr-10' : 'pr-4',
            className,
          ].join(' ')}
          {...rest}
        />
        {rightIcon ? (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 flex items-center">
            {rightIcon}
          </span>
        ) : null}
      </div>
    );
  }

  return <input ref={ref} className={[base, 'px-4', className].join(' ')} {...rest} />;
});
