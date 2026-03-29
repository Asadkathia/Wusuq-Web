/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Check, Pencil, Plus, RefreshCw, X, AlertTriangle } from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusPill } from '@/components/ui/status-pill';

type Service = {
  id: string;
  name: string;
  category: string;
  type: string;
  isActive: boolean;
};

type BaseCost = {
  id: string;
  serviceId: string;
  pricingTier: 'local' | 'overseas';
  amount: number;
  isActive: boolean;
  note: string | null;
  service: { id: string; name: string; category: string; type: string };
};

type ServiceRow = {
  service: Service;
  local: BaseCost | null;
  overseas: BaseCost | null;
};

type EditState = {
  id: string | null; // null = new
  serviceId: string;
  pricingTier: 'local' | 'overseas';
  amount: string;
  note: string;
  isActive: boolean;
};

const emptyEdit = (serviceId = '', tier: 'local' | 'overseas' = 'local'): EditState => ({
  id: null,
  serviceId,
  pricingTier: tier,
  amount: '',
  note: '',
  isActive: true,
});

export function ServiceBaseCostsBoard() {
  const [services, setServices] = useState<Service[]>([]);
  const [baseCosts, setBaseCosts] = useState<BaseCost[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [editState, setEditState] = useState<EditState | null>(null);
  const [addForm, setAddForm] = useState<{ serviceId: string; localAmount: string; overseasAmount: string; note: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const svcRes = await apiClient.get<any>('/services');
      setServices((Array.isArray(svcRes) ? svcRes : (svcRes.items ?? [])) as Service[]);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load services');
    }

    try {
      const costRes = await apiClient.get<any>('/service-base-costs');
      setBaseCosts(costRes.items ?? []);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load base costs');
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build per-service rows merging service list with base costs
  const rows: ServiceRow[] = services
    .filter(s => s.isActive)
    .map(s => ({
      service: s,
      local: baseCosts.find(c => c.serviceId === s.id && c.pricingTier === 'local') ?? null,
      overseas: baseCosts.find(c => c.serviceId === s.id && c.pricingTier === 'overseas') ?? null,
    }));

  const missingCount = rows.filter(r => !r.local && !r.overseas).length;

  const startEdit = (cost: BaseCost) => {
    setEditState({
      id: cost.id,
      serviceId: cost.serviceId,
      pricingTier: cost.pricingTier,
      amount: String(cost.amount),
      note: cost.note ?? '',
      isActive: cost.isActive,
    });
  };

  const startNew = (serviceId: string, tier: 'local' | 'overseas') => {
    setEditState(emptyEdit(serviceId, tier));
  };

  const cancelEdit = () => setEditState(null);

  const saveEdit = async () => {
    if (!editState) return;
    const amount = Number(editState.amount);
    if (isNaN(amount) || amount < 0) { setMessage('Enter a valid amount'); return; }
    try {
      if (editState.id) {
        await apiClient.patch(`/service-base-costs/${editState.id}`, {
          amount,
          note: editState.note || undefined,
          isActive: editState.isActive,
        });
      } else {
        await apiClient.post('/service-base-costs', {
          serviceId: editState.serviceId,
          pricingTier: editState.pricingTier,
          amount,
          note: editState.note || undefined,
          isActive: editState.isActive,
        });
      }
      setMessage('Saved.');
      setEditState(null);
      load();
    } catch (err: any) {
      setMessage(err.message || 'Save failed');
    }
  };

  const saveAdd = async () => {
    if (!addForm) return;
    const local = Number(addForm.localAmount);
    const overseas = Number(addForm.overseasAmount);
    if (!addForm.serviceId) { setMessage('Select a service'); return; }
    if (isNaN(local) || local < 0 || isNaN(overseas) || overseas < 0) { setMessage('Enter valid amounts'); return; }
    try {
      await Promise.all([
        local > 0 && apiClient.post('/service-base-costs', { serviceId: addForm.serviceId, pricingTier: 'local', amount: local, note: addForm.note || undefined }),
        overseas > 0 && apiClient.post('/service-base-costs', { serviceId: addForm.serviceId, pricingTier: 'overseas', amount: overseas, note: addForm.note || undefined }),
      ].filter(Boolean));
      setMessage('Base costs added.');
      setAddForm(null);
      load();
    } catch (err: any) {
      setMessage(err.message || 'Save failed');
    }
  };

  const removeCost = async (id: string) => {
    try {
      await apiClient.delete(`/service-base-costs/${id}`);
      setMessage('Disabled.');
      load();
    } catch (err: any) {
      setMessage(err.message || 'Failed');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Base Service Pricing"
        description="Set the default cost for each service. Local (PKR) is charged to local citizens. Overseas (USD) is converted to PKR at ticket creation time using the current exchange rate."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setAddForm({ serviceId: '', localAmount: '', overseasAmount: '', note: '' })}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Pricing
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('fail') || message.toLowerCase().includes('valid') || message.toLowerCase().includes('select') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {missingCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{missingCount} service{missingCount !== 1 ? 's' : ''}</span> have no base pricing set. Tickets for these services will default to 0 unless a cost rule exists.
          </p>
        </div>
      )}

      {/* Add Pricing Panel */}
      {addForm && (
        <PanelCard className="p-6 border-2 border-slate-900">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Add Base Pricing</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Service</span>
              <select
                className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
                value={addForm.serviceId}
                onChange={e => setAddForm(f => f && ({ ...f, serviceId: e.target.value }))}
              >
                <option value="">Select service…</option>
                {services.filter(s => s.isActive).map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Local Amount (PKR)</span>
              <input
                type="number" min="0" step="0.01"
                className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
                value={addForm.localAmount}
                onChange={e => setAddForm(f => f && ({ ...f, localAmount: e.target.value }))}
                placeholder="e.g. 5000"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Overseas Amount (USD)</span>
              <input
                type="number" min="0" step="0.01"
                className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
                value={addForm.overseasAmount}
                onChange={e => setAddForm(f => f && ({ ...f, overseasAmount: e.target.value }))}
                placeholder="e.g. 25"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Note (optional)</span>
              <input
                type="text"
                className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
                value={addForm.note}
                onChange={e => setAddForm(f => f && ({ ...f, note: e.target.value }))}
                placeholder="Optional note"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setAddForm(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <X className="h-4 w-4" /> Cancel
            </button>
            <button onClick={saveAdd} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
              <Check className="h-4 w-4" /> Save
            </button>
          </div>
        </PanelCard>
      )}

      {/* Pricing Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Service</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Category</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Local (PKR)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Overseas (USD → PKR)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {rows.map(({ service, local, overseas }) => {
              const isEditingLocal = editState?.serviceId === service.id && editState.pricingTier === 'local';
              const isEditingOverseas = editState?.serviceId === service.id && editState.pricingTier === 'overseas';
              const hasNeither = !local && !overseas;

              return (
                <tr key={service.id} className={`group transition-colors ${hasNeither ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-4">
                    <div className="text-sm font-semibold text-slate-900">{service.name}</div>
                    {hasNeither && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 mt-1 inline-block">NO PRICING SET</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded px-2 py-0.5">{service.category}</span>
                  </td>

                  {/* Local cell */}
                  <td className="px-4 py-4 text-right">
                    {isEditingLocal ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="number" min="0" step="0.01" autoFocus
                          className="w-28 rounded border border-slate-300 py-1 px-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-600"
                          value={editState.amount}
                          onChange={e => setEditState(s => s && ({ ...s, amount: e.target.value }))}
                        />
                        <button onClick={saveEdit} className="rounded bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={cancelEdit} className="rounded bg-slate-200 p-1.5 text-slate-600 hover:bg-slate-300 transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : local ? (
                      <div className="flex items-center justify-end gap-2">
                        <div>
                          <div className={`text-sm font-bold ${local.isActive ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                            PKR {Number(local.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                          {local.note && <div className="text-[10px] text-slate-400">{local.note}</div>}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(local)} className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-primary-700 hover:border-primary-300 transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                          {local.isActive && (
                            <button onClick={() => removeCost(local.id)} className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-rose-700 hover:border-rose-300 transition-colors">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => startNew(service.id, 'local')}
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-primary-700 transition-all"
                      >
                        <Plus className="h-3 w-3" /> Set PKR
                      </button>
                    )}
                  </td>

                  {/* Overseas cell */}
                  <td className="px-4 py-4 text-right">
                    {isEditingOverseas ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-xs text-slate-500">USD</span>
                        <input
                          type="number" min="0" step="0.01" autoFocus
                          className="w-28 rounded border border-slate-300 py-1 px-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-600"
                          value={editState.amount}
                          onChange={e => setEditState(s => s && ({ ...s, amount: e.target.value }))}
                        />
                        <button onClick={saveEdit} className="rounded bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={cancelEdit} className="rounded bg-slate-200 p-1.5 text-slate-600 hover:bg-slate-300 transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : overseas ? (
                      <div className="flex items-center justify-end gap-2">
                        <div>
                          <div className={`text-sm font-bold ${overseas.isActive ? 'text-blue-700' : 'text-slate-400 line-through'}`}>
                            USD {Number(overseas.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-400">converted to PKR at creation</div>
                          {overseas.note && <div className="text-[10px] text-slate-400">{overseas.note}</div>}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(overseas)} className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-primary-700 hover:border-primary-300 transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                          {overseas.isActive && (
                            <button onClick={() => removeCost(overseas.id)} className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-rose-700 hover:border-rose-300 transition-colors">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => startNew(service.id, 'overseas')}
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-blue-700 transition-all"
                      >
                        <Plus className="h-3 w-3" /> Set USD
                      </button>
                    )}
                  </td>

                  <td className="px-4 py-4 text-right">
                    {local?.isActive || overseas?.isActive
                      ? <StatusPill label="ACTIVE" variant="success" />
                      : hasNeither
                      ? <StatusPill label="UNSET" variant="neutral" />
                      : <StatusPill label="DISABLED" variant="neutral" />
                    }
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                  {loading ? 'Loading…' : 'No services found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
