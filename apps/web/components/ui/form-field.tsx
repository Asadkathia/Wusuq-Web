import type { HTMLAttributes, ReactNode } from 'react';

type FormFieldProps = {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>;

// Forwards arbitrary div attributes (e.g. `data-tour`) onto the root, mirroring
// PanelCard's `...rest` pattern — no existing caller passes `className`, so the
// hardcoded root class stays fixed rather than merged.
export function FormField({ label, hint, error, required, htmlFor, children, ...rest }: FormFieldProps) {
  return (
    <div className="space-y-1.5" {...rest}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
