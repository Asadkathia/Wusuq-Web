/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, File, FileImage, FileText, Folder, RefreshCw, Search } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { PanelCard } from '@/components/ui/panel-card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { documentCategoryLabel } from '@wusuq/shared';

type DocumentItem = {
  id: string;
  name: string;
  type: string;
  category?: string | null;
  caption?: string | null;
  fileUrl: string;
  createdAt: string;
  ticket?: {
    id: string;
    batchNo: string;
    consumer?: { id: string; name: string };
  } | null;
};

function iconFor(type: string) {
  const t = (type ?? '').toLowerCase();
  if (t.includes('pdf')) return <FileText className="h-5 w-5 text-rose-500" />;
  if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg'))
    return <FileImage className="h-5 w-5 text-indigo-500" />;
  return <File className="h-5 w-5 text-slate-400" />;
}

// Short file-kind badge from the MIME type (PDF / Image / File) — complements
// the document-category heading without repeating it.
function fileKindLabel(type: string): string {
  const t = (type ?? '').toLowerCase();
  if (t.includes('pdf')) return 'PDF';
  if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg')) return 'Image';
  if (t.includes('word') || t.includes('doc')) return 'Doc';
  return 'File';
}

export function ConsumerDocumentsBoard() {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');
  const toast = useToast();

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
      setUserId(u?.id ?? '');
    } catch {}
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: '200', consumerId: userId });
      const r = await apiClient.get<{ items?: DocumentItem[] }>(`/documents?${q.toString()}`);
      setItems(r.items ?? []);
    } catch (err: any) {
      toast.error('Unable to load documents', err?.message);
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (d) =>
        d.name.toLowerCase().includes(s) ||
        (d.ticket?.batchNo ?? '').toLowerCase().includes(s),
    );
  }, [items, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My documents</h1>
          <p className="mt-1 text-sm text-slate-500">Final documents from your completed tickets.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Input
              placeholder="Search by name or batch"
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

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <PanelCard className="text-center py-16">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
            <Folder className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-slate-900">No documents yet</p>
          <p className="mt-1 text-sm text-slate-500">They&rsquo;ll appear here as tickets are completed.</p>
        </PanelCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="group rounded-2xl bg-surface p-4 ring-1 ring-border-soft shadow-elev-1 transition-[box-shadow,transform] duration-200 ease-silk hover:-translate-y-0.5 hover:shadow-elev-2"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted">
                  {iconFor(doc.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {documentCategoryLabel(doc.category)}
                  </p>
                  {doc.caption ? (
                    <p className="truncate text-xs text-slate-600">{doc.caption}</p>
                  ) : null}
                  <p className="mt-0.5 truncate text-xs text-slate-400">{doc.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {doc.ticket?.batchNo ? (
                      <>
                        <span className="font-mono">{doc.ticket.batchNo}</span> ·{' '}
                      </>
                    ) : null}
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <StatusPill dot label={fileKindLabel(doc.type)} variant="brand" />
                <button
                  type="button"
                  disabled={!doc.ticket?.id}
                  onClick={async () => {
                    if (!doc.ticket?.id) return;
                    try {
                      const { blob, filename } = await apiClient.getBlob(
                        `/tickets/${doc.ticket.id}/documents/${doc.id}/download`,
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = filename || doc.name || 'document';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (err: any) {
                      toast.error('Download failed', err?.message);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
