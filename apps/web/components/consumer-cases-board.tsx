/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  FolderOpen,
  RefreshCw,
  Search,
} from 'lucide-react';
import { casesApi, type Case } from '@/lib/api/cases';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { IconButton } from '@/components/ui/icon-button';
import { useToast } from '@/components/ui/toast';

type FilterTab = 'all' | 'open' | 'closed';

function statusVariant(status: string) {
  if (status === 'OPEN') return 'success' as const;
  if (status === 'CLOSED') return 'neutral' as const;
  return 'warning' as const;
}

export function ConsumerCasesBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [userId, setUserId] = useState('');
  const toast = useToast();

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { id?: string } | null;
      setUserId(u?.id ?? '');
    } catch {}
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await casesApi.listCases({
        search: search || undefined,
        consumerId: userId,
      });
      setCases(result.items || []);
    } catch (err: any) {
      toast.error('Unable to load cases', err?.message);
    } finally {
      setLoading(false);
    }
  }, [search, userId, toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (tab === 'open' && c.status !== 'OPEN') return false;
      if (tab === 'closed' && c.status !== 'CLOSED') return false;
      return true;
    });
  }, [cases, tab]);

  const counts = useMemo(() => ({
    all: cases.length,
    open: cases.filter((c) => c.status === 'OPEN').length,
    closed: cases.filter((c) => c.status === 'CLOSED').length,
  }), [cases]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My cases</h1>
          <p className="mt-1 text-sm text-slate-500">Your legal cases, linked tickets, and hearings.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="all">All <span className="ml-2 text-slate-400 tabular-nums">{counts.all}</span></TabsTrigger>
            <TabsTrigger value="open">Open <span className="ml-2 text-slate-400 tabular-nums">{counts.open}</span></TabsTrigger>
            <TabsTrigger value="closed">Closed <span className="ml-2 text-slate-400 tabular-nums">{counts.closed}</span></TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Input
                placeholder="Search case title or reference"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <IconButton
              variant="solid"
              icon={<RefreshCw className={['h-4 w-4', loading ? 'animate-spin' : ''].join(' ')} />}
              aria-label="Refresh"
              onClick={load}
              disabled={loading}
            />
          </div>
        </div>

        <TabsContent value={tab}>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <PanelCard className="text-center py-16">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
                <FolderOpen className="h-6 w-6" />
              </div>
              <p className="text-base font-semibold text-slate-900">No cases here</p>
              <p className="mt-1 text-sm text-slate-500">Cases appear once your request becomes a legal matter.</p>
            </PanelCard>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((c) => (
                <CaseCard key={c.id} item={c} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CaseCard({ item }: { item: Case }) {
  const ticketsCount = Array.isArray((item as any).tickets) ? (item as any).tickets.length : undefined;
  const nextHearing = (item as any).nextHearing?.scheduledDate as string | undefined;

  return (
    <Link
      href={`/consumer/my-cases/${item.id}`}
      className="group block rounded-2xl bg-surface p-5 ring-1 ring-border-soft shadow-elev-1 transition-[transform,box-shadow] duration-200 ease-silk hover:-translate-y-0.5 hover:shadow-elev-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
            <FolderOpen className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
            <p className="truncate text-xs text-slate-500">{item.caseRef ?? '—'}</p>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 text-slate-300 transition-[transform,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        {item.type ? <span>{item.type}</span> : null}
        {typeof ticketsCount === 'number' ? <span>{ticketsCount} ticket{ticketsCount === 1 ? '' : 's'}</span> : null}
        {nextHearing ? (
          <span className="inline-flex items-center gap-1 text-indigo-700">
            <CalendarClock className="h-3 w-3" />
            {new Date(nextHearing).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <StatusPill dot label={item.status === 'OPEN' ? 'Active' : item.status} variant={statusVariant(item.status)} />
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
          View <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
