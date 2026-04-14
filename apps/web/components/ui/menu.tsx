'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

export const Menu = DropdownMenuPrimitive.Root;
export const MenuTrigger = DropdownMenuPrimitive.Trigger;
export const MenuGroup = DropdownMenuPrimitive.Group;
export const MenuPortal = DropdownMenuPrimitive.Portal;
export const MenuSub = DropdownMenuPrimitive.Sub;
export const MenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const MenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function MenuContent({ className = '', sideOffset = 6, ...rest }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={[
          'z-50 min-w-[9rem] rounded-xl bg-surface p-1.5 shadow-elev-3 ring-1 ring-border-soft',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        ].join(' ')}
        {...rest}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const MenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }
>(function MenuItem({ className = '', danger, ...rest }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={[
        'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none',
        'transition-colors duration-150',
        danger
          ? 'text-rose-600 data-[highlighted]:bg-rose-50 data-[highlighted]:text-rose-700'
          : 'text-slate-700 data-[highlighted]:bg-surface-muted data-[highlighted]:text-slate-900',
        'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
        className,
      ].join(' ')}
      {...rest}
    />
  );
});

export const MenuLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(function MenuLabel({ className = '', ...rest }, ref) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={['px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400', className].join(' ')}
      {...rest}
    />
  );
});

export const MenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function MenuSeparator({ className = '', ...rest }, ref) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={['my-1 h-px bg-border-soft', className].join(' ')}
      {...rest}
    />
  );
});

export const MenuCheckboxItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(function MenuCheckboxItem({ className = '', children, checked, ...rest }, ref) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      checked={checked}
      className={[
        'relative flex cursor-pointer select-none items-center gap-2 rounded-lg pl-8 pr-2.5 py-2 text-sm text-slate-700 outline-none',
        'data-[highlighted]:bg-surface-muted data-[highlighted]:text-slate-900',
        className,
      ].join(' ')}
      {...rest}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-3.5 w-3.5 text-brand-500" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

export const MenuSubTrigger = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(function MenuSubTrigger({ className = '', children, ...rest }, ref) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={[
        'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 outline-none',
        'data-[state=open]:bg-surface-muted data-[highlighted]:bg-surface-muted data-[highlighted]:text-slate-900',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4" />
    </DropdownMenuPrimitive.SubTrigger>
  );
});

export const MenuSubContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(function MenuSubContent({ className = '', ...rest }, ref) {
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      className={[
        'z-50 min-w-[9rem] rounded-xl bg-surface p-1.5 shadow-elev-3 ring-1 ring-border-soft',
        className,
      ].join(' ')}
      {...rest}
    />
  );
});
