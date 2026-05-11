'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { advanceOnEnter } from '@/lib/form-utils';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { Plus, RefreshCw, TrendingUp } from 'lucide-react';

type ExchangeRate = {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveAt: string;
  createdAt: string;
};

export function ExchangeRateBoard() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    fromCurrency: 'PKR',
    toCurrency: 'USD',
    rate: '',
    effectiveAt: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<ExchangeRate[]>('/currency/rates');
      setRates(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Failed to load rates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const msg = (text: string) => { setMessage(text); setTimeout(() => setMessage(''), 4000); };

  const addRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = Number(form.rate);
    if (!form.fromCurrency || !form.toCurrency || !rate || rate <= 0) {
      msg('Provide valid currencies and a positive rate');
      return;
    }
    try {
      await apiClient.post('/currency/rates', {
        from: form.fromCurrency.toUpperCase().trim(),
        to: form.toCurrency.toUpperCase().trim(),
        rate,
        effectiveAt: new Date(form.effectiveAt).toISOString(),
      });
      msg('Rate saved successfully');
      setForm(p => ({ ...p, rate: '' }));
      load();
    } catch (e: unknown) {
      msg(e instanceof Error ? e.message : 'Failed to save rate');
    }
  };

  // Latest rate for PKR→USD for display
  const latestPkrUsd = rates.find(r => r.fromCurrency === 'PKR' && r.toCurrency === 'USD');

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Exchange Rates"
        description="Manage PKR↔USD rates used for overseas ticket pricing. The rate effective on the ticket's creation date is applied."
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
        <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('fail') || message.toLowerCase().includes('valid') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {/* Current rate summary */}
      {latestPkrUsd && (
        <PanelCard className="p-4 flex items-center gap-4 bg-violet-50 border-violet-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
            <TrendingUp className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-violet-500 uppercase tracking-wider">Current PKR → USD Rate</p>
            <p className="text-2xl font-bold text-violet-900">1 PKR = {Number(latestPkrUsd.rate).toFixed(6)} USD</p>
            <p className="text-xs text-violet-400 mt-0.5">Effective {new Date(latestPkrUsd.effectiveAt).toLocaleDateString('en-PK')}</p>
          </div>
        </PanelCard>
      )}

      {/* Add rate form */}
      <PanelCard className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary-600" />
          Add Exchange Rate
        </h3>
        <form onSubmit={addRate} onKeyDown={advanceOnEnter} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">From Currency</span>
            <input
              className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm uppercase"
              placeholder="PKR"
              value={form.fromCurrency}
              onChange={e => setForm(p => ({ ...p, fromCurrency: e.target.value.toUpperCase() }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">To Currency</span>
            <input
              className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm uppercase"
              placeholder="USD"
              value={form.toCurrency}
              onChange={e => setForm(p => ({ ...p, toCurrency: e.target.value.toUpperCase() }))}
            />
          </label>
          <label className="block lg:col-span-1">
            <span className="text-xs font-semibold text-slate-600">Rate (1 From = ? To)</span>
            <input
              type="number"
              step="0.000001"
              min="0.000001"
              required
              className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
              placeholder="0.003571"
              value={form.rate}
              onChange={e => setForm(p => ({ ...p, rate: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Effective Date</span>
            <input
              type="date"
              required
              className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
              value={form.effectiveAt}
              onChange={e => setForm(p => ({ ...p, effectiveAt: e.target.value }))}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors h-[38px]"
          >
            <Plus className="h-4 w-4" /> Save Rate
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-400">
          Example: PKR → USD at 0.003571 means 1 PKR = 0.003571 USD (≈ 280 PKR per USD). The rate on the ticket&apos;s creation date is used for overseas pricing.
        </p>
      </PanelCard>

      {/* Rate history table */}
      <DataTableShell>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Pair</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Rate</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Effective Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {rates.map(r => (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="font-semibold text-slate-900">{r.fromCurrency}</span>
                  <span className="text-slate-400 mx-1">→</span>
                  <span className="font-semibold text-slate-900">{r.toCurrency}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm text-slate-700">
                  {Number(r.rate).toFixed(6)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                  {new Date(r.effectiveAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                  {new Date(r.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
                </td>
              </tr>
            ))}
            {!loading && rates.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500">
                  No exchange rates defined yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}
