'use client';

import { useState } from 'react';
import { Check, Search, Sparkles } from 'lucide-react';

export type TileOption = {
  value: string;
  label: string;
  subtext?: string;
};

type SelectionTileGridProps = {
  options: TileOption[];
  value: string;
  onChange: (v: string) => void;
  /** Show a search bar above the grid when true (auto-enabled when options.length > 8) */
  searchable?: boolean;
  /** Highlight with error ring when validation fails */
  error?: boolean;
  ariaLabel: string;
  /** Placeholder shown while the option list is empty (e.g. "Select province first") */
  emptyPlaceholder?: string;
  /** Whether the grid should be non-interactive (e.g. upstream cascade not yet resolved) */
  disabled?: boolean;
};

export function SelectionTileGrid({
  options,
  value,
  onChange,
  searchable,
  error,
  ariaLabel,
  emptyPlaceholder,
  disabled,
}: SelectionTileGridProps) {
  const [query, setQuery] = useState('');

  const showSearch = searchable ?? options.length > 8;
  const INITIAL_LIMIT = 30;

  const trimmedQuery = query.trim();
  const matches =
    trimmedQuery === ''
      ? options
      : options.filter((o) =>
          o.label.toLowerCase().includes(trimmedQuery.toLowerCase()),
        );

  // When the list is huge AND the user hasn't searched yet, only render the
  // first INITIAL_LIMIT tiles so the DOM stays responsive. Searching reveals
  // every match. Picked-but-not-in-slice options are still appended so the
  // active selection is always visible.
  let filtered: TileOption[];
  let truncated = false;
  if (trimmedQuery === '' && matches.length > INITIAL_LIMIT) {
    filtered = matches.slice(0, INITIAL_LIMIT);
    if (value && !filtered.some((o) => o.value === value)) {
      const picked = matches.find((o) => o.value === value);
      if (picked) filtered = [picked, ...filtered];
    }
    truncated = true;
  } else {
    filtered = matches;
  }

  if (disabled && options.length === 0) {
    return (
      <p className="rounded-xl bg-surface-muted/50 p-3 text-sm text-slate-500 ring-1 ring-inset ring-border-soft">
        {emptyPlaceholder ?? 'Select a value above first.'}
      </p>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={error ? 'rounded-2xl ring-2 ring-rose-400/60 ring-offset-1' : undefined}
    >
      {showSearch && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${ariaLabel.toLowerCase()}…`}
            className="block w-full rounded-xl border-0 py-2.5 pl-9 pr-3.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500/50"
          />
        </div>
      )}

      {filtered.length === 0 && trimmedQuery !== '' ? (
        <p className="rounded-xl bg-surface-muted/50 p-3 text-sm text-slate-500 ring-1 ring-inset ring-border-soft">
          No matches for &ldquo;{trimmedQuery}&rdquo;
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((opt) => {
            const selected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange(opt.value)}
                className={[
                  'rounded-2xl border bg-surface p-4 text-left shadow-elev-1',
                  'transition-[transform,box-shadow,border-color] duration-200 ease-silk',
                  'hover:-translate-y-0.5 hover:shadow-elev-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  selected
                    ? 'border-brand-500 ring-2 ring-brand-500/30'
                    : 'border-border-soft hover:border-brand-200',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={[
                        'truncate text-sm font-semibold',
                        selected ? 'text-brand-700' : 'text-slate-900',
                      ].join(' ')}
                    >
                      {opt.label}
                    </p>
                    {opt.subtext ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{opt.subtext}</p>
                    ) : null}
                  </div>
                  {selected ? (
                    <span className="shrink-0">
                      <Sparkles className="h-4 w-4 text-brand-500" />
                    </span>
                  ) : (
                    <span
                      className={[
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        'border-slate-300',
                      ].join(' ')}
                    >
                      <Check className="h-2.5 w-2.5 text-transparent" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {truncated ? (
        <p className="mt-3 text-center text-xs text-slate-500">
          Showing {filtered.length} of {matches.length}. Type above to search the full list.
        </p>
      ) : null}
    </div>
  );
}
