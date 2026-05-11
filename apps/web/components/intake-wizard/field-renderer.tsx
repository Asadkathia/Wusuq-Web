'use client';

import type { IntakeField } from '@/lib/intake-flows';
import { parseDeliveryAddress } from '@/lib/intake-flows';
import { Select } from '@/components/ui/select';

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
  onBlur?: (key: string) => void,
  errorMsg?: string,
  /** Per-option disabled + hint map keyed by the raw option value. Currently
   *  consumed only by the `radio` renderer (used for the Set Type picker's
   *  "Can't Get" hide-out). */
  disabledOptions?: Record<string, { disabled: boolean; hint?: string }>,
): React.ReactNode {
  if (field.showWhen && payload[field.showWhen.field] !== field.showWhen.value) return null;

  const hasError = Boolean(errorMsg);
  const ringClass = hasError ? 'ring-rose-500' : 'ring-border-soft';
  const inputClass = `${BASE_CLASS.replace('ring-border-soft', ringClass)}`;

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
                    onBlur?.(field.key);
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
                  <span className="capitalize">{o.replace(/_/g, ' ')}</span>
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
    const labelFor = field.optionsLabel ? (o: string) => field.optionsLabel!(o, payload) : (o: string) => o;
    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {options.map((o) => {
            const active = value === o;
            return (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(field.key, value === o ? '' : o); onBlur?.(field.key); }}
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

  if (field.type === 'structured_address') {
    // PDF #31b: replace the single delivery_address textarea with a
    // multi-part form modelled after the KFC delivery flow.
    // TODO: integrate a map pin / geocoder for the "Main Area" field in a
    // follow-up iteration — out of scope for this pass.
    const addr = parseDeliveryAddress(value);
    const cityFromPayload = payload.city ?? addr.city ?? '';
    const update = (patch: Partial<{ house: string; block: string; mainArea: string }>) => {
      const next = {
        house: addr.house,
        block: addr.block,
        mainArea: addr.mainArea,
        ...(cityFromPayload ? { city: cityFromPayload } : {}),
        ...patch,
      };
      onChange(field.key, JSON.stringify(next));
    };
    return (
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-800">Delivery address</div>
        {cityFromPayload ? (
          <div className="text-xs text-slate-500">
            Delivering to: <span className="font-medium text-slate-700">{cityFromPayload}</span>
          </div>
        ) : null}
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

  return (
    <>
      <input
        className={inputClass}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        onBlur={() => onBlur?.(field.key)}
        placeholder={`Enter ${field.label.toLowerCase()}`}
      />
      {hasError && <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>}
    </>
  );
}

export function colSpan(field: IntakeField): string {
  if (['textarea', 'radio', 'checkbox_single', 'structured_address'].includes(field.type)) return 'md:col-span-2';
  return '';
}
