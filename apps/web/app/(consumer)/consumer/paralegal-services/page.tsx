import Link from 'next/link';
import { Scale, FileText } from 'lucide-react';

export default function ParalegalServicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Paralegal Services
        </h1>
        <p className="mt-1 text-sm text-slate-500">Choose a category to get started.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/consumer/paralegal-services/judicial"
          className="group rounded-2xl border border-border-soft bg-surface p-6 shadow-elev-1 transition-[transform,box-shadow] duration-200 ease-silk hover:-translate-y-0.5 hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
            <Scale className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold text-slate-900">Judicial Services</h2>
          <p className="mt-1 text-sm text-slate-500">
            Case files, case information, case search, case filing, and power of attorney
            across Lower, High, Special, Federal Shariat, Supreme, and Federal Constitutional
            courts.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:text-brand-700">
            Browse <span aria-hidden>→</span>
          </span>
        </Link>

        <Link
          href="/consumer/paralegal-services/non-judicial"
          className="group rounded-2xl border border-border-soft bg-surface p-6 shadow-elev-1 transition-[transform,box-shadow] duration-200 ease-silk hover:-translate-y-0.5 hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <FileText className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold text-slate-900">Non-Judicial Services</h2>
          <p className="mt-1 text-sm text-slate-500">
            Copy of FIR, Search Criminal Record by CNIC and Police Station, and
            Registry / Deed copies.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:text-brand-700">
            Browse <span aria-hidden>→</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
