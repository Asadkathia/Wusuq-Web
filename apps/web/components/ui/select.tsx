'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  hint?: string;
  disabled?: boolean;
};

export type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[] | string[];
  placeholder?: string;
  emptyText?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  name?: string;
  ariaLabel?: string;
  className?: string;
  /** Width of the popover content relative to trigger. Defaults to match trigger width. */
  popoverWidth?: 'trigger' | 'auto';
  /** Custom renderer per item (inside the label slot). */
  renderOption?: (option: SelectOption, selected: boolean) => ReactNode;
  /** Optional left-adornment inside the trigger (icon). */
  leftIcon?: ReactNode;
  /** Called when input loses focus (for field-level validation). */
  onBlur?: () => void;
};

function normalize(options: SelectProps['options']): SelectOption[] {
  if (!options || options.length === 0) return [];
  if (typeof options[0] === 'string') {
    return (options as string[]).map((s) => ({ value: s, label: s }));
  }
  return options as SelectOption[];
}

const triggerBase = [
  'group flex h-11 w-full items-center gap-2 rounded-xl border bg-surface px-3.5 text-left text-sm',
  'transition-[box-shadow,border-color] duration-200 ease-silk',
  'focus-visible:outline-none',
  'disabled:bg-surface-muted disabled:cursor-not-allowed',
].join(' ');

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    value,
    onChange,
    options: rawOptions,
    placeholder = 'Select…',
    emptyText = 'No results',
    searchable,
    searchPlaceholder = 'Search…',
    allowClear = false,
    disabled,
    error,
    id,
    name,
    ariaLabel,
    className = '',
    popoverWidth = 'trigger',
    renderOption,
    leftIcon,
    onBlur,
  },
  ref,
) {
  const options = useMemo(() => normalize(rawOptions), [rawOptions]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-enable search when there are 8+ options
  const shouldSearch = searchable ?? options.length >= 8;

  const filtered = useMemo(() => {
    if (!shouldSearch || query.trim() === '') return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description ? o.description.toLowerCase().includes(q) : false) ||
        (o.hint ? o.hint.toLowerCase().includes(q) : false),
    );
  }, [options, shouldSearch, query]);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    // Highlight selected on open
    const idx = filtered.findIndex((o) => o.value === value);
    setHighlighted(idx >= 0 ? idx : 0);
  }, [open, value, filtered]);

  // Keep highlighted within filtered range
  useEffect(() => {
    if (highlighted >= filtered.length) setHighlighted(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlighted]);

  const commit = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
    },
    [onChange],
  );

  const borderClass = error
    ? 'border-rose-400 focus-visible:border-rose-500 data-[state=open]:border-rose-500'
    : 'border-border-soft hover:border-slate-300 focus-visible:border-primary-500 data-[state=open]:border-primary-500 data-[state=open]:ring-2 data-[state=open]:ring-primary-500/25';

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) onBlur?.();
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          ref={ref}
          id={id}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          className={[triggerBase, borderClass, className].join(' ')}
        >
          {leftIcon ? <span className="text-slate-400 shrink-0">{leftIcon}</span> : null}
          <span
            className={[
              'flex-1 truncate',
              selected ? 'text-slate-900' : 'text-slate-400',
            ].join(' ')}
          >
            {selected ? selected.label : placeholder}
          </span>
          {allowClear && selected ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                commit('');
              }}
              className="shrink-0 rounded-md p-0.5 text-slate-400 hover:bg-surface-muted hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <ChevronDown
            className={[
              'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
              open ? 'rotate-180' : '',
            ].join(' ')}
          />
          {name ? <input type="hidden" name={name} value={value} /> : null}
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={6}
          align="start"
          className={[
            'z-50 rounded-2xl bg-surface p-1.5 shadow-elev-3 ring-1 ring-border-soft',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          ].join(' ')}
          style={{
            width:
              popoverWidth === 'trigger'
                ? 'var(--radix-popover-trigger-width)'
                : undefined,
            minWidth: popoverWidth === 'trigger' ? undefined : '14rem',
            maxHeight: 'var(--radix-popover-content-available-height, 22rem)',
          }}
          onOpenAutoFocus={(e) => {
            if (!shouldSearch) return;
            // Focus the search input on open
            e.preventDefault();
            requestAnimationFrame(() => {
              const input = listRef.current?.querySelector<HTMLInputElement>('input[data-select-search]');
              input?.focus();
            });
          }}
        >
          <div ref={listRef} className="flex max-h-80 flex-col">
            {shouldSearch ? (
              <div className="relative px-1 pt-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  data-select-search
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlighted(0);
                  }}
                  placeholder={searchPlaceholder}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlighted((h) => Math.min(filtered.length - 1, h + 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlighted((h) => Math.max(0, h - 1));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const opt = filtered[highlighted];
                      if (opt && !opt.disabled) commit(opt.value);
                    } else if (e.key === 'Escape') {
                      setOpen(false);
                    }
                  }}
                  className="h-9 w-full rounded-lg bg-surface-muted pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
              </div>
            ) : null}

            <div
              role="listbox"
              className={[
                'mt-1 flex-1 overflow-y-auto px-1 pb-1',
                shouldSearch ? '' : 'pt-1',
              ].join(' ')}
            >
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">{emptyText}</div>
              ) : (
                filtered.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlighted;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      onMouseEnter={() => setHighlighted(idx)}
                      onClick={() => !opt.disabled && commit(opt.value)}
                      className={[
                        'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left',
                        'transition-colors duration-100',
                        isHighlighted ? 'bg-surface-muted' : 'bg-transparent',
                        opt.disabled ? 'opacity-40 cursor-not-allowed' : '',
                      ].join(' ')}
                    >
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                        {isSelected ? <Check className="h-3.5 w-3.5 text-brand-500" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        {renderOption ? (
                          renderOption(opt, isSelected)
                        ) : (
                          <>
                            <span
                              className={[
                                'block truncate text-sm',
                                isSelected ? 'font-semibold text-slate-900' : 'text-slate-800',
                              ].join(' ')}
                            >
                              {opt.label}
                            </span>
                            {opt.description ? (
                              <span className="mt-0.5 block truncate text-xs text-slate-500">
                                {opt.description}
                              </span>
                            ) : null}
                          </>
                        )}
                      </span>
                      {opt.hint ? (
                        <span className="mt-0.5 shrink-0 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
                          {opt.hint}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});
