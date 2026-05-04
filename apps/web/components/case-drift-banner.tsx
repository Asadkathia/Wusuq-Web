'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { casesApi } from '@/lib/api/cases';

type Drift = {
  id: string;
  field: string;
  caseValue: string;
  ticketValue: string;
  ticketId: string | null;
  detectedAt: string;
};

const FIELD_LABELS: Record<string, string> = {
  caseNo: 'Case / Petition No',
  caseYear: 'Case Year',
  court: 'Court',
  courtCity: 'Court City',
  caseCategory: 'Case Type',
  courtCaseStatus: 'Court Case Status',
  judgeDesignation: 'Judge Designation',
  province: 'Province',
  district: 'District',
  policeStation: 'Police Station',
  firNo: 'FIR No',
  offence: 'Offence',
  docNo: 'Document No',
  officeCity: 'Office City',
};

export function CaseDriftBanner({ caseId }: { caseId: string }) {
  const [drifts, setDrifts] = useState<Drift[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () =>
    casesApi
      .getDrifts(caseId)
      .then((d) => setDrifts(d as Drift[]))
      .catch(() => setDrifts([]));

  useEffect(() => {
    reload();
  }, [caseId]);

  if (drifts.length === 0) return null;

  const resolve = async (eventId: string, source: 'CASE' | 'TICKET') => {
    setBusy(eventId);
    try {
      await casesApi.resolveDrift(caseId, eventId, source);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition-colors hover:bg-amber-100/70"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">
            Context drift detected on {drifts.length} field
            {drifts.length === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-amber-800/80">
            A completed ticket reported a value different from the case. Click to review.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
          {drifts.length}
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-elev-2">
            <div className="flex items-center justify-between border-b border-border-soft px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Resolve context drift</h2>
                <p className="text-xs text-slate-500">
                  Pick the correct value for each field. Choosing the ticket value updates the case.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-muted hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="max-h-[60vh] divide-y divide-border-soft overflow-y-auto">
              {drifts.map((d) => (
                <li key={d.id} className="px-5 py-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {FIELD_LABELS[d.field] ?? d.field}
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => resolve(d.id, 'CASE')}
                      className="rounded-xl border border-border-soft bg-surface p-3 text-left transition-colors hover:border-brand-200 hover:bg-surface-hover disabled:opacity-50"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Keep current
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-900 break-words">
                        {d.caseValue || <span className="italic text-slate-400">empty</span>}
                      </p>
                    </button>
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => resolve(d.id, 'TICKET')}
                      className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-left transition-colors hover:bg-brand-100 disabled:opacity-50"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                        Use ticket value
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-900 break-words">
                        {d.ticketValue || <span className="italic text-slate-400">empty</span>}
                      </p>
                    </button>
                  </div>
                </li>
              ))}
              {drifts.length === 0 ? (
                <li className="px-5 py-8 text-center text-sm text-slate-500">All resolved.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
