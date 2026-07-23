'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileStack,
  FileText,
  Gavel,
  Landmark,
  Scale,
  Scroll,
  ShieldCheck,
  Ticket,
  Wallet,
} from 'lucide-react';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { formatMoney } from '@wusuq/shared';
import { ProfileCompletionBanner } from './profile-completion-banner';

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

type WalletResponse = { balance?: number; currency?: 'PKR' | 'USD' };

const SERVICES = [
  {
    key: 'case-files',
    title: 'Case files & court documents',
    description: 'Petitions, orders, paperbook & complete files.',
    href: '/consumer/paralegal-services/judicial',
    icon: FileStack,
    tone: 'brand' as const,
  },
  {
    key: 'hearings',
    title: 'Hearing follow-ups',
    description: 'Track next hearing, judge notes & outcomes.',
    href: '/consumer/paralegal-services/judicial',
    icon: Gavel,
    tone: 'indigo' as const,
  },
  {
    key: 'registry',
    title: 'Registry & land records',
    description: 'Land registry, fard, intiqaal, mutations.',
    href: '/consumer/paralegal-services/non-judicial',
    icon: Landmark,
    tone: 'emerald' as const,
  },
  {
    key: 'fir',
    title: 'FIR & police records',
    description: 'File or obtain FIR copies & status.',
    href: '/consumer/paralegal-services/non-judicial',
    icon: ShieldCheck,
    tone: 'rose' as const,
  },
  {
    key: 'attestation',
    title: 'Attestation & stamps',
    description: 'Notarization, stamp papers, affidavits.',
    href: '/consumer/paralegal-services/non-judicial',
    icon: Scroll,
    tone: 'amber' as const,
  },
  {
    key: 'other',
    title: 'Other paralegal services',
    description: 'Explore the full catalogue of services.',
    href: '/consumer/paralegal-services/judicial',
    icon: Scale,
    tone: 'slate' as const,
  },
];

type ServiceTone = 'brand' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'slate';
const TONE_CLASS: Record<ServiceTone, { iconBg: string; iconText: string; hoverRing: string }> = {
  brand:   { iconBg: 'bg-brand-50',   iconText: 'text-brand-600',   hoverRing: 'group-hover:ring-brand-200' },
  indigo:  { iconBg: 'bg-indigo-50',  iconText: 'text-indigo-600',  hoverRing: 'group-hover:ring-indigo-200' },
  emerald: { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', hoverRing: 'group-hover:ring-emerald-200' },
  rose:    { iconBg: 'bg-rose-50',    iconText: 'text-rose-600',    hoverRing: 'group-hover:ring-rose-200' },
  amber:   { iconBg: 'bg-amber-50',   iconText: 'text-amber-600',   hoverRing: 'group-hover:ring-amber-200' },
  slate:   { iconBg: 'bg-slate-100',  iconText: 'text-slate-600',   hoverRing: 'group-hover:ring-slate-300' },
};

function getStatusVariant(status: string) {
  if (status === 'COMPLETED' || status === 'DELIVERED') return 'success' as const;
  if (status === 'UNPAID') return 'warning' as const;
  if (status === 'PAID' || status === 'ASSIGNED' || status === 'IN_PROGRESS') return 'info' as const;
  return 'neutral' as const;
}

function relativeTime(iso: string) {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ConsumerDashboardPage() {
  const [summary, setSummary] = useState<ConsumerSummary | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletCurrency, setWalletCurrency] = useState<'PKR' | 'USD'>('PKR');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const searchParams = useSearchParams();
  const activeTab = searchParams?.get('tab') ?? 'all';
  const isUnpaidTab = activeTab === 'unpaid';

  const visibleTickets = useMemo(() => {
    const tickets = summary?.myRecentTickets ?? [];
    if (!isUnpaidTab) return tickets;
    return tickets.filter((t) => t.status === 'UNPAID');
  }, [summary?.myRecentTickets, isUnpaidTab]);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { name?: string } | null;
      if (user?.name) setUserName(user.name.split(' ')[0] ?? '');
    } catch {}
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [summaryResult, walletResult] = await Promise.all([
          apiClient.get<ConsumerSummary>('/dashboard/my-summary'),
          apiClient.get<WalletResponse>('/wallet/me').catch(() => ({} as WalletResponse)),
        ]);
        setSummary(summaryResult);
        setWalletBalance(Number(walletResult.balance ?? summaryResult.myWalletBalance ?? 0));
        if (walletResult.currency) setWalletCurrency(walletResult.currency);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <ProfileCompletionBanner />
      {/* Hero greeting */}
      <section className="relative overflow-hidden rounded-2xl bg-brand-500 p-6 text-white shadow-elev-2 sm:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-400 opacity-40 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-brand-700 opacity-50 blur-[120px]" />

        <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-100/80">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {userName ? `Welcome back, ${userName}.` : 'Welcome back.'}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-brand-100/90">
              Pick a service below to get started, or review what&rsquo;s in progress.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="!bg-white/10 !text-white !ring-white/20 hover:!bg-white/20 backdrop-blur-sm"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              <Link href="/consumer/my-tickets" className="!text-white">View my tickets</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Service picker */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Start a request</h2>
            <p className="text-sm text-slate-500">Choose a service category to begin.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            const tone = TONE_CLASS[service.tone];
            return (
              <Link
                key={service.key}
                href={service.href}
                className="group block"
              >
                <div className={[
                  'h-full rounded-2xl bg-surface p-5 ring-1 ring-border-soft shadow-elev-1',
                  'transition-[transform,box-shadow,ring-color] duration-200 ease-silk',
                  'hover:shadow-elev-2 hover:-translate-y-0.5',
                  tone.hoverRing,
                ].join(' ')}>
                  <div className="flex items-start justify-between">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone.iconBg}`}>
                      <Icon className={`h-5 w-5 ${tone.iconText}`} />
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-slate-300 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-500" />
                  </div>
                  <h3 className="mt-5 text-sm font-semibold tracking-tight text-slate-900">
                    {service.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {service.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Summary strip */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          // Matches the wallet page's own hero wording (consumer-wallet-board.tsx):
          // `walletBalance` here is already the NET figure (prepaid credit minus
          // outstanding dues, per /wallet/me), so a negative balance IS the amount
          // owed — label it as such instead of showing two unrelated-looking
          // numbers ("Wallet balance" + "Outstanding") side by side.
          label={walletBalance < 0 ? 'Amount owed' : 'Wallet balance'}
          value={formatMoney(walletBalance, walletCurrency)}
          icon={<Wallet className="h-4 w-4" />}
          hint={
            summary && summary.myOutstanding > 0
              ? `Includes ${formatMoney(summary.myOutstanding, walletCurrency)} in ticket dues`
              : undefined
          }
          tone="brand"
          loading={loading}
        />
        <SummaryCard
          label="Active tickets"
          value={summary ? String(summary.myTickets.pending + summary.myTickets.inProgress) : '—'}
          icon={<Ticket className="h-4 w-4" />}
          hint={summary ? `${summary.myTickets.total} total` : undefined}
          tone="indigo"
          loading={loading}
        />
        <SummaryCard
          label="Completed"
          value={summary ? String(summary.myTickets.completed) : '—'}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
          loading={loading}
        />
        <SummaryCard
          label="Active cases"
          value={summary ? String(summary.myActiveCases) : '—'}
          icon={<FileText className="h-4 w-4" />}
          tone="amber"
          loading={loading}
        />
      </section>

      {/* Activity + hearing */}
      <section className="grid gap-6 lg:grid-cols-3">
        <PanelCard className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Recent activity</h3>
              <p className="text-xs text-slate-500">
                {isUnpaidTab ? 'Tickets awaiting payment.' : 'Your latest tickets.'}
              </p>
            </div>
            <Link
              href="/consumer/my-tickets"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 inline-flex items-center gap-1 rounded-lg bg-surface-muted p-1">
            <Link
              href="/consumer/dashboard"
              scroll={false}
              className={[
                'rounded-md px-3 py-2.5 sm:py-1 text-xs font-semibold transition-colors',
                !isUnpaidTab ? 'bg-white text-slate-900 shadow-elev-1' : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              All
            </Link>
            <Link
              href="/consumer/dashboard?tab=unpaid"
              scroll={false}
              className={[
                'rounded-md px-3 py-2.5 sm:py-1 text-xs font-semibold transition-colors',
                isUnpaidTab ? 'bg-white text-slate-900 shadow-elev-1' : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              Unpaid
            </Link>
          </div>

          <div className="mt-5 space-y-2">
            {loading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-surface-muted animate-pulse" />
            ))}

            {!loading && visibleTickets.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
                  <Ticket className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-900">
                  {isUnpaidTab ? 'No unpaid tickets' : 'No tickets yet'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {isUnpaidTab
                    ? 'You are all caught up on payments.'
                    : 'Your requests will show here once you start one.'}
                </p>
              </div>
            ) : null}

            {!loading && visibleTickets.map((t) => {
              const isUnpaid = t.status === 'UNPAID';
              return (
                <div
                  key={t.id}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-3 transition-colors duration-150 hover:bg-surface-muted"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500 shrink-0">
                    <Ticket className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{t.service?.name ?? 'Paralegal request'}</p>
                    <p className="truncate text-xs text-slate-500">
                      {t.batchNo} · <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{relativeTime(t.createdAt)}</span>
                    </p>
                  </div>
                  <div className="flex w-full items-center justify-end gap-3 sm:w-auto sm:shrink-0">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(Number(t.totalAmount || 0), walletCurrency)}
                    </span>
                    <StatusPill label={t.status.replace(/_/g, ' ')} variant={getStatusVariant(t.status)} />
                    {isUnpaid ? (
                      <Link
                        href={`/consumer/tickets/${t.id}/pay`}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-elev-1 transition-colors hover:bg-brand-600"
                      >
                        Pay now <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {error ? (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                {error}
              </div>
            ) : null}
          </div>
        </PanelCard>

        <div className="space-y-6">
          <PanelCard>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <CalendarClock className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold text-slate-900">Next hearing</h3>
            </div>
            {loading ? (
              <div className="mt-4 h-16 rounded-xl bg-surface-muted animate-pulse" />
            ) : summary?.myNextHearing ? (
              <div className="mt-4 space-y-1">
                <p className="text-base font-semibold tracking-tight text-slate-900">
                  {new Date(summary.myNextHearing.scheduledDate).toLocaleDateString(undefined, {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(summary.myNextHearing.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {summary.myNextHearing.hearingType ? ` · ${summary.myNextHearing.hearingType}` : ''}
                </p>
                <p className="mt-2 text-xs text-slate-600 line-clamp-2">{summary.myNextHearing.case.title}</p>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500">No upcoming hearings scheduled.</p>
            )}
          </PanelCard>

          <PanelCard>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                <Wallet className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold text-slate-900">Need to top up?</h3>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Top up your wallet to pay for tickets automatically on completion.
            </p>
            <Link href="/consumer/my-wallet" className="mt-4 inline-flex">
              <Button variant="subtle" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                Manage wallet
              </Button>
            </Link>
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  hint,
  tone,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  hint?: string;
  tone: 'brand' | 'indigo' | 'emerald' | 'amber';
  loading?: boolean;
}) {
  const tones: Record<typeof tone, string> = {
    brand: 'bg-brand-50 text-brand-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="rounded-2xl bg-surface p-5 ring-1 ring-border-soft shadow-elev-1 transition-shadow duration-200 hover:shadow-elev-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span>
      </div>
      {loading ? (
        <div className="mt-4 h-8 w-24 rounded-md bg-surface-muted animate-pulse" />
      ) : (
        <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</p>
      )}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
