'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { PanelCard } from '@/components/ui/panel-card';
import { Check, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaxSettings = {
  rate: number;    // stored as fraction, e.g. 0.17
  enabled: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  'mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600';

// ─── Component ────────────────────────────────────────────────────────────────

export function TaxSettingsForm() {
  // Display as a percentage string; converted to fraction on save
  const [rateDisplay, setRateDisplay] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<TaxSettings>('/settings/tax');
      // fraction → percent, up to 2 decimal places
      const pct = String(Math.round(data.rate * 10000) / 100);
      startTransition(() => {
        setRateDisplay(pct);
        setEnabled(data.enabled);
        setLoading(false);
      });
    } catch {
      startTransition(() => setLoading(false));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const msg = (text: string, ok = true) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4000);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(rateDisplay);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      msg('Rate must be a number between 0 and 100.', false);
      return;
    }
    setSaving(true);
    try {
      await apiClient.put('/settings/tax', { rate: parsed / 100, enabled });
      msg('Tax settings saved.');
    } catch (error: unknown) {
      msg((error as { message?: string }).message ?? 'Save failed.', false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelCard className="p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
        Tax Settings
      </p>

      {message && (
        <div
          className={`mb-4 rounded-lg p-3 text-sm font-medium ${
            message.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          {/* Rate input */}
          <label className="block flex-1 max-w-xs">
            <span className="text-xs font-semibold text-slate-500">
              Tax Rate (%) <span className="text-rose-500">*</span>
            </span>
            <div className="relative mt-1">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className={inputCls + ' pr-8'}
                value={rateDisplay}
                onChange={e => setRateDisplay(e.target.value)}
                placeholder="e.g. 17"
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-sm text-slate-400 pointer-events-none">
                %
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Enter as a percentage — e.g. <strong>17</strong> for 17% GST.
              Stored internally as a fraction (17 → 0.17).
            </p>
          </label>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3 pb-1">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Tax enabled"
              onClick={() => setEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 ${
                enabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-slate-700">
              {enabled ? 'Tax enabled' : 'Tax disabled'}
            </span>
          </div>

          {/* Save */}
          <div className="pb-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save Tax Settings
            </button>
          </div>
        </form>
      )}
    </PanelCard>
  );
}
