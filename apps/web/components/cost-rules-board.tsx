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
import { Check, Globe2, Briefcase, Calculator, Pencil, Plus, RefreshCw, X } from 'lucide-react';

type CostRuleType = 'service' | 'clerk';

type CostRule = {
  id: string;
  serviceId: string;
  category: string;
  caseType?: string | null;
  province?: string | null;
  audience?: string | null;
  type?: string | null;
  yearFrom: number;
  yearTo: number;
  amount: number;
  isActive: boolean;
};

type RuleForm = {
  serviceId: string;
  category: string;
  caseType: string;
  province: string;
  audience: string;
  type: string;
  yearFrom: string;
  yearTo: string;
  amount: string;
  isActive: boolean;
};

const PROVINCES = [
  'Punjab',
  'Sindh',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Azad Jammu & Kashmir',
  'Gilgit-Baltistan',
  'Islamabad Capital Territory',
];

const emptyForm = (): RuleForm => ({
  serviceId: '',
  category: '',
  caseType: '',
  province: '',
  audience: 'local',
  type: 'local',
  yearFrom: String(new Date().getFullYear()),
  yearTo: String(new Date().getFullYear()),
  amount: '',
  isActive: true,
});

type CostRulesBoardProps = {
  title: string;
  type: CostRuleType;
};

export function CostRulesBoard({ title, type }: CostRulesBoardProps) {
  const [items, setItems] = useState<CostRule[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<RuleForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RuleForm>(emptyForm());

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

  useEffect(() => { load(); }, [load]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const l = search.toLowerCase();
    return items.filter(
      i => i.serviceId.toLowerCase().includes(l) ||
           i.category.toLowerCase().includes(l) ||
           (i.caseType || '').toLowerCase().includes(l)
    );
  }, [items, search]);

  const msg = (text: string) => setMessage(text);

  const buildPayload = (f: RuleForm) => ({
    serviceId: f.serviceId,
    category: f.category,
    caseType: f.caseType || undefined,
    province: f.province || undefined,
    audience: type === 'service' ? f.audience || undefined : undefined,
    type: type === 'service' ? f.type : undefined,
    yearFrom: Number(f.yearFrom),
    yearTo: Number(f.yearTo),
    amount: Number(f.amount),
    isActive: f.isActive,
  });

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const yearFrom = Number(form.yearFrom);
    const yearTo = Number(form.yearTo);
    if (!form.serviceId || !form.category || Number(form.amount) < 0 || yearFrom > yearTo) {
      msg('Provide valid service, category, amount, and year range');
      return;
    }
    try {
      await apiClient.post(endpoint, buildPayload(form));
      msg('Rule created successfully.');
      setForm(emptyForm());
      load();
    } catch (error: any) {
      msg(error.message || 'Create failed');
    }
  };

  const startEdit = (item: CostRule) => {
    setEditingId(item.id);
    setEditForm({
      serviceId: item.serviceId,
      category: item.category,
      caseType: item.caseType ?? '',
      province: item.province ?? '',
      audience: item.audience ?? 'local',
      type: item.type ?? 'local',
      yearFrom: String(item.yearFrom),
      yearTo: String(item.yearTo),
      amount: String(item.amount),
      isActive: item.isActive,
    });
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async (id: string) => {
    const yearFrom = Number(editForm.yearFrom);
    const yearTo = Number(editForm.yearTo);
    if (!editForm.serviceId || !editForm.category || Number(editForm.amount) < 0 || yearFrom > yearTo) {
      msg('Provide valid service, category, amount, and year range');
      return;
    }
    try {
      await apiClient.patch(`${endpoint}/${id}`, buildPayload(editForm));
      msg('Rule updated.');
      setEditingId(null);
      load();
    } catch (error: any) {
      msg(error.message || 'Update failed');
    }
  };

  const RuleFormFields = ({ f, onChange, isService }: { f: RuleForm; onChange: (patch: Partial<RuleForm>) => void; isService: boolean }) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Service ID</span>
          <input className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600" value={f.serviceId} onChange={e => onChange({ serviceId: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Category</span>
          <input className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600" value={f.category} onChange={e => onChange({ category: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Case Type</span>
          <input className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600" placeholder="Optional" value={f.caseType} onChange={e => onChange({ caseType: e.target.value })} />
        </label>
      </div>
      <div className="space-y-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Province</span>
          <select className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600" value={f.province} onChange={e => onChange({ province: e.target.value })}>
            <option value="">All Provinces (Catch-all)</option>
            {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {isService && (
          <>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Audience</span>
              <select className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600" value={f.audience} onChange={e => onChange({ audience: e.target.value })}>
                <option value="local">Local Citizen</option>
                <option value="overseas">Overseas/Expat</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Cost Type</span>
              <select className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600" value={f.type} onChange={e => onChange({ type: e.target.value })}>
                <option value="local">Local (PKR)</option>
                <option value="overseas">Overseas (USD)</option>
              </select>
            </label>
          </>
        )}
      </div>
      <div className="space-y-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Year From</span>
          <input type="number" className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600" value={f.yearFrom} onChange={e => onChange({ yearFrom: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Year To</span>
          <input type="number" className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600" value={f.yearTo} onChange={e => onChange({ yearTo: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 pt-1">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600" checked={f.isActive} onChange={e => onChange({ isActive: e.target.checked })} />
          <span className="text-xs font-medium text-slate-600">Active</span>
        </label>
      </div>
      <div className="space-y-2 flex flex-col justify-end">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Amount (PKR)</span>
          <input type="number" min="0" step="0.01" className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600" value={f.amount} onChange={e => onChange({ amount: e.target.value })} />
        </label>
      </div>
    </div>
  );

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

      {/* Add New Rule */}
      <PanelCard className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary-600" />
          Add New Cost Rule
        </h3>
        <form onSubmit={createRule} className="space-y-4">
          <RuleFormFields f={form} onChange={patch => setForm(c => ({ ...c, ...patch }))} isService={type === 'service'} />
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors">
              <Plus className="h-4 w-4" /> Save Pricing Rule
            </button>
          </div>
        </form>
      </PanelCard>

      {/* Rules Table */}
      <h3 className="text-lg font-semibold text-slate-900 px-1 pt-2">Active Configuration</h3>
      <DataTableShell
        header={
          <FilterBar
            searchPlaceholder="Search rules by service, category or case type..."
            onSearch={setSearch}
          />
        }
      >
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Parameters</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Context</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Validity</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Rate</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredItems.map(item => (
              editingId === item.id ? (
                /* ── Inline edit row ── */
                <tr key={item.id} className="bg-amber-50">
                  <td colSpan={6} className="px-4 py-4">
                    <RuleFormFields
                      f={editForm}
                      onChange={patch => setEditForm(c => ({ ...c, ...patch }))}
                      isService={type === 'service'}
                    />
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        onClick={cancelEdit}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <X className="h-4 w-4" /> Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                      >
                        <Check className="h-4 w-4" /> Save Changes
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                /* ── Read row ── */
                <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-4">
                    <div className="text-sm font-bold text-primary-700">{item.serviceId}</div>
                    <div className="text-xs text-slate-500 flex gap-1 items-center mt-1">
                      <span className="font-semibold">{item.category}</span>
                      {item.caseType && <span className="bg-slate-200 text-slate-700 rounded px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider">{item.caseType}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700 flex flex-col gap-1">
                      {item.province
                        ? <span className="flex items-center gap-1.5"><Globe2 className="h-3 w-3 text-slate-400" />{item.province}</span>
                        : <span className="text-slate-400 italic text-xs">All Provinces</span>}
                      {type === 'service' && <span className="text-xs text-slate-500">Audience: {item.audience || 'Any'}</span>}
                      {type === 'service' && item.type && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-fit ${item.type === 'overseas' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {item.type === 'overseas' ? 'OVERSEAS' : 'LOCAL'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                    {item.yearFrom === item.yearTo
                      ? <span className="font-medium bg-slate-100 rounded px-2 py-1">{item.yearFrom} Only</span>
                      : <span className="font-medium">{item.yearFrom} &rarr; {item.yearTo}</span>}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right">
                    <div className="text-base font-bold text-slate-900">PKR {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right">
                    <StatusPill label={item.isActive ? 'ACTIVE' : 'DISABLED'} variant={item.isActive ? 'success' : 'neutral'} />
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => startEdit(item)}
                      className="sm:opacity-0 sm:group-hover:opacity-100 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-primary-300 hover:text-primary-700 transition-all"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  </td>
                </tr>
              )
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
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
