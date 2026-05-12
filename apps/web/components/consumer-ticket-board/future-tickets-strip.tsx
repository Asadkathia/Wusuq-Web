'use client';

import Link from 'next/link';
import { CalendarClock, ArrowUpRight } from 'lucide-react';
import { flowKeyToSlug } from '@wusuq/shared';

type Props = {
  /** Source ticket id; passed as the futureFromTicketId query param. */
  ticketId: string;
  /** Source ticket's intake flow (judicial_case_files or _case_information). */
  flow: 'judicial_case_files' | 'judicial_case_information';
  /** ISO-format next-hearing date from the source ticket's payload.future_date. */
  nextHearingDate: string;
};

function formatHearingDate(iso: string): string {
  // Locale-stable display: e.g. "13 May 2026". Falls back to the raw
  // string if parsing fails so the strip still renders something useful.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FutureTicketsStrip({ ticketId, flow, nextHearingDate }: Props) {
  const slug = flowKeyToSlug(flow);
  const href = `/consumer/paralegal-services/judicial/${slug}?futureFromTicketId=${encodeURIComponent(ticketId)}`;
  return (
    <Link
      href={href}
      className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/50 px-4 py-3 text-sm text-brand-700 transition-colors hover:bg-brand-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <div className="flex items-center gap-3">
        <CalendarClock className="h-4 w-4 shrink-0" />
        <div className="leading-tight">
          <p className="font-semibold">Next hearing {formatHearingDate(nextHearingDate)}</p>
          <p className="text-xs text-brand-700/80">Order Future Tickets</p>
        </div>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}
