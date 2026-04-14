'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusPill } from '@/components/ui/status-pill';
import { apiClient } from '@/lib/api-client';
import { Ticket, CheckCircle2, DollarSign, WalletCards, Briefcase, CalendarClock, Clock3 } from 'lucide-react';

type ConsumerSummary = {
  myTickets: { total: number; pending: number; inProgress: number; completed: number };
  myWalletBalance: number;
  myOutstanding: number;
  myActiveCases: number;
  myRecentTickets: Array<{
    id: string;
    batchNo: string;
    status: string;
    totalAmount: number;
    createdAt: string;
    service: { name: string };
  }>;
  myNextHearing: {
    scheduledDate: string;
    hearingType?: string | null;
    case: { title: string };
  } | null;
};

type WalletResponse = {
  balance?: number;
};

function getStatusVariant(status: string) {
  if (status === 'COMPLETED') return 'success' as const;
  if (status === 'PENDING') return 'warning' as const;
  if (status === 'ASSIGNED' || status === 'IN_PROGRESS') return 'info' as const;
  return 'neutral' as const;
}

export default function ConsumerDashboardPage() {
  const [summary, setSummary] = useState<ConsumerSummary | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [summaryResult, walletResult] = await Promise.all([
          apiClient.get<ConsumerSummary>('/dashboard/consumer-summary'),
          apiClient.get<WalletResponse | { balance: number; transactions?: unknown[] }>('/wallet'),
        ]);

        setSummary(summaryResult);
        setWalletBalance(Number(walletResult.balance ?? summaryResult.myWalletBalance ?? 0));
      } catch (loadError: any) {
        setError(loadError.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return <div className="py-20 text-center text-slate-500">Loading dashboard...</div>;
  }

  if (error || !summary) {
    return <div className="py-20 text-center text-rose-500">{error || 'Unable to load dashboard.'}</div>;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <SectionHeader
        title="My Dashboard"
        description="Track your tickets, cases, and wallet in one place."
      />

      <div className="mt-8 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard title="Total Tickets" value={summary.myTickets.total} icon={<Ticket className="opacity-50" />} />
          <StatCard title="Pending" value={summary.myTickets.pending} icon={<Clock3 className="opacity-50" />} />
          <StatCard title="In Progress" value={summary.myTickets.inProgress} icon={<Ticket className="opacity-50" />} />
          <StatCard title="Completed" value={summary.myTickets.completed} icon={<CheckCircle2 className="opacity-50" />} />
          <StatCard title="Wallet Balance" value={walletBalance.toLocaleString()} icon={<WalletCards className="opacity-50" />} />
          <StatCard title="Outstanding Amount" value={summary.myOutstanding.toLocaleString()} icon={<DollarSign className="opacity-50" />} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <PanelCard className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Recent Tickets</h3>
              <Link href="/consumer/my-tickets" className="text-sm font-medium text-primary-700 hover:text-primary-800">
                View all
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Batch No</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Service</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.myRecentTickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{ticket.batchNo}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{ticket.service?.name ?? '-'}</td>
                      <td className="px-4 py-3">
                        <StatusPill label={ticket.status} variant={getStatusVariant(ticket.status)} />
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{Number(ticket.totalAmount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                  {summary.myRecentTickets.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                        No recent tickets
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>

          <div className="space-y-6">
            <PanelCard>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CalendarClock className="h-4 w-4 text-slate-500" /> Next Hearing
              </h3>
              {summary.myNextHearing ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {new Date(summary.myNextHearing.scheduledDate).toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-700">{summary.myNextHearing.hearingType || 'Hearing'}</p>
                  <p className="text-xs text-slate-500">{summary.myNextHearing.case.title}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No upcoming hearings</p>
              )}
            </PanelCard>

            <PanelCard>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Briefcase className="h-4 w-4 text-slate-500" /> Active Cases
              </h3>
              <p className="text-3xl font-bold text-slate-900">{summary.myActiveCases}</p>
              <Link href="/consumer/my-cases" className="mt-3 inline-flex text-sm font-medium text-primary-700 hover:text-primary-800">
                View my cases
              </Link>
            </PanelCard>
          </div>
        </div>
      </div>
    </div>
  );
}
