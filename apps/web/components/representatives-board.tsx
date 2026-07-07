/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { advanceOnEnter } from '@/lib/form-utils';
import { PAYMENT_MODES, courtTierFromCourtType, type PaymentMode } from '@wusuq/shared';
import { SectionHeader } from '@/components/ui/section-header';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatusPill } from '@/components/ui/status-pill';
import { RefreshCw, UserPlus, Phone, MapPin, Briefcase, Pencil, X, MonitorPlay } from 'lucide-react';

// ---------------------------------------------------------------------------
// Static catalog — mirrors seeded services in the database. Courts are no
// longer a static catalog (C4/C5): they are fetched live from
// `/geo/cities/:id/courts`, keyed on the city selected in the territory
// cascade below, so the picker always reflects real seeded CourtSeat rows.
// ---------------------------------------------------------------------------
type ServiceEntry = { id: number; name: string };

const SERVICES: ServiceEntry[] = [
  { id: 1, name: 'Lower Court Paralegal Service' },
  { id: 2, name: 'Special Court Paralegal Service' },
  { id: 3, name: 'High Court Paralegal Service' },
  { id: 4, name: 'Federal Shariat Court Paralegal Service' },
  { id: 5, name: 'Supreme Court Paralegal Service' },
  { id: 6, name: 'Registry/Deed Paralegal Service' },
  { id: 7, name: 'FIR' },
];

// Shape of `/geo/cities/:id/courts` — mirrors CityCourt/CityCourtGroup in
// intake-wizard/types.ts (kept local here to avoid coupling to the wizard's
// type module for an unrelated admin screen).
type CityCourt = { id: string; name: string; isPrincipalSeat: boolean };
type CityCourtGroup = { type: string; courts: CityCourt[] };

const PAYOUT_METHOD_LABELS: Record<PaymentMode, string> = {
  BANK_TRANSFER: 'Bank Transfer',
  JAZZ_CASH: 'JazzCash',
  EASY_PAISA: 'EasyPaisa',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type RepData = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  court: string | null;
  courtCity: string | null;
  courtLevel: string | null;
  serviceFocus: string | null;
  payoutMethod: string | null;
  payoutBankName: string | null;
  payoutAccountTitle: string | null;
  payoutAccountNumber: string | null;
  payoutJazzCash: string | null;
  payoutEasyPaisa: string | null;
  isActive: boolean;
};

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  address: '',
  serviceFocus: '',   // stores service name
  serviceId: '',      // internal – drives the Service label select
  court: '',
  courtLevel: '',      // derived from the picked court's live seat type
  province: '',
  district: '',
  city: '',
  payoutMethod: '',
  payoutBankName: '',
  payoutAccountTitle: '',
  payoutAccountNumber: '',
  payoutJazzCash: '',
  payoutEasyPaisa: '',
};

type FormState = typeof emptyForm;

type GeoOpt = { id: string; name: string };

const INPUT_CLS =
  'mt-1 block w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm';
const SELECT_CLS =
  'mt-1 block w-full rounded-lg border-0 py-2 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function RepresentativesBoard() {
  const [reps, setReps] = useState<RepData[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editRep, setEditRep] = useState<RepData | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Cascading geo dropdowns for the clerk's territory: Province → District →
  // City/Tehsil. Driven by GeoCity ids; the form stores the chosen NAMES
  // (matching how district/city were stored as free text before).
  const [provinces, setProvinces] = useState<GeoOpt[]>([]);
  const [districts, setDistricts] = useState<GeoOpt[]>([]);
  const [cities, setCities] = useState<GeoOpt[]>([]);
  const [provinceId, setProvinceId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [cityId, setCityId] = useState('');

  // Live courts for the selected city (C4/C5) — replaces the old hardcoded
  // COURTS catalog. Grouped by court type (Lower/Special/High/Shariat/
  // Supreme) exactly like the intake wizard's `/geo/cities/:id/courts` fetch.
  const [courtGroups, setCourtGroups] = useState<CityCourtGroup[]>([]);
  const [courtsLoaded, setCourtsLoaded] = useState(false);

  // Effects only FETCH on a truthy id (no synchronous setState in the body —
  // see the react-hooks/set-state-in-effect convention). Clearing happens in
  // the select onChange handlers and openCreate/openEdit.
  useEffect(() => {
    apiClient.get<GeoOpt[]>('/geo/provinces').then((p) => setProvinces(p ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!provinceId) return;
    apiClient.get<GeoOpt[]>(`/geo/provinces/${provinceId}/districts`).then((d) => setDistricts(d ?? [])).catch(() => {});
  }, [provinceId]);
  useEffect(() => {
    if (!districtId) return;
    apiClient.get<GeoOpt[]>(`/geo/districts/${districtId}/cities`).then((c) => setCities(c ?? [])).catch(() => {});
  }, [districtId]);
  useEffect(() => {
    if (!cityId) return;
    apiClient
      .get<CityCourtGroup[]>(`/geo/cities/${cityId}/courts`)
      .then((groups) => setCourtGroups(groups ?? []))
      .catch(() => setCourtGroups([]))
      .finally(() => setCourtsLoaded(true));
  }, [cityId]);

  // Edit pre-fill: resolve stored province/district/city NAMES back to ids so
  // the dependent dropdowns (incl. the live court fetch, keyed on cityId)
  // populate and show the saved values.
  const resolveGeoForEdit = useCallback(async (provName: string | null, distName: string | null, cityName: string | null) => {
    setProvinceId(''); setDistrictId(''); setDistricts([]); setCities([]);
    setCityId(''); setCourtGroups([]); setCourtsLoaded(false);
    if (!provName) return;
    const provs = await apiClient.get<GeoOpt[]>('/geo/provinces').catch(() => [] as GeoOpt[]);
    setProvinces(provs ?? []);
    const prov = (provs ?? []).find((p) => p.name === provName);
    if (!prov) return;
    setProvinceId(prov.id);
    const dists = (await apiClient.get<GeoOpt[]>(`/geo/provinces/${prov.id}/districts`).catch(() => [] as GeoOpt[])) ?? [];
    setDistricts(dists);
    const dist = dists.find((d) => d.name === distName);
    if (!dist) return;
    setDistrictId(dist.id);
    const cs = (await apiClient.get<GeoOpt[]>(`/geo/districts/${dist.id}/cities`).catch(() => [] as GeoOpt[])) ?? [];
    setCities(cs);
    const city = cs.find((c) => c.name === cityName);
    if (city) setCityId(city.id);
  }, []);

  // Flat court list (id/name/type) derived from the live groups, used both to
  // render <option>s and to resolve courtLevel when one is picked.
  const courtOptions = useMemo(
    () => courtGroups.flatMap((g) => g.courts.map((c) => ({ id: c.id, name: c.name, type: g.type }))),
    [courtGroups],
  );
  // The <select>'s value is derived, not stored — it reconciles automatically
  // once courtOptions loads (edit pre-fill) or when the user picks a court.
  const selectedCourtId = useMemo(
    () => courtOptions.find((o) => o.name === form.court)?.id ?? '',
    [courtOptions, form.court],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await apiClient.get<any>('/users?limit=200');
      const allUsers: any[] = result.items ?? [];
      setReps(allUsers.filter((u) => u.role === 'representative'));
    } catch (error: any) {
      setMessage(error.message || 'Failed to load representatives');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const territory = (rep: RepData) =>
    [rep.city, rep.district].filter(Boolean).join(', ') || '—';

  const filtered = reps.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    territory(r).toLowerCase().includes(search.toLowerCase()) ||
    (r.court ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.serviceFocus ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  // Resolve serviceId from a stored serviceFocus name (for edit pre-fill)
  const serviceIdFromName = (name: string | null) => {
    const svc = SERVICES.find((s) => s.name === name);
    return svc ? String(svc.id) : '';
  };

  const openCreate = () => {
    setEditRep(null);
    setForm(emptyForm);
    setProvinceId(''); setDistrictId(''); setDistricts([]); setCities([]);
    setCityId(''); setCourtGroups([]); setCourtsLoaded(false);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (rep: RepData) => {
    const sid = serviceIdFromName(rep.serviceFocus);
    setEditRep(rep);
    setForm({
      name: rep.name,
      email: rep.email,
      phone: rep.phone ?? '',
      password: '',
      address: rep.address ?? '',
      serviceFocus: rep.serviceFocus ?? '',
      serviceId: sid,
      court: rep.court ?? '',
      courtLevel: rep.courtLevel ?? '',
      province: rep.province ?? '',
      district: rep.district ?? '',
      city: rep.city ?? '',
      payoutMethod: rep.payoutMethod ?? '',
      payoutBankName: rep.payoutBankName ?? '',
      payoutAccountTitle: rep.payoutAccountTitle ?? '',
      payoutAccountNumber: rep.payoutAccountNumber ?? '',
      payoutJazzCash: rep.payoutJazzCash ?? '',
      payoutEasyPaisa: rep.payoutEasyPaisa ?? '',
    });
    resolveGeoForEdit(rep.province, rep.district, rep.city);
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditRep(null);
  };

  const setField = (key: keyof FormState, value: string) =>
    setForm((c) => ({ ...c, [key]: value }));

  const handleServiceChange = (serviceId: string) => {
    const svc = SERVICES.find((s) => s.id === Number(serviceId));
    setForm((c) => ({
      ...c,
      serviceId,
      serviceFocus: svc?.name ?? '',
    }));
  };

  const handleCourtChange = (courtId: string) => {
    const opt = courtOptions.find((o) => o.id === courtId);
    setForm((c) => ({
      ...c,
      court: opt?.name ?? '',
      courtLevel: opt ? (courtTierFromCourtType(opt.type) ?? '') : '',
    }));
  };

  const handlePayoutMethodChange = (method: string) => {
    setForm((c) => ({
      ...c,
      payoutMethod: method,
      payoutBankName: method === 'BANK_TRANSFER' ? c.payoutBankName : '',
      payoutAccountTitle: method === 'BANK_TRANSFER' ? c.payoutAccountTitle : '',
      payoutAccountNumber: method === 'BANK_TRANSFER' ? c.payoutAccountNumber : '',
      payoutJazzCash: method === 'JAZZ_CASH' ? c.payoutJazzCash : '',
      payoutEasyPaisa: method === 'EASY_PAISA' ? c.payoutEasyPaisa : '',
    }));
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) return setFormError('Name is required.');
    if (!editRep && !form.email.trim()) return setFormError('Email is required.');
    if (!editRep && !form.password.trim()) return setFormError('Password is required.');

    setSaving(true);
    try {
      if (editRep) {
        const payload: Record<string, string> = {
          name: form.name,
          phone: form.phone,
          address: form.address,
          serviceFocus: form.serviceFocus,
          court: form.court,
          courtLevel: form.courtLevel,
          province: form.province,
          district: form.district,
          city: form.city,
          payoutMethod: form.payoutMethod,
          payoutBankName: form.payoutBankName,
          payoutAccountTitle: form.payoutAccountTitle,
          payoutAccountNumber: form.payoutAccountNumber,
          payoutJazzCash: form.payoutJazzCash,
          payoutEasyPaisa: form.payoutEasyPaisa,
        };
        if (form.password.trim()) payload.password = form.password;
        await apiClient.patch(`/users/${editRep.id}`, payload);
        setMessage(`${form.name} updated successfully.`);
      } else {
        await apiClient.post('/users/representatives', {
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          address: form.address || undefined,
          serviceFocus: form.serviceFocus || undefined,
          court: form.court || undefined,
          courtLevel: form.courtLevel || undefined,
          province: form.province || undefined,
          district: form.district || undefined,
          city: form.city || undefined,
          payoutMethod: form.payoutMethod || undefined,
          payoutBankName: form.payoutBankName || undefined,
          payoutAccountTitle: form.payoutAccountTitle || undefined,
          payoutAccountNumber: form.payoutAccountNumber || undefined,
          payoutJazzCash: form.payoutJazzCash || undefined,
          payoutEasyPaisa: form.payoutEasyPaisa || undefined,
        });
        setMessage(`${form.name} created successfully.`);
      }
      closeModal();
      load();
    } catch (error: any) {
      setFormError(error.message || 'An error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const impersonate = async (rep: RepData) => {
    if (!confirm(`Impersonate ${rep.name}? You will be logged in as them.`)) return;
    try {
      const result = await apiClient.post<any>(`/auth/impersonate/${rep.id}`);
      // Stash current admin session so we can restore it later
      localStorage.setItem('wusuq_impersonator_access_token', localStorage.getItem('wusuq_access_token') ?? '');
      localStorage.setItem('wusuq_impersonator_refresh_token', localStorage.getItem('wusuq_refresh_token') ?? '');
      localStorage.setItem('wusuq_impersonator_user', localStorage.getItem('wusuq_user') ?? '');
      localStorage.setItem('wusuq_access_token', result.accessToken);
      localStorage.setItem('wusuq_refresh_token', result.refreshToken);
      localStorage.setItem('wusuq_user', JSON.stringify(result.user));
      window.location.href = '/dashboard';
    } catch (error: any) {
      setMessage(error.message || 'Impersonation failed');
    }
  };

  const toggleActive = async (rep: RepData) => {
    try {
      await apiClient.post(`/users/${rep.id}/${rep.isActive ? 'deactivate' : 'activate'}`);
      setMessage(`${rep.name} ${rep.isActive ? 'deactivated' : 'activated'}.`);
      load();
    } catch (error: any) {
      setMessage(error.message || 'Toggle failed');
    }
  };

  // Reusable text-input helper
  const textField = (label: string, key: keyof FormState, opts?: { required?: boolean; type?: string }) => (
    <label key={key} className="block">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {opts?.required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      <input
        required={opts?.required}
        type={opts?.type ?? 'text'}
        className={INPUT_CLS}
        value={form[key]}
        onChange={(e) => setField(key, e.target.value)}
      />
    </label>
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Representatives"
        description="Monitor field representatives, their active workloads, and territory assignments."
        action={
          <div className="flex gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Add Representative
            </button>
          </div>
        }
      />

      {message && (
        <div className={`rounded-lg p-4 text-sm font-medium border ${message.toLowerCase().includes('fail') || message.toLowerCase().includes('error') ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
          {message}
        </div>
      )}

      <DataTableShell
        header={
          <FilterBar
            searchPlaceholder="Search representatives by name, location, court, or focus..."
            onSearch={setSearch}
          />
        }
      >
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Representative</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Court / Focus</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filtered.map((rep) => (
              <tr key={rep.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-primary-100 flex items-center justify-center font-bold text-primary-700">
                      {rep.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{rep.name}</div>
                      <div className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <Phone className="h-3 w-3" /> {rep.phone || '—'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    {territory(rep)}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 flex-shrink-0 text-slate-400" />
                      <span className="text-sm font-medium text-slate-900">{rep.court || '—'}</span>
                    </div>
                    {rep.serviceFocus && (
                      <span className="text-xs text-slate-500 pl-6">{rep.serviceFocus}</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusPill
                    label={rep.isActive ? 'ACTIVE' : 'INACTIVE'}
                    variant={rep.isActive ? 'success' : 'neutral'}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => impersonate(rep)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      title="Impersonate"
                    >
                      <MonitorPlay className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openEdit(rep)}
                      className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleActive(rep)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${rep.isActive ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}
                    >
                      {rep.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                  {loading ? 'Loading...' : 'No representatives found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>

      {/* ------------------------------------------------------------------ */}
      {/* Create / Edit Modal                                                  */}
      {/* ------------------------------------------------------------------ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-slate-100 mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">
                {editRep ? 'Edit Representative' : 'Add Representative'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} onKeyDown={advanceOnEnter} className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* ── Territory: Province → District → City/Tehsil ── */}
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Province</span>
                <select
                  className={SELECT_CLS}
                  value={provinceId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = provinces.find((p) => p.id === id)?.name ?? '';
                    setProvinceId(id);
                    setDistrictId('');
                    setDistricts([]);
                    setCities([]);
                    setCityId('');
                    setCourtGroups([]);
                    setCourtsLoaded(false);
                    setForm((c) => ({ ...c, province: name, district: '', city: '', court: '', courtLevel: '' }));
                  }}
                >
                  <option value="">— Select Province —</option>
                  {provinces.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">District</span>
                <select
                  className={`${SELECT_CLS} disabled:bg-slate-50 disabled:text-slate-400`}
                  value={districtId}
                  disabled={!provinceId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = districts.find((d) => d.id === id)?.name ?? '';
                    setDistrictId(id);
                    setCities([]);
                    setCityId('');
                    setCourtGroups([]);
                    setCourtsLoaded(false);
                    setForm((c) => ({ ...c, district: name, city: '', court: '', courtLevel: '' }));
                  }}
                >
                  <option value="">{provinceId ? '— Select District —' : 'Select a province first'}</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">City / Tehsil</span>
                <select
                  className={`${SELECT_CLS} disabled:bg-slate-50 disabled:text-slate-400`}
                  value={cityId}
                  disabled={!districtId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = cities.find((c) => c.id === id)?.name ?? '';
                    setCityId(id);
                    setCourtGroups([]);
                    setCourtsLoaded(false);
                    setForm((c) => ({ ...c, city: name, court: '', courtLevel: '' }));
                  }}
                >
                  <option value="">{districtId ? '— Select City/Tehsil —' : 'Select a district first'}</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              {/* ── Service (label/filter only — court comes from live seats) ── */}
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Select Service</span>
                <select
                  className={SELECT_CLS}
                  value={form.serviceId}
                  onChange={(e) => handleServiceChange(e.target.value)}
                >
                  <option value="">— Select Service —</option>
                  {SERVICES.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>

              {/* ── Court (live, keyed on the selected city) ── */}
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Select Court</span>
                <select
                  className={`${SELECT_CLS} disabled:bg-slate-50 disabled:text-slate-400`}
                  value={selectedCourtId}
                  disabled={!cityId}
                  onChange={(e) => handleCourtChange(e.target.value)}
                >
                  <option value="">
                    {!cityId
                      ? 'Select a city first'
                      : !courtsLoaded
                        ? 'Loading courts…'
                        : courtOptions.length === 0
                          ? 'No courts available'
                          : '— Select Court —'}
                  </option>
                  {courtGroups.map((g) => (
                    <optgroup key={g.type} label={g.type}>
                      {g.courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.isPrincipalSeat ? ' (Principal Seat)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {/* ── Account fields ── */}
              {textField('Full Name', 'name', { required: true })}
              {textField('Email', 'email', { required: !editRep, type: 'email' })}
              {textField('Phone', 'phone')}
              {textField(
                editRep ? 'New Password (leave blank to keep)' : 'Password',
                'password',
                { required: !editRep, type: 'password' },
              )}

              {/* ── Address (full width) ── */}
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Address</span>
                <input
                  type="text"
                  className={INPUT_CLS}
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                />
              </label>

              {/* ── Payout ── */}
              <div className="md:col-span-2 pt-2 border-t border-slate-100">
                <span className="text-sm font-semibold text-slate-800">Payout details</span>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Payout Method</span>
                <select
                  className={SELECT_CLS}
                  value={form.payoutMethod}
                  onChange={(e) => handlePayoutMethodChange(e.target.value)}
                >
                  <option value="">— Select Method —</option>
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>{PAYOUT_METHOD_LABELS[m]}</option>
                  ))}
                </select>
              </label>

              {form.payoutMethod === 'BANK_TRANSFER' && (
                <>
                  {textField('Bank Name', 'payoutBankName')}
                  {textField('Account Title', 'payoutAccountTitle')}
                  {textField('Account Number', 'payoutAccountNumber')}
                </>
              )}
              {form.payoutMethod === 'JAZZ_CASH' && textField('JazzCash Number', 'payoutJazzCash')}
              {form.payoutMethod === 'EASY_PAISA' && textField('EasyPaisa Number', 'payoutEasyPaisa')}

              {/* ── Error ── */}
              {formError && (
                <div className="md:col-span-2 rounded-lg p-3 text-sm font-medium bg-rose-50 text-rose-800 border border-rose-200">
                  {formError}
                </div>
              )}

              {/* ── Actions ── */}
              <div className="md:col-span-2 flex gap-3 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : editRep ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
