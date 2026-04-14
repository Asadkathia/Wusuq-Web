'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className = '', ...rest }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={[
        'inline-flex items-center gap-1 rounded-xl bg-surface-muted p-1',
        className,
      ].join(' ')}
      {...rest}
    />
  );
});

export const TabsTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className = '', ...rest }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={[
        'inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-semibold text-slate-600',
        'transition-[background-color,color,box-shadow] duration-200 ease-silk',
        'hover:text-slate-900',
        'data-[state=active]:bg-surface data-[state=active]:text-slate-900 data-[state=active]:shadow-elev-1',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        className,
      ].join(' ')}
      {...rest}
    />
  );
});

export const TabsContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className = '', ...rest }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={['mt-6 focus-visible:outline-none', className].join(' ')}
      {...rest}
    />
  );
});

// Alt: underline tabs variant
export const TabsListUnderline = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsListUnderline({ className = '', ...rest }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={[
        'flex items-center gap-6 border-b border-border-soft',
        className,
      ].join(' ')}
      {...rest}
    />
  );
});

export const TabsTriggerUnderline = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTriggerUnderline({ className = '', ...rest }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={[
        'relative inline-flex h-10 items-center text-sm font-medium text-slate-500',
        'transition-colors duration-200 hover:text-slate-900',
        'data-[state=active]:text-slate-900',
        'after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:rounded-full after:transition-transform after:scale-x-0',
        'data-[state=active]:after:scale-x-100 data-[state=active]:after:bg-brand-500',
        'focus-visible:outline-none',
        className,
      ].join(' ')}
      {...rest}
    />
  );
});
