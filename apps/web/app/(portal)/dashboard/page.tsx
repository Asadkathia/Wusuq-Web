/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusPill } from '@/components/ui/status-pill';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { ActionCenter, type PendingAction } from '@/components/dashboard/action-center';
import { RangeTabs, type DashboardRange } from '@/components/dashboard/range-tabs';
import { OperationalQueue } from '@/components/dashboard/operational-queue';
import { TodaysHearings, type HearingItem } from '@/components/dashboard/todays-hearings';
import { TopParalegals, type Paralegal } from '@/components/dashboard/top-paralegals';
import { apiClient } from '@/lib/api-client';
import {
  Ticket,
  CheckCircle2,
  DollarSign,
  WalletCards,
  Briefcase,
  CalendarClock,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'] as const;
const RANGE_STORAGE_KEY = 'wusuq_dashboard_range';

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

type ClerkEarningsBreakdown = {
  base: number;
  attested: number;
  nonAttested: number;
  printing: number;
  delivery: number;
  pdfFee: number;
  total: number;
};

type ClerkSummary = {
  earnings: {
    realized: number;
    pending: number;
    thisMonth: number;
    // Optional so an older API response (or a stale cached bundle) can't
    // crash the page — the itemization render below guards on its presence.
    breakdown?: ClerkEarningsBreakdown;
  };
  counts: {
    assigned: number;
    inProgress: number;
    waitingApproval: number;
    completed: number;
    delivered: number;
  };
  pendingAcceptance: number;
  recent: Array<{ id: string; batchNo: string; status: string; service: string | null; caseNo: string | null }>;
  upcomingHearings: Array<{
    id: string;
    batchNo: string;
    scheduledDate: string | null;
    hearingType: string | null;
    caseTitle: string | null;
  }>;
};

function getStatusVariant(st: string) {
  if (st === 'COMPLETED' || st === 'DELIVERED') return 'success' as const;
  if (st === 'UNPAID') return 'warning' as const;
  if (st === 'PAID' || st === 'ASSIGNED' || st === 'IN_PROGRESS')
    return 'info' as const;
  return 'neutral' as const;
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DashboardRange>('7d');
  const [error, setError] = useState<string | null>(null);
  const [isConsumer, setIsConsumer] = useState<boolean | null>(null);
  const [isClerk, setIsClerk] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { role?: string } | null;
      const role = user?.role ?? '';
      setIsClerk(role === 'representative');
      const roleIsConsumer =
        CONSUMER_ROLES.includes(role as (typeof CONSUMER_ROLES)[number]) &&
        !role.includes('admin') &&
        role !== 'representative' &&
        role !== 'investor';
      setIsConsumer(roleIsConsumer);

      const stored = localStorage.getItem(RANGE_STORAGE_KEY);
      if (stored === '7d' || stored === '30d' || stored === '90d') {
        setRange(stored);
      }
    } catch {
      setIsConsumer(false);
    }
  }, []);

  useEffect(() => {
    if (isConsumer === null) return;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const endpoint = isClerk
          ? '/dashboard/clerk-summary'
          : isConsumer
            ? '/dashboard/my-summary'
            : `/dashboard/summary?range=${range}`;
        const res = await apiClient.get<any>(endpoint);
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [isConsumer, isClerk, range]);

  const handleRangeChange = (next: DashboardRange) => {
    setRange(next);
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  const renderAdminDashboard = () => {
    if (!data) return null;

    const {
      kpis,
      kpisDelta = {},
      kpiSparks = {},
      ticketTrend,
      ticketsByStatus,
      serviceMix,
      cityMix,
      pendingActions,
      todaysHearings = [],
      topParalegals = [],
    } = data;
    const hearings: HearingItem[] = todaysHearings;
    const paralegals: Paralegal[] = topParalegals;

    const actions: PendingAction[] = Array.isArray(pendingActions)
      ? pendingActions
      : pendingActions
        ? [
            {
              key: 'wallet_verifications',
              label: 'Wallet receipts to verify',
              count: pendingActions.pendingVerifications ?? 0,
              oldestAgeHours: null,
              deepLink: '/wallet',
              severity: 'warning',
            },
            {
              key: 'pending_tickets',
              label: 'Tickets pending assignment',
              count: pendingActions.pendingTickets ?? 0,
              oldestAgeHours: null,
              deepLink: '/tickets/pending',
              severity: 'info',
            },
          ]
        : [];

    return (
      <div className="mt-6 space-y-6">
        <QuickActions />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Tickets"
            value={kpis.totalTickets.toLocaleString()}
            icon={<Ticket className="h-4 w-4" />}
            delta={kpisDelta.totalTickets ?? null}
            href="/tickets/pending"
            hint="Click to triage"
            spark={kpiSparks.totalTickets}
          />
          <KpiCard
            title="Completed"
            value={kpis.completedTickets.toLocaleString()}
            icon={<CheckCircle2 className="h-4 w-4" />}
            delta={kpisDelta.completedTickets ?? null}
            href="/tickets/completed"
            spark={kpiSparks.completedTickets}
          />
          <KpiCard
            title="Total Revenue"
            value={`Rs. ${Number(kpis.totalRevenue).toLocaleString()}`}
            icon={<DollarSign className="h-4 w-4" />}
            delta={kpisDelta.totalRevenue ?? null}
            href="/reports"
            spark={kpiSparks.totalRevenue}
          />
          <KpiCard
            title="Outstanding"
            value={`Rs. ${Number(kpis.outstandingBalance).toLocaleString()}`}
            icon={<WalletCards className="h-4 w-4" />}
            delta={kpisDelta.outstandingBalance ?? null}
            href="/finance"
            hint="Aged > 30d in Action Center"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PanelCard>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">Ticket Volume Trend</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ticketTrend} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>
          </div>

          <ActionCenter actions={actions} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TodaysHearings hearings={hearings} />
          <TopParalegals paralegals={paralegals} />
        </div>

        <OperationalQueue />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <PanelCard>
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Tickets by Status</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ticketsByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {ticketsByStatus.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </PanelCard>

          <PanelCard>
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Service Mix</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serviceMix} margin={{ top: 5, right: 0, bottom: 5, left: -20 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} tickLine={false} axisLine={false} tickFormatter={(v) => v.length > 10 ? v.substring(0, 10) + '…' : v} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PanelCard>

          <PanelCard>
            <h3 className="mb-4 text-sm font-semibold text-slate-900">City Distribution</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cityMix} margin={{ top: 5, right: 0, bottom: 5, left: -20 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="value" fill="#ec4899" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PanelCard>
        </div>
      </div>
    );
  };

  const renderConsumerDashboard = () => {
    if (!data) return null;

    const summary = data as ConsumerSummary;

    return (
      <div className="mt-8 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="My Tickets" value={summary.myTickets.total} icon={<Ticket className="opacity-50" />} />
          <StatCard title="Completed" value={summary.myTickets.completed} icon={<CheckCircle2 className="opacity-50" />} />
          <StatCard title="Outstanding (PKR)" value={summary.myOutstanding.toLocaleString()} icon={<DollarSign className="opacity-50" />} />
          <StatCard title="Wallet Balance (PKR)" value={summary.myWalletBalance.toLocaleString()} icon={<WalletCards className="opacity-50" />} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <PanelCard className="lg:col-span-2">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Recent Tickets</h3>
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
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No recent tickets</td>
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
                  <p className="text-sm font-semibold text-slate-900">{new Date(summary.myNextHearing.scheduledDate).toLocaleString()}</p>
                  <p className="text-sm text-slate-700">{summary.myNextHearing.hearingType || 'Hearing'}</p>
                  <p className="text-xs text-slate-500">{summary.myNextHearing.case.title}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No upcoming hearings</p>
              )}
            </PanelCard>

            <PanelCard>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Briefcase className="h-4 w-4 text-slate-500" /> My Cases
              </h3>
              <p className="text-3xl font-bold text-slate-900">{summary.myActiveCases}</p>
              <Link href="/cases" className="mt-3 inline-flex text-sm font-medium text-primary-700 hover:text-primary-800">
                View open cases
              </Link>
            </PanelCard>
          </div>
        </div>
      </div>
    );
  };

  const renderClerkDashboard = () => {
    if (!data) return null;
    const s = data as ClerkSummary;
    const rs = (n: number) => `PKR ${Number(n || 0).toLocaleString()}`;

    return (
      <div className="mt-8 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <StatCard title="Earned (realized)" value={rs(s.earnings.realized)} icon={<DollarSign className="opacity-50" />} />
            {s.earnings.breakdown && (
              <p className="mt-1.5 px-1 text-xs text-slate-500">
                {[
                  ['Clerk cost', s.earnings.breakdown.base],
                  ['Attested', s.earnings.breakdown.attested],
                  ['Non-attested', s.earnings.breakdown.nonAttested],
                  ['Printing', s.earnings.breakdown.printing],
                  ['Delivery', s.earnings.breakdown.delivery],
                  ['PDF', s.earnings.breakdown.pdfFee],
                ]
                  .filter(([, v]) => Number(v) > 0)
                  .map(([label, v]) => `${label} ${Number(v).toLocaleString()}`)
                  .join('  +  ')}
              </p>
            )}
          </div>
          <StatCard title="Pending earnings" value={rs(s.earnings.pending)} icon={<WalletCards className="opacity-50" />} />
          <StatCard title="This month" value={rs(s.earnings.thisMonth)} icon={<CheckCircle2 className="opacity-50" />} />
          <StatCard title="To accept" value={s.pendingAcceptance} icon={<Ticket className="opacity-50" />} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {([
            ['Assigned', s.counts.assigned, '/tickets/assigned'],
            ['In progress', s.counts.inProgress, '/tickets/in-progress'],
            ['Awaiting approval', s.counts.waitingApproval, '/tickets/waiting-approval'],
            ['Completed', s.counts.completed, '/tickets/completed'],
            ['Delivered', s.counts.delivered, '/tickets/delivered'],
          ] as const).map(([label, count, href]) => (
            <Link key={label} href={href}>
              <PanelCard className="transition-colors hover:border-brand-300">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{count}</p>
              </PanelCard>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <PanelCard className="lg:col-span-2">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Recent assignments</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Batch No</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Service</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Case No</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.recent.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{t.batchNo}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{t.service ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{t.caseNo ?? '-'}</td>
                      <td className="px-4 py-3">
                        <StatusPill label={t.status} variant={getStatusVariant(t.status)} />
                      </td>
                    </tr>
                  ))}
                  {s.recent.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No assignments yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>

          <PanelCard>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CalendarClock className="h-4 w-4 text-slate-500" /> Upcoming hearings
            </h3>
            {s.upcomingHearings.length > 0 ? (
              <ul className="space-y-3">
                {s.upcomingHearings.map((h) => (
                  <li key={h.id} className="border-b border-slate-50 pb-2 last:border-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {h.scheduledDate ? new Date(h.scheduledDate).toLocaleString() : '—'}
                    </p>
                    <p className="text-sm text-slate-700">{h.hearingType || 'Hearing'}</p>
                    <p className="text-xs text-slate-500">{h.caseTitle ?? h.batchNo}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No upcoming hearings</p>
            )}
          </PanelCard>
        </div>
      </div>
    );
  };

  const showLoading = isConsumer === null || loading;
  const heading = isClerk
    ? { title: 'My Dashboard', description: 'Your assignments, earnings, and upcoming hearings.' }
    : isConsumer
      ? { title: 'My Dashboard', description: 'Track your tickets, cases, and wallet in one place.' }
      : { title: 'Dashboard Overview', description: 'Monitor operations, tickets, and revenue in real-time.' };

  return (
    <div className="mx-auto max-w-7xl">
      <SectionHeader
        title={heading.title}
        description={heading.description}
        action={!isConsumer && !isClerk ? <RangeTabs value={range} onChange={handleRangeChange} /> : undefined}
      />

      {showLoading && <div className="animate-pulse py-20 text-center text-slate-500">Loading analytics…</div>}
      {!showLoading && error && <div className="py-20 text-center text-rose-500">{error}</div>}
      {!showLoading && !error && (isClerk ? renderClerkDashboard() : isConsumer ? renderConsumerDashboard() : renderAdminDashboard())}
    </div>
  );
}
