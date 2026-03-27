/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatusPill } from '@/components/ui/status-pill';
import { Plus, RefreshCw, Calculator, Globe2, Briefcase } from 'lucide-react';

type CostRuleType = 'service' | 'clerk';

type CostRule = {
  id: string;
  serviceId: string;
  category: string;
  caseType?: string | null;
  province?: string | null;
  audience?: string | null;
  yearFrom: number;
  yearTo: number;
  amount: number;
  isActive: boolean;
};

type CostRulesBoardProps = {
  title: string;
  type: CostRuleType;
};

export function CostRulesBoard({ title, type }: CostRulesBoardProps) {
  const [items, setItems] = useState<CostRule[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    serviceId: '',
    category: '',
    caseType: '',
    province: '',
    audience: 'local',
    yearFrom: String(new Date().getFullYear()),
    yearTo: String(new Date().getFullYear()),
    amount: '',
    isActive: true,
  });

  const endpoint = type === 'service' ? '/service-costs' : '/clerk-costs';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>(endpoint);
      setItems(result.items ?? []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const l = search.toLowerCase();
    return items.filter(
      i => i.serviceId.toLowerCase().includes(l) || i.category.toLowerCase().includes(l) || (i.caseType || '').toLowerCase().includes(l)
    );
  }, [items, search]);

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    const yearFrom = Number(form.yearFrom);
    const yearTo = Number(form.yearTo);

    if (!form.serviceId || !form.category || amount < 0 || yearFrom > yearTo) {
      setMessage('Provide valid service, category, amount, and year range');
      return;
    }

    try {
      await apiClient.post(endpoint, {
        serviceId: form.serviceId,
        category: form.category,
        caseType: form.caseType || undefined,
        province: form.province || undefined,
        audience: type === 'service' ? form.audience || undefined : undefined,
        yearFrom,
        yearTo,
        amount,
        isActive: form.isActive,
      });
      setMessage('Rule created successfully.');
      setForm(prev => ({ ...prev, amount: '', serviceId: '', category: '' }));
      load();
    } catch (error: any) {
      setMessage(error.message || 'Create failed');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader 
        title={title} 
        description={`Manage the baseline pricing rules applied to ${type === 'service' ? 'services' : 'clerk tasks'} across the system.`}
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
        <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('failed') || message.toLowerCase().includes('valid') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {/* Quick Add Form Array */}
      <PanelCard className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary-600" />
          Add New Cost Rule
        </h3>
        <form onSubmit={createRule} className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          
          <div className="space-y-4 col-span-1 lg:col-span-1 border-r border-slate-100 pr-4">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> Core Matchers</h4>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Service ID</span>
              <input required className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm" placeholder="e.g. SRV-01" value={form.serviceId} onChange={e => setForm(c => ({...c, serviceId: e.target.value}))} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Category</span>
              <input required className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm" placeholder="e.g. Standard" value={form.category} onChange={e => setForm(c => ({...c, category: e.target.value}))} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Case Type (Optional)</span>
              <input className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm" placeholder="e.g. Civil" value={form.caseType} onChange={e => setForm(c => ({...c, caseType: e.target.value}))} />
            </label>
          </div>

          <div className="space-y-4 col-span-1 lg:col-span-1 border-r border-slate-100 pr-4">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><Globe2 className="h-4 w-4" /> Geographic Context</h4>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Province (Optional)</span>
              <select className="mt-1 block w-full rounded-md border-0 py-2 pl-3 pr-8 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" value={form.province} onChange={e => setForm(c => ({...c, province: e.target.value}))}>
                <option value="">All Provinces (Global)</option>
                <option value="Riyadh">Riyadh</option>
                <option value="Makkah">Makkah</option>
                <option value="Eastern Province">Eastern Province</option>
              </select>
            </label>
            {type === 'service' && (
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Audience Segment</span>
                <select className="mt-1 block w-full rounded-md border-0 py-2 pl-3 pr-8 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" value={form.audience} onChange={e => setForm(c => ({...c, audience: e.target.value}))}>
                  <option value="local">Local Citizen</option>
                  <option value="overseas">Overseas/Expat</option>
                </select>
              </label>
            )}
          </div>

          <div className="space-y-4 col-span-1 lg:col-span-1 border-r border-slate-100 pr-4">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><RefreshCw className="h-4 w-4" /> Temporal Validity</h4>
            <div className="flex gap-2">
              <label className="block flex-1">
                <span className="text-xs font-semibold text-slate-600">Start Year</span>
                <input type="number" required className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" value={form.yearFrom} onChange={e => setForm(c => ({...c, yearFrom: e.target.value}))} />
              </label>
              <label className="block flex-1">
                <span className="text-xs font-semibold text-slate-600">End Year</span>
                <input type="number" required className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" value={form.yearTo} onChange={e => setForm(c => ({...c, yearTo: e.target.value}))} />
              </label>
            </div>
            <label className="flex items-center gap-3 pt-3">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600" checked={form.isActive} onChange={e => setForm(c => ({...c, isActive: e.target.checked}))} />
              <span className="text-sm font-medium text-slate-700">Activate rule immediately</span>
            </label>
          </div>

          <div className="space-y-4 col-span-1 lg:col-span-1 flex flex-col justify-end">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Cost Rules Base Amount</span>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="text-slate-500 sm:text-sm">SAR</span>
                </div>
                <input required type="number" min="0" step="0.01" className="block w-full rounded-md border-0 py-2 pl-12 pr-12 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm font-bold text-lg" placeholder="150" value={form.amount} onChange={e => setForm(c => ({...c, amount: e.target.value}))} />
              </div>
            </label>
            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors mt-2">
              <Plus className="h-4 w-4" /> Save Pricing Rule
            </button>
          </div>

        </form>
      </PanelCard>

      <h3 className="text-lg font-semibold text-slate-900 px-1 pt-2">Active Configuration</h3>
      <DataTableShell
        header={
          <FilterBar 
            searchPlaceholder="Search active rules by service or category..."
            onSearch={setSearch}
          />
        }
      >
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Parameters</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Context</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Validity Period</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Rate</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-primary-700">{item.serviceId}</div>
                  <div className="text-xs text-slate-500 flex gap-1 items-center mt-1">
                    <span className="font-semibold">{item.category}</span>
                    {item.caseType && <span className="bg-slate-200 text-slate-700 rounded px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider">{item.caseType}</span>}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-slate-700 flex flex-col gap-1">
                    {item.province ? <span className="flex items-center gap-1.5"><Globe2 className="h-3 w-3 text-slate-400"/> {item.province}</span> : <span className="text-slate-400 italic text-xs">Global Province</span>}
                    {type === 'service' && <span className="text-xs text-slate-500 font-medium">Audience: {item.audience || 'Any'}</span>}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                   {item.yearFrom === item.yearTo ? (
                     <span className="font-medium bg-slate-100 rounded px-2 py-1">{item.yearFrom} Only</span>
                   ) : (
                     <span className="font-medium">{item.yearFrom} &rarr; {item.yearTo}</span>
                   )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="text-base font-bold text-slate-900">SAR {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <StatusPill 
                    label={item.isActive ? 'ACTIVE' : 'DISABLED'}
                    variant={item.isActive ? 'success' : 'neutral'}
                  />
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                  No pricing rules found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}
