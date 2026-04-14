'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { forwardRef } from 'react';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

type Size = 'sm' | 'md' | 'lg' | 'xl';
const sizeClass: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export const DialogOverlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className = '', ...rest }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={[
        'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      ].join(' ')}
      {...rest}
    />
  );
});

type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: Size;
  hideClose?: boolean;
};

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
  { className = '', size = 'md', hideClose, children, ...rest },
  ref,
) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={[
          'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
          'w-[calc(100vw-2rem)] rounded-2xl bg-surface p-6 shadow-elev-3 ring-1 ring-border-soft',
          'max-h-[calc(100vh-2rem)] overflow-y-auto',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          sizeClass[size],
          className,
        ].join(' ')}
        {...rest}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-surface-muted hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="mb-5 space-y-1 pr-8">{children}</div>;
}

export const DialogTitle = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className = '', ...rest }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={['text-lg font-semibold tracking-tight text-slate-900', className].join(' ')}
      {...rest}
    />
  );
});

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className = '', ...rest }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={['text-sm text-slate-500', className].join(' ')}
      {...rest}
    />
  );
});

export function DialogFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={['mt-6 flex flex-wrap items-center justify-end gap-2', className].join(' ')}>
      {children}
    </div>
  );
}
