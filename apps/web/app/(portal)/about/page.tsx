import { WusuqLogo } from '@/components/ui/wusuq-logo';
import { ATTRIBUTION, copyrightLine } from '@/components/ui/shell-footer';
import pkg from '../../../package.json';

export const metadata = { title: 'About · Wusuq' };

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-2xl border border-border-soft bg-surface p-8 text-center shadow-elev-1">
        <div className="flex justify-center">
          <WusuqLogo variant="full" size={140} />
        </div>

        <h1 className="mt-6 text-xl font-semibold tracking-tight text-ink-900">
          Wusuq — Paralegal Services
        </h1>
        <p className="mt-1 text-sm text-slate-500">Legal. Quicker.</p>

        <dl className="mx-auto mt-8 max-w-xs space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Version</dt>
            <dd className="font-medium text-ink-900">{pkg.version}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Developed by</dt>
            <dd className="font-medium text-ink-900">@2026-Klarus AI</dd>
          </div>
        </dl>

        <p className="mt-8 border-t border-border-soft pt-6 text-xs text-slate-400">
          {copyrightLine()} · {ATTRIBUTION}
        </p>
      </div>
    </div>
  );
}
