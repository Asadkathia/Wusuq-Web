/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import { advanceOnEnter } from '@/lib/form-utils';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatusPill } from '@/components/ui/status-pill';
import {
  Check,
  DollarSign,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type PricingRule = {
  id: string;
  name: string;
  flow: string;
  courtLevel: string | null;
  caseStatus: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  setType: string | null;
  basePrice: string;
  attestedPricePerSet: string;
  nonAttestedPricePerSet: string;
  deliveryCharge: string;
  priority: number;
  isActive: boolean;
  isLegacy: boolean;
  createdAt: string;
  updatedAt: string;
};

type PricingSettings = {
  id: string;
  pricingMode: 'legacy' | 'custom';
  attestedPricePerSet: string;
  nonAttestedPricePerSet: string;
  updatedAt: string;
};

type RuleForm = {
  name: string;
  flow: string;
  courtLevel: string;
  caseStatus: string;
  yearFrom: string;
  yearTo: string;
  setType: string;
  basePrice: string;
  attestedPricePerSet: string;
  nonAttestedPricePerSet: string;
  deliveryCharge: string;
  priority: string;
  isActive: boolean;
};

// ─── Static options ───────────────────────────────────────────────────────────

const FLOWS = [
  { value: 'judicial_case_files', label: 'Case Files' },
  { value: 'judicial_case_information', label: 'Case Information' },
  { value: 'judicial_case_search', label: 'Case Search' },
  { value: 'judicial_case_filing', label: 'Case Filing' },
  { value: 'judicial_power_of_attorney', label: 'Power of Attorney' },
  { value: 'non_judicial_copy_of_fir', label: 'Copy of FIR' },
  { value: 'non_judicial_registry_deed', label: 'Registry / Deed' },
];

const COURT_LEVELS = [
  'Supreme Court',
  'High Court',
  'Federal Shariat Court',
  'Lower Court',
  'Special Court',
];

const CASE_STATUSES = ['Pending Case', 'Decided Case'];

const SET_TYPES = [
  { value: 'attested', label: 'Attested' },
  { value: 'non_attested', label: 'Non-Attested' },
  { value: 'both', label: 'Both' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENDPOINT = '/pricing-rules';

const flowLabel = (value: string) =>
  FLOWS.find(f => f.value === value)?.label ?? value;

const setTypeLabel = (value: string | null) => {
  if (!value) return null;
  return SET_TYPES.find(s => s.value === value)?.label ?? value;
};

const pkr = (value: string | number) =>
  `PKR ${Number(value).toLocaleString('en-PK')}`;

const emptyForm = (): RuleForm => ({
  name: '',
  flow: '',
  courtLevel: '',
  caseStatus: '',
  yearFrom: '',
  yearTo: '',
  setType: '',
  basePrice: '0',
  attestedPricePerSet: '0',
  nonAttestedPricePerSet: '0',
  deliveryCharge: '0',
  priority: '0',
  isActive: true,
});

// ─── Shared select/input class ────────────────────────────────────────────────

const inputCls =
  'mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600';

const selectCls =
  'mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600 bg-white';

// ─── Form fields component ────────────────────────────────────────────────────

function RuleFormFields({
  f,
  onChange,
}: {
  f: RuleForm;
  onChange: (patch: Partial<RuleForm>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Column 1 — Identity */}
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">
            Rule Name <span className="text-rose-500">*</span>
          </span>
          <input
            className={inputCls}
            value={f.name}
            placeholder="e.g. Supreme Court Case Files"
            onChange={e => onChange({ name: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">
            Flow <span className="text-rose-500">*</span>
          </span>
          <select
            className={selectCls}
            value={f.flow}
            onChange={e => onChange({ flow: e.target.value })}
          >
            <option value="">— Select flow —</option>
            {FLOWS.map(fl => (
              <option key={fl.value} value={fl.value}>
                {fl.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">
            Court Level
          </span>
          <select
            className={selectCls}
            value={f.courtLevel}
            onChange={e => onChange({ courtLevel: e.target.value })}
          >
            <option value="">Any (catch-all)</option>
            {COURT_LEVELS.map(cl => (
              <option key={cl} value={cl}>
                {cl}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">
            Case Status
          </span>
          <select
            className={selectCls}
            value={f.caseStatus}
            onChange={e => onChange({ caseStatus: e.target.value })}
          >
            <option value="">Any</option>
            {CASE_STATUSES.map(cs => (
              <option key={cs} value={cs}>
                {cs}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Column 2 — Matching criteria */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="text-xs font-semibold text-slate-500">
              Year From
            </span>
            <input
              type="number"
              className={inputCls}
              placeholder="e.g. 2010"
              value={f.yearFrom}
              onChange={e => onChange({ yearFrom: e.target.value })}
            />
          </label>
          <label className="block flex-1">
            <span className="text-xs font-semibold text-slate-500">
              Year To
            </span>
            <input
              type="number"
              className={inputCls}
              placeholder="e.g. 2024"
              value={f.yearTo}
              onChange={e => onChange({ yearTo: e.target.value })}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Set Type</span>
          <select
            className={selectCls}
            value={f.setType}
            onChange={e => onChange({ setType: e.target.value })}
          >
            <option value="">Any</option>
            {SET_TYPES.map(st => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">
            Priority
          </span>
          <input
            type="number"
            min="0"
            className={inputCls}
            value={f.priority}
            onChange={e => onChange({ priority: e.target.value })}
          />
          <p className="mt-1 text-[10px] text-slate-400">
            Higher = picked first when multiple rules match
          </p>
        </label>

        <label className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
            checked={f.isActive}
            onChange={e => onChange({ isActive: e.target.checked })}
          />
          <span className="text-xs font-medium text-slate-600">Active</span>
        </label>
      </div>

      {/* Column 3 — Pricing */}
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">
            Base Price PKR <span className="text-rose-500">*</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputCls}
            value={f.basePrice}
            onChange={e => onChange({ basePrice: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">
            Attested Price / Set PKR <span className="text-rose-500">*</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputCls}
            value={f.attestedPricePerSet}
            onChange={e => onChange({ attestedPricePerSet: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">
            Non-Attested Price / Set PKR <span className="text-rose-500">*</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputCls}
            value={f.nonAttestedPricePerSet}
            onChange={e => onChange({ nonAttestedPricePerSet: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-500">
            Delivery Charge PKR <span className="text-rose-500">*</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputCls}
            value={f.deliveryCharge}
            onChange={e => onChange({ deliveryCharge: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

// ─── Main board ───────────────────────────────────────────────────────────────

export function PricingRulesBoard() {
  const [items, setItems] = useState<PricingRule[]>([]);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Settings (legacy toggle + global per-set rates)
  const [settings, setSettings] = useState<{
    pricingMode: 'legacy' | 'custom';
    attestedPricePerSet: string;
    nonAttestedPricePerSet: string;
  } | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [globalAttested, setGlobalAttested] = useState('');
  const [globalNonAttested, setGlobalNonAttested] = useState('');

  // Add-form visibility
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<RuleForm>(emptyForm());

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RuleForm>(emptyForm());

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const [filterFlow, setFilterFlow] = useState('');
  const [filterCourtLevel, setFilterCourtLevel] = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>(ENDPOINT);
      setItems(Array.isArray(result) ? result : (result.items ?? []));
    } catch (error: any) {
      setMessage({ text: error.message || 'Failed to load pricing rules', ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    apiClient.get<PricingSettings>('/pricing-rules/settings').then((s) => {
      setSettings({ pricingMode: s.pricingMode, attestedPricePerSet: s.attestedPricePerSet, nonAttestedPricePerSet: s.nonAttestedPricePerSet });
      setGlobalAttested(s.attestedPricePerSet);
      setGlobalNonAttested(s.nonAttestedPricePerSet);
    }).catch(() => {});
  }, [load]);

  // ── Filter ────────────────────────────────────────────────────────────────

  const isLegacyMode = settings?.pricingMode === 'legacy';

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Only show rules matching the current pricing mode
      if (isLegacyMode && !item.isLegacy) return false;
      if (!isLegacyMode && item.isLegacy) return false;
      if (filterFlow && item.flow !== filterFlow) return false;
      if (filterCourtLevel && item.courtLevel !== filterCourtLevel) return false;
      return true;
    });
  }, [items, filterFlow, filterCourtLevel, isLegacyMode]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const msg = (text: string, ok = true) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4000);
  };

  // ── Settings handlers ─────────────────────────────────────────────────────

  const togglePricingMode = async () => {
    if (!settings) return;
    const nextMode = settings.pricingMode === 'legacy' ? 'custom' : 'legacy';
    // Optimistic update
    setSettings(s => s ? { ...s, pricingMode: nextMode } : s);
    try {
      await apiClient.patch<PricingSettings>('/pricing-rules/settings', { pricingMode: nextMode });
    } catch (error: any) {
      // Revert on failure
      setSettings(s => s ? { ...s, pricingMode: settings.pricingMode } : s);
      msg(error.message || 'Failed to update pricing mode.', false);
    }
  };

  const saveGlobalRates = async () => {
    setSettingsSaving(true);
    try {
      const updated = await apiClient.patch<PricingSettings>('/pricing-rules/settings', {
        attestedPricePerSet: parseFloat(globalAttested) || 0,
        nonAttestedPricePerSet: parseFloat(globalNonAttested) || 0,
      });
      setSettings(s => s ? { ...s, attestedPricePerSet: updated.attestedPricePerSet, nonAttestedPricePerSet: updated.nonAttestedPricePerSet } : s);
      msg('Global rates saved.');
    } catch (error: any) {
      msg(error.message || 'Failed to save rates.', false);
    } finally {
      setSettingsSaving(false);
    }
  };

  const validateForm = (f: RuleForm): string | null => {
    if (!f.name.trim()) return 'Rule name is required.';
    if (!f.flow) return 'Flow is required.';
    if (Number(f.basePrice) < 0) return 'Base price must be ≥ 0.';
    if (f.yearFrom && f.yearTo && Number(f.yearFrom) > Number(f.yearTo))
      return 'Year From must be ≤ Year To.';
    return null;
  };

  const buildPayload = (f: RuleForm) => ({
    name: f.name.trim(),
    flow: f.flow,
    courtLevel: f.courtLevel || null,
    caseStatus: f.caseStatus || null,
    yearFrom: f.yearFrom ? Number(f.yearFrom) : null,
    yearTo: f.yearTo ? Number(f.yearTo) : null,
    setType: f.setType || null,
    basePrice: Number(f.basePrice),
    attestedPricePerSet: Number(f.attestedPricePerSet),
    nonAttestedPricePerSet: Number(f.nonAttestedPricePerSet),
    deliveryCharge: Number(f.deliveryCharge),
    priority: Number(f.priority),
    isActive: f.isActive,
  });

  // ── Create ────────────────────────────────────────────────────────────────

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateForm(form);
    if (err) { msg(err, false); return; }
    setSaving(true);
    try {
      await apiClient.post(ENDPOINT, buildPayload(form));
      msg('Pricing rule created.');
      setForm(emptyForm());
      setShowAddForm(false);
      load();
    } catch (error: any) {
      msg(error.message || 'Create failed.', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────

  const startEdit = (item: PricingRule) => {
    setShowAddForm(false);
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      flow: item.flow,
      courtLevel: item.courtLevel ?? '',
      caseStatus: item.caseStatus ?? '',
      yearFrom: item.yearFrom != null ? String(item.yearFrom) : '',
      yearTo: item.yearTo != null ? String(item.yearTo) : '',
      setType: item.setType ?? '',
      basePrice: item.basePrice,
      attestedPricePerSet: item.attestedPricePerSet,
      nonAttestedPricePerSet: item.nonAttestedPricePerSet,
      deliveryCharge: item.deliveryCharge,
      priority: String(item.priority),
      isActive: item.isActive,
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: string) => {
    const err = validateForm(editForm);
    if (err) { msg(err, false); return; }
    setSaving(true);
    try {
      await apiClient.patch(`${ENDPOINT}/${id}`, buildPayload(editForm));
      msg('Pricing rule updated.');
      setEditingId(null);
      load();
    } catch (error: any) {
      msg(error.message || 'Update failed.', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Active toggle ─────────────────────────────────────────────────────────

  const toggleActive = async (item: PricingRule) => {
    try {
      await apiClient.patch(`${ENDPOINT}/${item.id}`, { isActive: !item.isActive });
      setItems(prev =>
        prev.map(r => r.id === item.id ? { ...r, isActive: !r.isActive } : r)
      );
    } catch (error: any) {
      msg(error.message || 'Toggle failed.', false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const confirmDelete = async (id: string) => {
    setSaving(true);
    try {
      await apiClient.delete(`${ENDPOINT}/${id}`);
      msg('Rule deleted.');
      setDeletingId(null);
      setItems(prev => prev.filter(r => r.id !== id));
    } catch (error: any) {
      msg(error.message || 'Delete failed.', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Pricing Rules"
        description="Manage per-flow pricing rules. The highest-priority matching rule sets the ticket price."
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
            {!isLegacyMode && (
              <button
                onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
              >
                {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {showAddForm ? 'Cancel' : 'Add Rule'}
              </button>
            )}
          </div>
        }
      />

      {/* Feedback message */}
      {message && (
        <div
          className={`p-4 rounded-xl text-sm font-medium ${
            message.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ── Settings Panel ──────────────────────────────────────────────────── */}
      <PanelCard className="p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">

          {/* Section A — Legacy Pricing Toggle */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Pricing Mode
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={isLegacyMode}
                aria-label="Legacy Pricing"
                onClick={togglePricingMode}
                disabled={!settings}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:opacity-50 ${
                  isLegacyMode ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                    isLegacyMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Legacy Pricing
                </p>
                <p className="text-xs text-slate-500">
                  {settings === null
                    ? 'Loading…'
                    : isLegacyMode
                    ? 'Using legacy rate card (2026)'
                    : 'Using custom pricing rules'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {settings === null ? '' : isLegacyMode
                ? 'Prices from the official 2026 rate card are active. Custom rules below are inactive.'
                : 'Custom rules below are active. Add or edit rules to control pricing.'}
            </p>
          </div>

          {isLegacyMode && <div className="hidden sm:block w-px self-stretch bg-slate-200" />}
          {isLegacyMode && <div className="sm:hidden h-px w-full bg-slate-200" />}

          {/* Section B — Global Per-Set Rates (legacy mode only) */}
          {isLegacyMode && <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Global Per-Set Rates
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">
                  Attested Price / Set (PKR)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={globalAttested}
                  disabled={settings === null}
                  onChange={e => setGlobalAttested(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">
                  Non-Attested Price / Set (PKR)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={globalNonAttested}
                  disabled={settings === null}
                  onChange={e => setGlobalNonAttested(e.target.value)}
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              These rates apply uniformly across all flows and court levels.
            </p>
            <div className="mt-3">
              <button
                onClick={saveGlobalRates}
                disabled={settings === null || settingsSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {settingsSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save Rates
              </button>
            </div>
          </div>}
        </div>
      </PanelCard>

      {/* ── Add Rule Form ───────────────────────────────────────────────────── */}
      {showAddForm && !isLegacyMode && (
        <PanelCard className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary-600" />
            New Pricing Rule
          </h3>
          <form onSubmit={createRule} onKeyDown={advanceOnEnter} className="space-y-4">
            <RuleFormFields f={form} onChange={patch => setForm(c => ({ ...c, ...patch }))} />
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Save Rule
              </button>
            </div>
          </form>
        </PanelCard>
      )}

      {/* ── Rules Table ─────────────────────────────────────────────────────── */}
      <h3 className="text-lg font-semibold text-slate-900 px-1 pt-2">
        {isLegacyMode ? 'Legacy Rate Card' : 'Custom Pricing Rules'}
      </h3>

      {isLegacyMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          These are the seeded legacy rates — read-only while legacy mode is active.
        </div>
      )}

      <DataTableShell
        header={
          <FilterBar
            filters={
              <div className="flex items-center gap-2 flex-wrap">
                {/* Flow filter */}
                <select
                  className="rounded-lg border-0 py-1.5 px-3 text-sm text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 bg-white"
                  value={filterFlow}
                  onChange={e => setFilterFlow(e.target.value)}
                >
                  <option value="">All Flows</option>
                  {FLOWS.map(fl => (
                    <option key={fl.value} value={fl.value}>
                      {fl.label}
                    </option>
                  ))}
                </select>

                {/* Court level filter */}
                <select
                  className="rounded-lg border-0 py-1.5 px-3 text-sm text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 bg-white"
                  value={filterCourtLevel}
                  onChange={e => setFilterCourtLevel(e.target.value)}
                >
                  <option value="">All Court Levels</option>
                  {COURT_LEVELS.map(cl => (
                    <option key={cl} value={cl}>
                      {cl}
                    </option>
                  ))}
                </select>

                {(filterFlow || filterCourtLevel) && (
                  <button
                    onClick={() => { setFilterFlow(''); setFilterCourtLevel(''); }}
                    className="text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            }
          />
        }
      >
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Name / Flow
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Matching Criteria
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Base Price
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Attested / Set
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Non-Att. / Set
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Delivery
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                Active
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {/* Loading skeleton */}
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-400" />
                  Loading pricing rules…
                </td>
              </tr>
            )}

            {!loading && filteredItems.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">
                  No pricing rules found.
                  {(filterFlow || filterCourtLevel) && (
                    <span className="ml-1 text-slate-400">Try clearing the filters.</span>
                  )}
                </td>
              </tr>
            )}

            {filteredItems.map(item =>
              editingId === item.id && !isLegacyMode ? (
                // ── Inline edit row ──
                <tr key={item.id} className="bg-amber-50">
                  <td colSpan={9} className="px-4 py-4">
                    <RuleFormFields
                      f={editForm}
                      onChange={patch => setEditForm(c => ({ ...c, ...patch }))}
                    />
                    <div className="flex justify-end gap-2 mt-4">
                      <button
                        onClick={cancelEdit}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <X className="h-4 w-4" /> Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(item.id)}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        <Check className="h-4 w-4" /> Save Changes
                      </button>
                    </div>
                  </td>
                </tr>
              ) : deletingId === item.id && !isLegacyMode ? (
                // ── Delete confirmation row ──
                <tr key={item.id} className="bg-rose-50">
                  <td colSpan={9} className="px-4 py-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-rose-800">
                        Delete rule <span className="font-bold">&ldquo;{item.name}&rdquo;</span>? This cannot be undone.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setDeletingId(null)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <X className="h-4 w-4" /> Cancel
                        </button>
                        <button
                          onClick={() => confirmDelete(item.id)}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                // ── Normal row ──
                <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                  {/* Name / Flow */}
                  <td className="px-4 py-4">
                    <div className="text-sm font-bold text-slate-900">{item.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="inline-block rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        {flowLabel(item.flow)}
                      </span>
                    </div>
                  </td>

                  {/* Matching criteria */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1 text-xs text-slate-600">
                      {item.courtLevel ? (
                        <span>{item.courtLevel}</span>
                      ) : (
                        <span className="italic text-slate-400">Any court</span>
                      )}
                      {item.caseStatus ? (
                        <span>{item.caseStatus}</span>
                      ) : (
                        <span className="italic text-slate-400">Any status</span>
                      )}
                      {item.yearFrom != null || item.yearTo != null ? (
                        <span className="font-medium text-slate-700">
                          {item.yearFrom ?? '?'}&nbsp;&rarr;&nbsp;{item.yearTo ?? '?'}
                        </span>
                      ) : (
                        <span className="italic text-slate-400">Any year</span>
                      )}
                      {item.setType ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 w-fit">
                          {setTypeLabel(item.setType)}
                        </span>
                      ) : (
                        <span className="italic text-slate-400">Any set type</span>
                      )}
                    </div>
                  </td>

                  {/* Prices */}
                  <td className="px-4 py-4 whitespace-nowrap text-right">
                    <span className="text-sm font-bold text-slate-900">
                      {pkr(item.basePrice)}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-slate-700">
                    {pkr(item.attestedPricePerSet)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-slate-700">
                    {pkr(item.nonAttestedPricePerSet)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-slate-700">
                    {pkr(item.deliveryCharge)}
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-4 whitespace-nowrap text-center">
                    <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                      {item.priority}
                    </span>
                  </td>

                  {/* Active toggle */}
                  <td className="px-4 py-4 whitespace-nowrap text-center">
                    {isLegacyMode ? (
                      <span
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent opacity-50 cursor-not-allowed ${
                          item.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 ${
                            item.isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </span>
                    ) : (
                      <button
                        onClick={() => toggleActive(item)}
                        title={item.isActive ? 'Deactivate' : 'Activate'}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1 ${
                          item.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                            item.isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-4 whitespace-nowrap text-right">
                    {!isLegacyMode && (
                      <div className="flex items-center justify-end gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-primary-300 hover:text-primary-700 transition-all"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => setDeletingId(item.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}
