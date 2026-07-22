'use client';

import Link from 'next/link';
import { startTransition, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusPill } from '@/components/ui/status-pill';
import { apiClient } from '@/lib/api-client';
import { formatStaffMoney, toCurrency } from '@wusuq/shared';

type Tab = {
  key: string;
  label: string;
  query: string;
  viewAllHref: string;
};

const TABS: Tab[] = [
  {
    key: 'unpaid',
    label: 'Unpaid',
    query: 'status=UNPAID&page=1&limit=8',
    viewAllHref: '/tickets/unpaid',
  },
  {
    key: 'paid',
    label: 'Paid',
    query: 'status=PAID&page=1&limit=8',
    viewAllHref: '/tickets/paid',
  },
  {
    key: 'assigned',
    label: 'Assigned',
    query: 'status=ASSIGNED&page=1&limit=8',
    viewAllHref: '/tickets/assigned',
  },
  {
    key: 'in_progress',
    label: 'In progress',
    query: 'status=IN_PROGRESS&page=1&limit=8',
    viewAllHref: '/tickets/in-progress',
  },
  {
    key: 'waiting_approval',
    label: 'Waiting approval',
    query: 'status=WAITING_APPROVAL&page=1&limit=8',
    viewAllHref: '/tickets/waiting-approval',
  },
];

type Row = {
  id: string;
  batchNo: string;
  status: string;
  serviceCity: string | null;
  caseType: string | null;
  totalAmount: number | string | null;
  createdAt: string;
  consumer: { id: string; name: string };
  service: { id: string; name: string; category: string; type: string };
  assignments?: Array<{ representative?: { id: string; name: string } | null }>;
  // Billing currency + the FX rate stamped at intake (non-PKR tickets only) —
  // GET /tickets already returns these. Feed both into formatStaffMoney so a
  // USD ticket renders its PKR equivalent instead of a bare unlabeled number.
  currency?: string | null;
  fxRateToPkr?: number | string | null;
};

function statusVariant(s: string) {
  if (s === 'COMPLETED' || s === 'DELIVERED') return 'success' as const;
  if (s === 'UNPAID') return 'warning' as const;
  if (s === 'PAID' || s === 'ASSIGNED' || s === 'IN_PROGRESS')
    return 'info' as const;
  return 'neutral' as const;
}

function ageLabel(iso: string): string {
  const hrs = Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

const FIRST_TAB = TABS[0]!;

export function OperationalQueue() {
  const [active, setActive] = useState<string>(FIRST_TAB.key);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tab = TABS.find((t) => t.key === active);
    if (!tab) return;
    startTransition(() => {
      setLoading(true);
      setError(null);
    });
    apiClient
      .get<{ items: Row[]; total: number }>(`/tickets?${tab.query}`)
      .then((res) => {
        if (cancelled) return;
        setRows(res.items ?? []);
        setCounts((c) => ({ ...c, [tab.key]: res.total ?? 0 }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load tickets');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const activeTab = TABS.find((t) => t.key === active) ?? FIRST_TAB;

  return (
    <PanelCard className="flex flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Operational Queue</h3>
        <Link
          href={activeTab.viewAllHref}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-xl border border-border-soft bg-surface-muted p-1">
        {TABS.map((t) => {
          const isActive = t.key === active;
          const count = counts[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                isActive
                  ? 'bg-surface text-slate-900 shadow-elev-1'
                  : 'text-slate-600 hover:text-slate-900',
              ].join(' ')}
            >
              {t.label}
              {typeof count === 'number' ? (
                <span
                  className={[
                    'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                    isActive ? 'bg-brand-50 text-brand-700' : 'bg-slate-200 text-slate-600',
                  ].join(' ')}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="py-8 text-center text-sm text-rose-500">{error}</p>
      ) : loading ? (
        <p className="animate-pulse py-8 text-center text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nothing in this queue.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Batch</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Service</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">City</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Paralegal</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Age</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const rep = r.assignments?.[0]?.representative;
                return (
                  <tr key={r.id} className="hover:bg-surface-muted">
                    <td className="px-3 py-2.5 text-sm font-medium text-slate-900">{r.batchNo}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700">{r.service?.name ?? '-'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700">{r.serviceCity ?? '-'}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700">{rep?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600 tabular-nums">{ageLabel(r.createdAt)}</td>
                    <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">
                      {formatStaffMoney(r.totalAmount, toCurrency(r.currency), r.fxRateToPkr)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill label={r.status} variant={statusVariant(r.status)} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`${activeTab.viewAllHref}?ticketId=${r.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-border-soft bg-surface px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-200 hover:bg-surface-hover"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}
