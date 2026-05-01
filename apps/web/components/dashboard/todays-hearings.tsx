import Link from 'next/link';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { PanelCard } from '@/components/ui/panel-card';

export type HearingItem = {
  id: string;
  scheduledDate: string;
  hearingType: string | null;
  case: {
    id: string;
    title: string;
    consumer: { id: string; name: string } | null;
  };
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function TodaysHearings({ hearings }: { hearings: HearingItem[] }) {
  return (
    <PanelCard className="flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CalendarClock className="h-4 w-4 text-slate-500" /> Today&apos;s Hearings
        </h3>
        <span className="text-xs font-medium text-slate-500">
          {hearings.length} scheduled
        </span>
      </div>

      {hearings.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No hearings today.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {hearings.map((h) => (
            <li key={h.id}>
              <Link
                href={`/cases/${h.case.id}`}
                className="group flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-surface px-3.5 py-3 transition-[border-color,box-shadow] hover:border-brand-200 hover:shadow-elev-1"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      {timeLabel(h.scheduledDate).split(' ')[1] ?? ''}
                    </span>
                    <span className="text-xs font-bold tabular-nums">
                      {timeLabel(h.scheduledDate).split(' ')[0]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {h.case.title}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {h.hearingType ?? 'Hearing'}
                      {h.case.consumer ? ` · ${h.case.consumer.name}` : ''}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
