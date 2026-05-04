'use client';
import type { ReactNode } from 'react';
import { Building2, ShieldCheck, Clock4, HeartHandshake } from 'lucide-react';

const TRUST_BADGES = [
  { icon: <Building2 className="h-4 w-4" />, title: 'Trusted by Thousands', subtitle: 'Across Pakistan' },
  { icon: <ShieldCheck className="h-4 w-4" />, title: '100% Secure', subtitle: 'Your data is protected' },
  { icon: <Clock4 className="h-4 w-4" />, title: 'Fast & Reliable', subtitle: 'We value your time' },
  { icon: <HeartHandshake className="h-4 w-4" />, title: 'Help When You Need', subtitle: 'Our support is here' },
];

export function LoginShell({
  step,
  totalSteps,
  children,
}: {
  step: number;
  totalSteps: number;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-4 py-10">
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full transition-colors ${
              i + 1 === step ? 'bg-brand-600' : i + 1 < step ? 'bg-brand-300' : 'bg-slate-300'
            }`}
          />
        ))}
      </div>

      <section className="w-full max-w-md rounded-2xl border border-border-soft bg-surface p-6 shadow-elev-1 sm:p-8">
        {children}
      </section>

      <ul className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
        {TRUST_BADGES.map((b) => (
          <li
            key={b.title}
            className="flex items-center gap-2 rounded-xl border border-border-soft bg-surface p-3 text-left"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
              {b.icon}
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-900">{b.title}</p>
              <p className="text-[11px] text-slate-500">{b.subtitle}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
