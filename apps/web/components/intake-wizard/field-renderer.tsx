'use client';

import type { IntakeField } from '@/lib/intake-flows';

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
): React.ReactNode {
  if (field.showWhen && payload[field.showWhen.field] !== field.showWhen.value) return null;

  if (field.type === 'textarea') {
    return (
      <textarea
        className={BASE_CLASS}
        rows={4}
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={`Enter ${field.label.toLowerCase()}`}
      />
    );
  }

  if (field.type === 'select') {
    const options =
      dynamicOptions && dynamicOptions.length > 0 ? dynamicOptions : (field.options ?? []);
    return (
      <select className={BASE_CLASS} value={value} onChange={(e) => onChange(field.key, e.target.value)}>
        <option value="">— Select {field.label} —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'year_select') {
    return (
      <select className={BASE_CLASS} value={value} onChange={(e) => onChange(field.key, e.target.value)}>
        <option value="">— Select Year —</option>
        {YEAR_OPTIONS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'radio') {
    const options = field.options ?? [];
    return (
      <div className="flex flex-wrap gap-4 pt-1">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={field.key}
              value={o}
              checked={value === o}
              onChange={() => onChange(field.key, o)}
              className="h-4 w-4 text-primary-600 border-slate-300 focus:ring-primary-600"
            />
            <span className="text-sm text-slate-700 capitalize">{o.replace(/_/g, ' ')}</span>
          </label>
        ))}
      </div>
    );
  }

  if (field.type === 'checkbox_single') {
    const options = field.options ?? [];
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {options.map((o) => (
          <label
            key={o}
            className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <input
              type="checkbox"
              checked={value === o}
              onChange={() => onChange(field.key, value === o ? '' : o)}
              className="h-4 w-4 rounded text-primary-600 border-slate-300 focus:ring-primary-600"
            />
            <span className="text-sm text-slate-700">{o}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <input
      className={BASE_CLASS}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={(e) => onChange(field.key, e.target.value)}
      placeholder={`Enter ${field.label.toLowerCase()}`}
    />
  );
}

export function colSpan(field: IntakeField): string {
  if (['textarea', 'radio', 'checkbox_single'].includes(field.type)) return 'md:col-span-2';
  return '';
}
