'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { casesApi, type Case } from '@/lib/api/cases';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatusPill } from '@/components/ui/status-pill';
import { Plus, RefreshCw, FolderOpen, Eye, Trash2 } from 'lucide-react';

const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'] as const;

export function CasesBoard() {
  const [items, setItems] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hasRecommendations, setHasRecommendations] = useState(false);

  const [createForm, setCreateForm] = useState({
    title: '',
    type: 'JUDICIAL',
  });
  
  const [userId, setUserId] = useState<string>('');
  const [isConsumer, setIsConsumer] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
      if (u) {
        setUserId(u.id);
        setIsConsumer(CONSUMER_ROLES.includes(u.role as (typeof CONSUMER_ROLES)[number]));
      }
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await casesApi.listCases({
        search: search || undefined,
        status: (statusFilter as any) || undefined,
        consumerId: isConsumer && userId ? userId : undefined,
        hasRecommendations: hasRecommendations || undefined,
      });
      setItems(result.items || []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, isConsumer, userId, hasRecommendations]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return setMessage('You must be logged in to create a case');
    try {
      await casesApi.createCase({
        title: createForm.title,
        type: createForm.type,
        consumerId: userId,
      });
      setMessage('Case created successfully');
      setCreateForm({ title: '', type: 'JUDICIAL' });
      load();
    } catch (error: any) {
      setMessage(error.message || 'Failed to create case');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this case? All associated hearings will be deleted, and tickets unlinked.')) return;
    try {
      await casesApi.deleteCase(id);
      setMessage('Case deleted');
      load();
    } catch (error: any) {
      setMessage(error.message || 'Failed to delete case');
    }
  };

  const getStatusVariant = (st: string) => {
    if (st === 'OPEN') return 'success';
    if (st === 'CLOSED') return 'neutral';
    return 'warning';
  };

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Cases Master Board" 
        description="Group your legal proceedings, view timelines, and track tickets in context."
        action={
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('failed') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main List */}
        <div className="xl:col-span-2 space-y-6">
          <PanelCard className="p-0 border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-100 p-6 flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary-600" /> Active Cases
            </h3>
            <DataTableShell header={
              <FilterBar 
                searchPlaceholder="Search case ref or title..." 
                onSearch={setSearch} 
                actions={
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => setHasRecommendations((v) => !v)}
                      className={[
                        'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                        hasRecommendations
                          ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600'
                          : 'bg-surface text-slate-700 ring-1 ring-inset ring-border-soft hover:bg-surface-hover',
                      ].join(' ')}
                    >
                      ✨ Has suggestions
                    </button>
                    <select
                      className="w-full sm:w-auto rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                    >
                      <option value="">All Statuses</option>
                      <option value="OPEN">Open</option>
                      <option value="CLOSED">Closed</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </div>
                }
              />
            }>
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Case Info</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Metrics</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                        <div className="text-xs text-slate-500 mt-1 flex gap-2 items-center">
                          <span className="font-mono text-primary-600">{item.caseRef}</span>
                          <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                          <span>{item.type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusPill 
                          label={item.status}
                          variant={getStatusVariant(item.status)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-700">
                           <span className="font-medium">{item._count?.tickets || 0}</span> tickets
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/cases/${item.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 font-semibold transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </Link>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-rose-400 hover:text-rose-600 p-1.5 ml-1"
                            title="Delete Case"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && !loading && (
                     <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">No cases found.</td></tr>
                  )}
                </tbody>
              </table>
            </DataTableShell>
          </PanelCard>
        </div>

        {/* Side Panel: Create */}
        <div className="space-y-6">
          <PanelCard className="p-6 border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2 border-b border-slate-100 pb-4">
              <Plus className="h-5 w-5 text-primary-600" /> Open New Case
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 block mb-1">Title</span>
                <input 
                  required 
                  className="w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" 
                  placeholder="e.g. Property Dispute vs Ali" 
                  value={createForm.title} 
                  onChange={e => setCreateForm(c => ({...c, title: e.target.value}))} 
                />
              </label>
              
              <label className="block">
                <span className="text-sm font-medium text-slate-700 block mb-1">Case Type</span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                   <button 
                     type="button" 
                     onClick={() => setCreateForm(c => ({...c, type: 'JUDICIAL'}))}
                     className={`py-2 text-sm font-semibold rounded-lg border ${createForm.type === 'JUDICIAL' ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                   >
                     Judicial
                   </button>
                   <button 
                     type="button" 
                     onClick={() => setCreateForm(c => ({...c, type: 'NON_JUDICIAL'}))}
                     className={`py-2 text-sm font-semibold rounded-lg border ${createForm.type === 'NON_JUDICIAL' ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                   >
                     Non-Judicial
                   </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Select the domain of law to properly configure the default contextual fields.
                </p>
              </label>

              <button type="submit" className="w-full mt-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors">
                Create Case
              </button>
            </form>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
