/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, FileEdit, MapPin, RefreshCw, Trash2 } from 'lucide-react';
import { FLOW_LABELS, flowKeyToSlug, type FlowKey } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { PanelCard } from '@/components/ui/panel-card';
import { Skeleton } from '@/components/ui/skeleton';
import { IconButton } from '@/components/ui/icon-button';
import { useToast } from '@/components/ui/toast';

type DraftRow = {
  id: string;
  flow: string;
  step: number;
  payload?: Record<string, any> | null;
  updatedAt: string;
  createdAt: string;
};

function relativeTime(iso?: string) {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function isFlowKey(value: string): value is FlowKey {
  return value in FLOW_LABELS;
}

function flowCategory(flow: string): 'judicial' | 'non-judicial' | null {
  if (flow.startsWith('judicial_')) return 'judicial';
  if (flow.startsWith('non_judicial_')) return 'non-judicial';
  return null;
}

function draftHref(flow: string): string | null {
  const cat = flowCategory(flow);
  if (!cat || !isFlowKey(flow)) return null;
  return `/consumer/paralegal-services/${cat}/${flowKeyToSlug(flow)}`;
}

function flowLabel(flow: string): string {
  return isFlowKey(flow) ? FLOW_LABELS[flow] : flow;
}

export function DraftsBoard() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<DraftRow[]>('/tickets/intake-drafts');
      setDrafts(Array.isArray(result) ? result : []);
    } catch (err: any) {
      toast.error('Unable to load drafts', err?.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const rows = useMemo(() => drafts, [drafts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Drafts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pick up any request right where you left off.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            variant="solid"
            icon={<RefreshCw className={['h-4 w-4', loading ? 'animate-spin' : ''].join(' ')} />}
            aria-label="Refresh"
            onClick={loadDrafts}
            disabled={loading}
          />
          <Link href="/consumer/paralegal-services/judicial">
            <Button variant="brand" size="md" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Start a new request
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <PanelCard className="text-center py-16">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
            <FileEdit className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-slate-900">No drafts yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Start a request from Paralegal Services and it&rsquo;ll save here automatically.
          </p>
          <Link href="/consumer/paralegal-services/judicial" className="mt-5 inline-flex">
            <Button variant="subtle" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
              Browse services
            </Button>
          </Link>
        </PanelCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onDeleted={(id) => setDrafts((prev) => prev.filter((d) => d.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  onDeleted,
}: {
  draft: DraftRow;
  onDeleted: (id: string) => void;
}) {
  const href = draftHref(draft.flow);
  const label = flowLabel(draft.flow);
  const city =
    typeof draft.payload?.city === 'string' && draft.payload.city.trim().length > 0
      ? draft.payload.city
      : null;
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (deleting) return;
      if (!window.confirm('Delete this draft? This cannot be undone.')) return;
      setDeleting(true);
      try {
        await apiClient.delete(`/tickets/intake-drafts/${draft.id}`);
        onDeleted(draft.id);
      } catch (err: any) {
        toast.error('Unable to delete draft', err?.message);
      } finally {
        setDeleting(false);
      }
    },
    [deleting, draft.id, onDeleted, toast],
  );

  const inner = (
    <div className="group h-full text-left rounded-2xl bg-surface p-5 ring-1 ring-border-soft shadow-elev-1 transition-[transform,box-shadow] duration-200 ease-silk hover:-translate-y-0.5 hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500 shrink-0">
            <FileEdit className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{label}</p>
            <p className="truncate text-xs text-slate-500">
              Last edited {relativeTime(draft.updatedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Delete draft"
            onClick={handleDelete}
            disabled={deleting}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <ArrowUpRight className="h-4 w-4 text-slate-300 transition-[transform,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-500" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        {city ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {city}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 text-slate-500">
          Step {draft.step + 1}
        </span>
      </div>

      <div className="mt-4">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
          Resume
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );

  if (!href) {
    return <div>{inner}</div>;
  }

  return <Link href={href}>{inner}</Link>;
}
