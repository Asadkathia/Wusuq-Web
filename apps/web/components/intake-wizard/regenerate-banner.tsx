'use client';

import Link from 'next/link';
import { RefreshCw, ArrowLeft } from 'lucide-react';

type Props = {
  /** Short id label shown to the user (e.g. the batch number). */
  sourceTicketLabel: string;
  /** Display name of the source ticket's consumer — confirms who the
   *  regenerated ticket will be billed under. */
  consumerLabel?: string;
};

export function RegenerateBanner({ sourceTicketLabel, consumerLabel }: Props) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-3 text-sm text-amber-700">
      <div className="flex items-start gap-3">
        <RefreshCw className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="leading-snug">
          <p className="font-semibold">Regenerating from {sourceTicketLabel}</p>
          {consumerLabel ? (
            <p className="text-xs font-medium text-amber-800">Consumer: {consumerLabel}</p>
          ) : null}
          <p className="text-xs text-amber-700/80">
            The form is pre-filled from the source ticket. Review and adjust any fields before submitting.
          </p>
        </div>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-amber-300 bg-surface px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100/60"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </Link>
    </div>
  );
}
