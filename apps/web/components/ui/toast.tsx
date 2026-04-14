'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';

type Variant = 'success' | 'error' | 'info' | 'warning';

type Toast = {
  id: string;
  title: string;
  description?: string;
  variant: Variant;
  duration: number;
};

type ToastContextValue = {
  toast: (input: { title: string; description?: string; variant?: Variant; duration?: number }) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const variantMeta: Record<Variant, { icon: ReactNode; ring: string; iconBg: string; iconText: string }> = {
  success: { icon: <CheckCircle2 className="h-4 w-4" />, ring: 'ring-emerald-100', iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' },
  error:   { icon: <XCircle className="h-4 w-4" />,       ring: 'ring-rose-100',    iconBg: 'bg-rose-50',    iconText: 'text-rose-600' },
  info:    { icon: <Info className="h-4 w-4" />,          ring: 'ring-indigo-100',  iconBg: 'bg-indigo-50',  iconText: 'text-indigo-600' },
  warning: { icon: <TriangleAlert className="h-4 w-4" />, ring: 'ring-amber-100',   iconBg: 'bg-amber-50',   iconText: 'text-amber-600' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    ({ title, description, variant = 'info', duration }: { title: string; description?: string; variant?: Variant; duration?: number }) => {
      const id = Math.random().toString(36).slice(2, 10);
      const resolvedDuration = duration ?? (variant === 'error' ? 7000 : 4000);
      const next: Toast = { id, title, description, variant, duration: resolvedDuration };
      setToasts((current) => [...current, next]);
      if (resolvedDuration > 0) {
        window.setTimeout(() => dismiss(id), resolvedDuration);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: push,
      success: (title, description) => push({ title, description, variant: 'success' }),
      error:   (title, description) => push({ title, description, variant: 'error' }),
      info:    (title, description) => push({ title, description, variant: 'info' }),
      warning: (title, description) => push({ title, description, variant: 'warning' }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-end gap-2 p-4 sm:max-w-sm sm:ml-auto">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const meta = variantMeta[toast.variant];
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={[
        'pointer-events-auto w-full max-w-sm rounded-2xl bg-surface shadow-elev-3 ring-1',
        meta.ring,
        'transition-[transform,opacity] duration-200 ease-silk',
        mounted ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
      ].join(' ')}
    >
      <div className="flex items-start gap-3 p-4">
        <span className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.iconBg, meta.iconText].join(' ')}>
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
          {toast.description ? <p className="mt-0.5 text-xs text-slate-500">{toast.description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-surface-muted hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
