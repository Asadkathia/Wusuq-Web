'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { casesApi, type Case } from '@/lib/api/cases';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatusPill } from '@/components/ui/status-pill';
import { FolderOpen, Eye, RefreshCw } from 'lucide-react';

export function ConsumerCasesBoard() {
  const [items, setItems] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { id?: string } | null;
      setUserId(user?.id ?? '');
    } catch {
      setUserId('');
    }
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setMessage('');
    try {
      const result = await casesApi.listCases({
        search: search || undefined,
        status: statusFilter ? (statusFilter as any) : undefined,
        consumerId: userId,
      });
      setItems(result.items || []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const getStatusVariant = (status: string) => {
    if (status === 'OPEN') return 'success' as const;
    if (status === 'CLOSED') return 'neutral' as const;
    return 'warning' as const;
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="My Cases"
        description="Review your case records, linked proceedings, and hearing schedule."
        action={
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft transition-colors hover:bg-surface-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {message && (
        <div className={`rounded-xl border p-4 text-sm font-medium ${message.toLowerCase().includes('failed') ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {message}
        </div>
      )}

      <PanelCard className="p-0 border-slate-200">
        <h3 className="flex items-center gap-2 border-b border-slate-100 p-6 text-lg font-semibold text-slate-900">
          <FolderOpen className="h-5 w-5 text-primary-600" /> Active Cases
        </h3>

        <DataTableShell
          header={
            <FilterBar
              searchPlaceholder="Search case ref or title..."
              onSearch={setSearch}
              actions={
                <select
                  className="rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="CLOSED">Closed</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              }
            />
          }
        >
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Case Info</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Metrics</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono text-primary-600">{item.caseRef}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span>{item.type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusPill label={item.status} variant={getStatusVariant(item.status)} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    <span className="font-medium">{item._count?.tickets || 0}</span> tickets <br />
                    <span className="font-medium">{item._count?.hearings || 0}</span> hearings
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <Link
                      href={`/consumer/my-cases/${item.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-3 py-1.5 font-semibold text-primary-700 transition-colors hover:bg-primary-100"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">
                    No cases found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </DataTableShell>
      </PanelCard>
    </div>
  );
}
