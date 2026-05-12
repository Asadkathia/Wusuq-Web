'use client';

import Link from 'next/link';
import { CalendarClock, ArrowLeft } from 'lucide-react';

type Props = {
  /** Short id label shown to the user (e.g. the batch number). */
  sourceTicketLabel: string;
};

export function FutureTicketsBanner({ sourceTicketLabel }: Props) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/40 px-4 py-3 text-sm text-brand-700">
      <div className="flex items-start gap-3">
        <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="leading-snug">
          <p className="font-semibold">Reordering for the next hearing ({sourceTicketLabel})</p>
          <p className="text-xs text-brand-700/80">
            Confirm the upcoming hearing date and submit. Court and case details have been pre-filled.
          </p>
        </div>
      </div>
      <Link
        href="/consumer/my-tickets"
        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-brand-300 bg-surface px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100/60"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </Link>
    </div>
  );
}
