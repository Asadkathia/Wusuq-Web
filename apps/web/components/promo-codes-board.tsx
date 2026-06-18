/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { StatusPill } from '@/components/ui/status-pill';
import { Plus, RefreshCw, X, Tag } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type PromoType = 'PERCENT' | 'FIXED';

type PromoCode = {
  id: string;
  code: string;
  type: PromoType;
  value: number;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  totalUsageLimit: number | null;
  perUserLimit: number | null;
  serviceScope: string[];
  active: boolean;
  createdAt: string;
};

type CreateForm = {
  code: string;
  type: PromoType;
  value: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  totalUsageLimit: string;
  perUserLimit: string;
  serviceScope: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  'mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600';

const selectCls =
  'mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600 bg-white';

const emptyForm = (): CreateForm => ({
  code: '',
  type: 'PERCENT',
  value: '',
  maxDiscount: '',
  startsAt: '',
  endsAt: '',
  totalUsageLimit: '',
  perUserLimit: '',
  serviceScope: '',
});

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtValue(code: PromoCode): string {
  if (code.type === 'PERCENT') {
    const cap = code.maxDiscount != null ? ` (cap PKR ${code.maxDiscount.toLocaleString('en-PK')})` : '';
    return `${code.value}%${cap}`;
  }
  return `PKR ${code.value.toLocaleString('en-PK')}`;
}

// ─── Main board ───────────────────────────────────────────────────────────────

export function PromoCodesBoard() {
  const [items, setItems] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>('/promos');
      const list: PromoCode[] = Array.isArray(result) ? result : (result.items ?? []);
      startTransition(() => {
        setItems(list);
        setLoading(false);
      });
    } catch (error: any) {
      startTransition(() => setLoading(false));
      setMessage({ text: error.message || 'Failed to load promo codes', ok: false });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const msg = (text: string, ok = true) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4000);
  };

  // ── Create ────────────────────────────────────────────────────────────────

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) { msg('Code is required.', false); return; }
    const val = parseFloat(form.value);
    if (isNaN(val) || val <= 0) { msg('Value must be a positive number.', false); return; }
    if (form.type === 'PERCENT' && val > 100) { msg('Percent value must be between 0 and 100.', false); return; }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: val,
      };
      if (form.maxDiscount) payload.maxDiscount = parseFloat(form.maxDiscount);
      if (form.startsAt) payload.startsAt = new Date(form.startsAt).toISOString();
      if (form.endsAt)   payload.endsAt   = new Date(form.endsAt).toISOString();
      if (form.totalUsageLimit) payload.totalUsageLimit = parseInt(form.totalUsageLimit, 10);
      if (form.perUserLimit) payload.perUserLimit = parseInt(form.perUserLimit, 10);
      if (form.serviceScope.trim()) {
        payload.serviceScope = form.serviceScope
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      }

      await apiClient.post('/promos', payload);
      msg('Promo code created.');
      setForm(emptyForm());
      setShowForm(false);
      load();
    } catch (error: any) {
      msg(error.message || 'Create failed.', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Deactivate ────────────────────────────────────────────────────────────

  const deactivate = async (id: string) => {
    setDeactivating(id);
    try {
      await apiClient.post(`/promos/${id}/deactivate`);
      msg('Promo code deactivated.');
      setItems(prev => prev.map(p => p.id === id ? { ...p, active: false } : p));
      load();
    } catch (error: any) {
      msg(error.message || 'Deactivation failed.', false);
    } finally {
      setDeactivating(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Promo Codes"
        description="Create and manage promotional discount codes for consumers."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowForm(v => !v)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? 'Cancel' : 'New Code'}
            </button>
          </div>
        }
      />

      {/* Feedback */}
      {message && (
        <div
          className={`rounded-xl p-4 text-sm font-medium ${
            message.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ── Create Form ─────────────────────────────────────────────────────── */}
      {showForm && (
        <PanelCard className="p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary-600" />
            New Promo Code
          </h3>
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Column 1 */}
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">
                    Code <span className="text-rose-500">*</span>
                  </span>
                  <input
                    className={inputCls}
                    value={form.code}
                    placeholder="e.g. SAVE10"
                    onChange={e => setForm(c => ({ ...c, code: e.target.value }))}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">
                    Type <span className="text-rose-500">*</span>
                  </span>
                  <select
                    className={selectCls}
                    value={form.type}
                    onChange={e => setForm(c => ({ ...c, type: e.target.value as PromoType }))}
                  >
                    <option value="PERCENT">Percent (%)</option>
                    <option value="FIXED">Fixed Amount (PKR)</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">
                    Value <span className="text-rose-500">*</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    value={form.value}
                    placeholder={form.type === 'PERCENT' ? 'e.g. 10' : 'e.g. 500'}
                    onChange={e => setForm(c => ({ ...c, value: e.target.value }))}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    {form.type === 'PERCENT' ? 'Percentage discount (0–100).' : 'Fixed PKR discount amount.'}
                  </p>
                </label>

                {form.type === 'PERCENT' && (
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-500">Max Discount (PKR)</span>
                    <input
                      type="number"
                      min="0"
                      className={inputCls}
                      value={form.maxDiscount}
                      placeholder="Optional cap"
                      onChange={e => setForm(c => ({ ...c, maxDiscount: e.target.value }))}
                    />
                  </label>
                )}
              </div>

              {/* Column 2 */}
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">Starts At</span>
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={form.startsAt}
                    onChange={e => setForm(c => ({ ...c, startsAt: e.target.value }))}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">Ends At</span>
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={form.endsAt}
                    onChange={e => setForm(c => ({ ...c, endsAt: e.target.value }))}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">Total Usage Limit</span>
                  <input
                    type="number"
                    min="1"
                    className={inputCls}
                    value={form.totalUsageLimit}
                    placeholder="Unlimited if blank"
                    onChange={e => setForm(c => ({ ...c, totalUsageLimit: e.target.value }))}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">Per-User Limit</span>
                  <input
                    type="number"
                    min="1"
                    className={inputCls}
                    value={form.perUserLimit}
                    placeholder="Unlimited if blank"
                    onChange={e => setForm(c => ({ ...c, perUserLimit: e.target.value }))}
                  />
                </label>
              </div>

              {/* Column 3 */}
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500">Service Scope</span>
                  <input
                    className={inputCls}
                    value={form.serviceScope}
                    placeholder="e.g. judicial_case_files, judicial_case_search"
                    onChange={e => setForm(c => ({ ...c, serviceScope: e.target.value }))}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Comma-separated flow keys. Leave blank to apply to all services.
                  </p>
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create Code
              </button>
            </div>
          </form>
        </PanelCard>
      )}

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <DataTableShell>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Code
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Type / Value
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Window
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                Limits
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Scope
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-400" />
                  Loading promo codes…
                </td>
              </tr>
            )}

            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                  No promo codes yet. Create the first one using the button above.
                </td>
              </tr>
            )}

            {items.map(item => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                {/* Code */}
                <td className="px-4 py-4">
                  <span className="inline-block rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold tracking-wider text-indigo-700 font-mono">
                    {item.code}
                  </span>
                </td>

                {/* Type / Value */}
                <td className="px-4 py-4">
                  <div className="text-sm font-semibold text-slate-900">{fmtValue(item)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{item.type}</div>
                </td>

                {/* Window */}
                <td className="px-4 py-4">
                  <div className="text-xs text-slate-600">
                    <span>{fmtDate(item.startsAt)}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span>{fmtDate(item.endsAt)}</span>
                  </div>
                </td>

                {/* Limits */}
                <td className="px-4 py-4 text-center">
                  <div className="text-xs text-slate-600 space-y-0.5">
                    <div>
                      Total:{' '}
                      <span className="font-semibold text-slate-900">
                        {item.totalUsageLimit ?? '∞'}
                      </span>
                    </div>
                    <div>
                      Per user:{' '}
                      <span className="font-semibold text-slate-900">
                        {item.perUserLimit ?? '∞'}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Scope */}
                <td className="px-4 py-4">
                  {item.serviceScope.length === 0 ? (
                    <span className="text-xs italic text-slate-400">All services</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {item.serviceScope.map(s => (
                        <span
                          key={s}
                          className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-4 text-center">
                  <StatusPill
                    label={item.active ? 'Active' : 'Inactive'}
                    variant={item.active ? 'success' : 'neutral'}
                  />
                </td>

                {/* Actions */}
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  {item.active && (
                    <button
                      onClick={() => deactivate(item.id)}
                      disabled={deactivating === item.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50 transition-all sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      {deactivating === item.id ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}
