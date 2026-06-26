'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { IntakeField } from '@/lib/intake-flows';
import { parseDeliveryAddress, parseBench, formatBenchJudgeName, showWhenSatisfied, parseCities } from '@/lib/intake-flows';
import { Select } from '@/components/ui/select';

export type BenchTypeOption = { value: string; label: string; count: number };

// 5-24-26 #13: single-select bundle picker that collapses to the chosen option
// once selected (the rest disappear), mirroring the city/court pickers. Lives
// as a component — not inline in renderField — because it owns `useState` and
// renderField is invoked inside a .map() (rules-of-hooks).
function CheckboxSingleField({
  field,
  value,
  options,
  labelFor,
  onChange,
  onBlur,
  hasError,
  errorMsg,
}: {
  field: IntakeField;
  value: string;
  options: string[];
  labelFor: (o: string) => string;
  onChange: (key: string, value: string) => void;
  onBlur?: (key: string, value: string) => void;
  hasError: boolean;
  errorMsg: string;
}) {
  const [forceOpen, setForceOpen] = useState(false);
  const selected = options.includes(value) ? value : '';

  if (selected && !forceOpen) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-brand-500 bg-brand-500 text-white">
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
              </svg>
            </span>
            <span className="font-semibold">{labelFor(selected)}</span>
          </span>
          <button
            type="button"
            onClick={() => setForceOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-soft bg-surface px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-surface-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            Change
          </button>
        </div>
        {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => {
                const next = value === o ? '' : o;
                onChange(field.key, next);
                onBlur?.(field.key, next);
                // Re-collapse to the chosen bundle (no-op when cleared).
                if (next) setForceOpen(false);
              }}
              className={[
                'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm',
                'transition-[background-color,border-color] duration-150',
                active
                  ? 'border-brand-500 bg-brand-50 text-brand-800'
                  : 'border-border-soft bg-surface text-slate-700 hover:bg-surface-muted',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-md border',
                  active ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-surface',
                ].join(' ')}
              >
                {active ? (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
                  </svg>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">{labelFor(o)}</span>
            </button>
          );
        })}
      </div>
      {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
    </>
  );
}

const YEAR_OPTIONS: string[] = (() => {
  const current = new Date().getFullYear();
  const years: string[] = [];
  for (let y = current; y >= 1970; y--) years.push(String(y));
  return years;
})();

const BASE_CLASS =
  'block w-full rounded-xl border-0 py-2.5 px-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6';

export function renderField(
  field: IntakeField,
  value: string,
  payload: Record<string, string>,
  onChange: (key: string, value: string) => void,
  dynamicOptions?: string[],
  /**
   * Validation hook. Text inputs call `onBlur(key)` — the value has already
   * been committed via onChange and validateField re-reads it from payload.
   * Click-style fields (radio / checkbox tile / bench / search-method tabs)
   * pass the new value explicitly via `onBlur(key, newValue)` because
   * setState is async — at the moment the click handler runs, the parent's
   * payload closure still holds the PREVIOUS value, so validating without
   * the explicit `newValue` argument would error out on the first click and
   * make the option appear to need a double-click.
   */
  onBlur?: (key: string, newValue?: string) => void,
  errorMsg?: string,
  /** Per-option disabled + hint map keyed by the raw option value. Currently
   *  consumed only by the `radio` renderer (used for the Set Type picker's
   *  "Can't Get" hide-out). */
  disabledOptions?: Record<string, { disabled: boolean; hint?: string }>,
  /** Bench-type options for the `bench` field renderer. Lower/Special tiers
   *  pass a single-entry list to suppress the bench-type selector. */
  benchTypeOptions?: BenchTypeOption[],
): React.ReactNode {
  if (!showWhenSatisfied(field, payload)) return null;

  const hasError = Boolean(errorMsg);
  const ringClass = hasError ? 'ring-rose-500' : 'ring-border-soft';
  const inputClass = `${BASE_CLASS.replace('ring-border-soft', ringClass)}`;

  if (field.type === 'info') {
    // Readonly informational notes — used by Case Filing (PDF #42–#43) to show
    // the clerk dispatch address summary derived from the selected court.
    // For `clerk_dispatch_address` we compose a sentence from the chosen court
    // + city; the geo data does not yet carry the clerk's street address, so
    // v1 surfaces only the court name + city.
    let body: React.ReactNode = null;
    if (field.key === 'clerk_dispatch_address') {
      const court = payload.select_court?.trim();
      const city = (payload.select_court_city || payload.city)?.trim();
      if (court && city) {
        body = (
          <>
            Documents will be dispatched to the <strong>{court}</strong> clerk&apos;s office in{' '}
            <strong>{city}</strong>.
          </>
        );
      } else {
        body = 'Select a court and city in Step 1 to see dispatch details.';
      }
    } else {
      body = field.hint ?? '';
    }
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-slate-50/60 px-4 py-3 text-sm text-slate-700">
        {body}
      </div>
    );
  }

  if (field.type === 'search_method_tabs') {
    // PDF #37: two-tab toggle for Case Search. The user can pick one or both
    // tabs. The stored value is one of:
    //   ''        — neither selected (initial)
    //   'cnic'    — only CNIC tab on
    //   'details' — only Case Details tab on
    //   'both'    — both tabs on (pricing surcharge applies)
    const current = value ?? '';
    const cnicOn = current === 'cnic' || current === 'both';
    const detailsOn = current === 'details' || current === 'both';
    // QA MC-1: "both" is unavailable for multi-city Case Search — the
    // pricing sheet has no rule rows for that combination and the resolver
    // would return availability:false. Block client-side so the user gets a
    // clear hint instead of a silent unavailable price.
    const multiCity = parseCities(payload.cities).length > 1;
    const toggle = (which: 'cnic' | 'details') => {
      const nextCnic = which === 'cnic' ? !cnicOn : cnicOn;
      const nextDetails = which === 'details' ? !detailsOn : detailsOn;
      let next =
        nextCnic && nextDetails ? 'both' : nextCnic ? 'cnic' : nextDetails ? 'details' : '';
      if (multiCity && next === 'both') {
        // Force-flip the other tab off so the user keeps only the tab they
        // just clicked. Prevents an invalid "both" being committed.
        next = which;
      }
      onChange(field.key, next);
      onBlur?.(field.key, next);
    };
    const tabClass = (active: boolean) =>
      [
        'flex-1 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold',
        'transition-[background-color,border-color,color] duration-150',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-border-soft bg-surface text-slate-700 hover:bg-surface-muted',
      ].join(' ');
    return (
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            aria-pressed={cnicOn}
            onClick={() => toggle('cnic')}
            className={tabClass(cnicOn)}
          >
            <span
              className={[
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-md border',
                cnicOn ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-surface',
              ].join(' ')}
            >
              {cnicOn ? (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
                </svg>
              ) : null}
            </span>
            Search by CNIC
          </button>
          <button
            type="button"
            aria-pressed={detailsOn}
            onClick={() => toggle('details')}
            className={tabClass(detailsOn)}
          >
            <span
              className={[
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-md border',
                detailsOn ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-surface',
              ].join(' ')}
            >
              {detailsOn ? (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
                </svg>
              ) : null}
            </span>
            Search by Case Details
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {multiCity
            ? 'Multi-city searches accept one method at a time — switching tabs replaces the previous selection.'
            : 'Pick either method or both. Selecting both adds a Rs 1,000 surcharge per city.'}
        </p>
        {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <>
        <textarea
          className={inputClass}
          rows={4}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          onBlur={() => onBlur?.(field.key)}
          placeholder={`Enter ${field.label.toLowerCase()}`}
        />
        {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
      </>
    );
  }

  if (field.type === 'select') {
    const options =
      dynamicOptions && dynamicOptions.length > 0 ? dynamicOptions : (field.options ?? []);
    return (
      <>
        <Select
          value={value}
          onChange={(v) => onChange(field.key, v)}
          onBlur={() => onBlur?.(field.key)}
          options={options}
          placeholder={`Select ${field.label.toLowerCase()}`}
          searchPlaceholder={`Search ${field.label.toLowerCase()}…`}
          allowClear
          error={hasError}
          ariaLabel={field.label}
        />
        {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
      </>
    );
  }

  if (field.type === 'year_select') {
    return (
      <>
        <Select
          value={value}
          onChange={(v) => onChange(field.key, v)}
          onBlur={() => onBlur?.(field.key)}
          options={YEAR_OPTIONS}
          placeholder="Select year"
          searchPlaceholder="Search year…"
          searchable
          allowClear
          error={hasError}
          ariaLabel="Year"
        />
        {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
      </>
    );
  }

  if (field.type === 'radio') {
    const options = field.options ?? [];
    // Resolve the option label: runtime optionsLabel fn → serializable
    // optionsLabels map → default humanisation. `capitalize` is only applied
    // to the default form so custom labels (e.g. "I have an FIR number") are
    // rendered verbatim rather than title-cased.
    const customLabel = (o: string) =>
      field.optionsLabel?.(o, payload) ?? field.optionsLabels?.[o];
    return (
      <fieldset>
        <legend className="sr-only">{field.label}</legend>
        <div className="flex flex-wrap gap-2 pt-1">
          {options.map((o) => {
            const active = value === o;
            const optMeta = disabledOptions?.[o];
            const disabled = Boolean(optMeta?.disabled);
            return (
              <div key={o} className="flex flex-col">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    onChange(field.key, o);
                    onBlur?.(field.key, o);
                  }}
                  className={[
                    'inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium',
                    'transition-[background-color,border-color,color] duration-150',
                    disabled
                      ? 'cursor-not-allowed border-border-soft bg-surface-muted text-slate-400 opacity-60'
                      : active
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-border-soft bg-surface text-slate-700 hover:bg-surface-muted',
                  ].join(' ')}
                  aria-disabled={disabled}
                >
                  <span
                    className={[
                      'h-3.5 w-3.5 rounded-full border-2 transition-colors',
                      active && !disabled
                        ? 'border-brand-500 bg-brand-500 ring-2 ring-inset ring-white'
                        : 'border-slate-300',
                    ].join(' ')}
                  />
                  <span className={customLabel(o) ? undefined : 'capitalize'}>
                    {customLabel(o) ?? o.replace(/_/g, ' ')}
                  </span>
                </button>
                {disabled && optMeta?.hint ? (
                  <span className="mt-1 text-[11px] text-slate-500">{optMeta.hint}</span>
                ) : null}
              </div>
            );
          })}
        </div>
        {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
      </fieldset>
    );
  }

  if (field.type === 'checkbox_single') {
    const options = field.options ?? [];
    const labelFor = (o: string) =>
      field.optionsLabel?.(o, payload) ?? field.optionsLabels?.[o] ?? o;
    return (
      <CheckboxSingleField
        field={field}
        value={value}
        options={options}
        labelFor={labelFor}
        onChange={onChange}
        onBlur={onBlur}
        hasError={hasError}
        errorMsg={errorMsg ?? ''}
      />
    );
  }

  if (field.type === 'bench') {
    // Multi-judge bench picker (PDF #15, #16). Stored as a JSON-serialised
    // { benchType, judges } object under payload[field.key] (typically `bench`),
    // with payload.judge_name kept in sync as a human-readable display string
    // ("J. <name1> & J. <name2> …") so existing read paths still work.
    const FALLBACK_BENCH: BenchTypeOption = { value: 'single_judge', label: 'Single Judge', count: 1 };
    const opts: BenchTypeOption[] = benchTypeOptions && benchTypeOptions.length > 0
      ? benchTypeOptions
      : [FALLBACK_BENCH];
    const parsed = parseBench(value);
    const matched: BenchTypeOption = opts.find((o) => o.value === parsed.benchType) ?? opts[0] ?? FALLBACK_BENCH;
    const count = matched.count;
    // Pad / truncate the judges array to match the active bench count, but
    // preserve any names the user has already typed so swapping bench types
    // doesn't destroy data.
    const judges: string[] = Array.from({ length: count }, (_, i) => parsed.judges[i] ?? '');

    const commit = (nextBenchType: string, nextJudges: string[]) => {
      const benchObj = { benchType: nextBenchType, judges: nextJudges };
      onChange(field.key, JSON.stringify(benchObj));
      // Keep the derived display string in sync so existing read paths
      // (audit logs, server-side renderers) see human-readable text.
      onChange('judge_name', formatBenchJudgeName(nextJudges));
    };

    const handleBenchTypeChange = (nextValue: string) => {
      const nextOpt: BenchTypeOption = opts.find((o) => o.value === nextValue) ?? opts[0] ?? FALLBACK_BENCH;
      const nextJudges = Array.from({ length: nextOpt.count }, (_, i) => judges[i] ?? '');
      commit(nextOpt.value, nextJudges);
    };

    const handleJudgeChange = (index: number, name: string) => {
      const nextJudges = judges.slice();
      nextJudges[index] = name;
      commit(matched.value, nextJudges);
    };

    return (
      <div className="space-y-3">
        {opts.length > 1 ? (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bench type</label>
            <Select
              value={matched.value}
              onChange={handleBenchTypeChange}
              options={opts.map((o) => ({ value: o.value, label: o.label }))}
              placeholder="Select bench type"
              ariaLabel="Bench type"
            />
          </div>
        ) : null}
        <div className="space-y-2">
          {judges.map((judgeName, i) => (
            <div key={i}>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {count === 1 ? 'Judge name' : `Judge ${i + 1} name`}
              </label>
              <input
                className={inputClass}
                type="text"
                value={judgeName}
                onChange={(e) => handleJudgeChange(i, e.target.value)}
                onBlur={() => onBlur?.(field.key)}
                placeholder="e.g. Amjad Ali"
              />
            </div>
          ))}
        </div>
        {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
      </div>
    );
  }

  if (field.type === 'structured_address') {
    // PDF #31b: replace the single delivery_address textarea with a
    // multi-part form modelled after the KFC delivery flow.
    // TODO: integrate a map pin / geocoder for the "Main Area" field in a
    // follow-up iteration — out of scope for this pass.
    const addr = parseDeliveryAddress(value);
    // Editable delivery city: prefer the user-edited address city, falling back
    // to the wizard's selected city (payload.city) as the initial value. It was
    // previously hard-pinned read-only from payload.city, which blocked
    // delivering to a different city than the case's city.
    const cityValue = addr.city ?? payload.city ?? '';
    const update = (
      patch: Partial<{ house: string; block: string; mainArea: string; city: string }>,
    ) => {
      const next = {
        house: addr.house,
        block: addr.block,
        mainArea: addr.mainArea,
        ...(cityValue ? { city: cityValue } : {}),
        ...patch,
      };
      onChange(field.key, JSON.stringify(next));
    };
    return (
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-800">Delivery address</div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Delivering to (City)
          </label>
          <input
            className={inputClass}
            type="text"
            value={cityValue}
            onChange={(e) => update({ city: e.target.value })}
            onBlur={() => onBlur?.(field.key)}
            placeholder="e.g. Lahore"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            House / Flat / Apartment / Office Number
          </label>
          <input
            className={inputClass}
            type="text"
            value={addr.house}
            onChange={(e) => update({ house: e.target.value })}
            onBlur={() => onBlur?.(field.key)}
            placeholder="e.g. House 12-A"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Block / Sector / Street / Building / Floor Name
          </label>
          <input
            className={inputClass}
            type="text"
            value={addr.block}
            onChange={(e) => update({ block: e.target.value })}
            onBlur={() => onBlur?.(field.key)}
            placeholder="e.g. Block C, DHA Phase 5"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Main Area / Town / Nearest Landmark
          </label>
          <input
            className={inputClass}
            type="text"
            value={addr.mainArea}
            onChange={(e) => update({ mainArea: e.target.value })}
            onBlur={() => onBlur?.(field.key)}
            placeholder="e.g. Near Liberty Market"
          />
        </div>
        {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
      </div>
    );
  }

  // Soft CNIC formatter: any text field whose key ends in `cnic` gets dashes
  // inserted at positions 5 and 13 as the user types. Keeps the value
  // canonical (12345-1234567-1) without blocking keystrokes — pasted text
  // and partial input both get reformatted on change.
  const isCnicField = field.type === 'text' && /^.*cnic$/i.test(field.key);
  const formatCnic = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 13);
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  };

  return (
    <>
      <input
        className={inputClass}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(e) => {
          const next = isCnicField ? formatCnic(e.target.value) : e.target.value;
          onChange(field.key, next);
        }}
        onBlur={() => onBlur?.(field.key)}
        placeholder={field.placeholder ?? (isCnicField ? '12345-1234567-1' : `Enter ${field.label.toLowerCase()}`)}
        inputMode={isCnicField ? 'numeric' : undefined}
      />
      {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
    </>
  );
}

export function colSpan(field: IntakeField): string {
  if (['textarea', 'radio', 'checkbox_single', 'structured_address', 'bench', 'info', 'search_method_tabs'].includes(field.type)) return 'md:col-span-2';
  return '';
}
