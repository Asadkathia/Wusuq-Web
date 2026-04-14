'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { forwardRef } from 'react';

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

const sideClass: Record<'right' | 'left', string> = {
  right:
    'right-0 top-0 bottom-0 h-full data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
  left:
    'left-0 top-0 bottom-0 h-full data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
};

type DrawerContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: 'right' | 'left';
  widthClassName?: string;
  hideClose?: boolean;
};

export const DrawerContent = forwardRef<HTMLDivElement, DrawerContentProps>(function DrawerContent(
  { className = '', side = 'right', widthClassName = 'w-full sm:max-w-[520px]', hideClose, children, ...rest },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={[
          'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        ].join(' ')}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={[
          'fixed z-50 bg-surface shadow-elev-3 ring-1 ring-border-soft',
          'flex flex-col overflow-hidden',
          'data-[state=open]:animate-in data-[state=closed]:animate-out duration-300 ease-silk',
          sideClass[side],
          widthClassName,
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
    </DialogPrimitive.Portal>
  );
});

export function DrawerHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={['border-b border-border-soft px-6 py-5 pr-14', className].join(' ')}>
      {children}
    </div>
  );
}

export const DrawerTitle = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DrawerTitle({ className = '', ...rest }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={['text-base font-semibold tracking-tight text-slate-900', className].join(' ')}
      {...rest}
    />
  );
});

export const DrawerDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DrawerDescription({ className = '', ...rest }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={['mt-1 text-sm text-slate-500', className].join(' ')}
      {...rest}
    />
  );
});

export function DrawerBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={['flex-1 overflow-y-auto px-6 py-5', className].join(' ')}>
      {children}
    </div>
  );
}

export function DrawerFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={['border-t border-border-soft bg-surface-hover px-6 py-4 flex items-center justify-end gap-2', className].join(' ')}>
      {children}
    </div>
  );
}
