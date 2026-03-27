/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo, useEffect, useState, useCallback } from 'react';
import type { IntakeField, IntakeFlow } from '@/lib/intake-flows';
import { PanelCard } from '@/components/ui/panel-card';
import { CheckCircle2, ChevronRight, UploadCloud, FileText, Search, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type IntakeWizardProps = {
  title: string;
  flows: IntakeFlow[];
};

type TicketDraft = {
  draftId?: string;
  flow: string;
  consumerId: string;
  serviceId: string;
  step: number;
  payload: Record<string, string>;
};

type UserHit = { id: string; name: string; email: string; phone: string | null; cnic: string | null };
type ServiceHit = { id: string; name: string; category: string; courts?: string[] };

function hasValue(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

// Consumer Search Combobox
function ConsumerSearch({ value, onChange }: { value: string; onChange: (id: string, label: string) => void }) {
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const [results, setResults] = useState<UserHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await apiClient.get<any>(`/users?search=${encodeURIComponent(query)}&limit=10`);
        setResults((r.items ?? []).filter((u: UserHit) => ['consumer', 'lawyer', 'company', 'investor'].includes((u as any).role)));
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const select = (u: UserHit) => {
    setLabel(`${u.name} — ${u.email}`);
    setQuery('');
    setOpen(false);
    onChange(u.id, `${u.name} — ${u.email}`);
  };

  return (
    <div className="relative">
      {value && label ? (
        <div className="flex items-center justify-between rounded-xl border-0 py-2.5 px-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft bg-emerald-50 text-sm">
          <span>{label}</span>
          <button type="button" onClick={() => { onChange('', ''); setLabel(''); }} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="block w-full rounded-xl border-0 py-2.5 pl-9 pr-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
            placeholder="Search consumer by name, email, CNIC..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
          {open && (query.length >= 2) && (
            <ul className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {loading && <li className="px-4 py-3 text-sm text-slate-400">Searching...</li>}
              {!loading && results.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">No consumers found</li>}
              {results.map((u) => (
                <li key={u.id} onClick={() => select(u)} className="cursor-pointer px-4 py-2.5 hover:bg-primary-50 transition-colors">
                  <p className="text-sm font-medium text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.email}{u.cnic ? ` · CNIC: ${u.cnic}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Service Dropdown
function ServiceSelect({
  value,
  onChange,
  category,
}: {
  value: string;
  onChange: (id: string, courts: string[]) => void;
  category: 'judicial' | 'non_judicial';
}) {
  const [services, setServices] = useState<ServiceHit[]>([]);

  useEffect(() => {
    apiClient.get<any>(`/services?type=${category}&limit=50`)
      .then((r) => setServices(r.items ?? r ?? []))
      .catch(() => {});
  }, [category]);

  return (
    <select
      className="block w-full rounded-xl border-0 py-2.5 px-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
      value={value}
      onChange={(e) => {
        const nextId = e.target.value;
        const selected = services.find((service) => service.id === nextId);
        onChange(nextId, selected?.courts ?? []);
      }}
    >
      <option value="">— Select a service —</option>
      {services.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}

// Cascading Geo Select Hook
function useGeo() {
  const [provinces, setProvinces] = useState<{ id: string; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [courts, setCourts] = useState<{ id: string; name: string; level: string }[]>([]);
  const [policeStations, setPoliceStations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    apiClient.get<any>('/geo/provinces').then((r) => setProvinces(r)).catch(() => {});
  }, []);

  const loadDistricts = useCallback((provinceId: string) => {
    if (!provinceId) { setDistricts([]); setCities([]); setCourts([]); setPoliceStations([]); return; }
    apiClient.get<any>(`/geo/provinces/${provinceId}/districts`).then(setDistricts).catch(() => {});
  }, []);

  const loadCities = useCallback((districtId: string) => {
    if (!districtId) { setCities([]); setCourts([]); setPoliceStations([]); return; }
    apiClient.get<any>(`/geo/districts/${districtId}/cities`).then(setCities).catch(() => {});
  }, []);

  const loadCourts = useCallback((cityId: string) => {
    if (!cityId) { setCourts([]); setPoliceStations([]); return; }
    apiClient.get<any>(`/geo/cities/${cityId}/courts`).then(setCourts).catch(() => {});
    apiClient.get<any>(`/geo/cities/${cityId}/police-stations`).then(setPoliceStations).catch(() => {});
  }, []);

  return { provinces, districts, cities, courts, policeStations, loadDistricts, loadCities, loadCourts };
}

function renderField(
  field: IntakeField,
  value: string,
  onChange: (key: string, value: string) => void,
) {
  const baseClass = "block w-full rounded-xl border-0 py-2.5 px-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6";

  if (field.type === 'textarea') {
    return (
      <textarea className={baseClass} rows={4} value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={`Enter ${field.label.toLowerCase()}`} />
    );
  }
  if (field.type === 'select') {
    return (
      <select className={baseClass} value={value} onChange={(e) => onChange(field.key, e.target.value)}>
        <option value="" disabled>Select {field.label}</option>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input className={baseClass}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={value} onChange={(e) => onChange(field.key, e.target.value)}
      placeholder={`Enter ${field.label.toLowerCase()}`} />
  );
}

export function IntakeWizard({ title, flows }: IntakeWizardProps) {
  const [draft, setDraft] = useState<TicketDraft>({ flow: flows[0]?.key ?? '', consumerId: '', serviceId: '', step: 1, payload: {} });
  const [consumerLabel, setConsumerLabel] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedServiceCourts, setSelectedServiceCourts] = useState<string[]>([]);

  const geo = useGeo();

  // Which geo IDs are selected (managed separate from text payload)
  const [geoIds, setGeoIds] = useState({ provinceId: '', districtId: '', cityId: '' });

  const selectedFlow = useMemo(() => flows.find((f) => f.key === draft.flow) ?? flows[0], [draft.flow, flows]);
  const totalSteps = selectedFlow?.steps.length ?? 1;
  const activeStep = selectedFlow?.steps[draft.step - 1] ?? null;

  // Determine service category from flow key
  const serviceCategory: 'judicial' | 'non_judicial' = draft.flow.startsWith('non_judicial') ? 'non_judicial' : 'judicial';

  const setField = (field: keyof TicketDraft, value: string | number) =>
    setDraft((c) => ({ ...c, [field]: value }));

  const setPayloadField = (key: string, value: string) =>
    setDraft((c) => ({ ...c, payload: { ...c.payload, [key]: value } }));

  // Geo selection handlers — update both IDs and text payload
  const handleProvinceChange = (provinceId: string, name: string) => {
    setGeoIds((g) => ({ ...g, provinceId, districtId: '', cityId: '' }));
    geo.loadDistricts(provinceId);
    setPayloadField('province', name);
    setPayloadField('province_capital', name);
    setPayloadField('district_id', '');
    setPayloadField('select_district', '');
    setPayloadField('city', '');
    setPayloadField('select_city', '');
    setPayloadField('select_court', '');
    setPayloadField('station_id', '');
    setPayloadField('police_station', '');
  };

  const handleDistrictChange = (districtId: string, name: string) => {
    setGeoIds((g) => ({ ...g, districtId, cityId: '' }));
    geo.loadCities(districtId);
    setPayloadField('district_id', districtId);
    setPayloadField('select_district', name);
    setPayloadField('city', '');
    setPayloadField('select_city', '');
    setPayloadField('select_court', '');
    setPayloadField('station_id', '');
    setPayloadField('police_station', '');
  };

  const handleCityChange = (cityId: string, name: string) => {
    setGeoIds((g) => ({ ...g, cityId }));
    geo.loadCourts(cityId);
    setPayloadField('select_court_city', name);
    setPayloadField('city', name);
    setPayloadField('select_city', name);
    setPayloadField('select_court', '');
    setPayloadField('station_id', '');
    setPayloadField('police_station', '');
  };

  const validateCurrentStep = () => {
    if (!activeStep) return true;
    const missing = activeStep.fields.find((f) => f.required && !hasValue(draft.payload[f.key]));
    if (missing) { setMessage(`Required field missing: ${missing.label}`); return false; }
    if (draft.step === 1 && !draft.consumerId) { setMessage('Please select a consumer'); return false; }
    if (draft.step === 1 && !draft.serviceId) { setMessage('Please select a service'); return false; }
    return true;
  };

  const saveDraft = async () => {
    if (!selectedFlow) return;
    setLoading(true); setMessage('Saving draft...');
    try {
      const r = await apiClient.post<any>('/tickets/intake-drafts', { draftId: draft.draftId, flow: draft.flow, consumerId: draft.consumerId, serviceId: draft.serviceId, step: draft.step, payload: draft.payload });
      setDraft((c) => ({ ...c, draftId: r.id }));
      setMessage('Draft saved');
    } catch (e: any) { setMessage(e.message || 'Save failed'); }
    setLoading(false);
  };

  const submitTicket = async () => {
    if (!selectedFlow || !validateCurrentStep()) return;
    setLoading(true); setMessage('Submitting ticket...');
    try {
      const ticket = await apiClient.post<any>(selectedFlow.endpoint, {
        consumerId: draft.consumerId,
        serviceId: draft.serviceId,
        serviceCity:
          draft.payload.select_court_city ??
          draft.payload.city ??
          draft.payload.select_city ??
          draft.payload.select_district ??
          '',
        caseType:
          draft.payload.case_type ??
          draft.payload.offence ??
          draft.payload.case_title ??
          draft.payload.title ??
          '',
        payload: { ...draft.payload, source: 'next-web-intake' },
      });
      for (const file of files) {
        const fd = new FormData(); fd.append('file', file);
        await apiClient.post(`/tickets/${ticket.id}/documents/upload`, fd);
      }
      setMessage('✅ Ticket created successfully! Batch No: ' + ticket.batchNo);
      setDraft({ flow: flows[0]?.key ?? '', consumerId: '', serviceId: '', step: 1, payload: {} });
      setConsumerLabel(''); setFiles([]);
    } catch (e: any) { setMessage(e.message || 'Submission failed'); }
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">Complete the multi-step form to file a new paralegal request.</p>
      </div>

      {/* Progress Rail */}
      <nav aria-label="Progress">
        <ol role="list" className="flex items-center gap-2">
          {selectedFlow?.steps.map((step, index) => {
            const stepNumber = index + 1;
            const isCompleted = draft.step > stepNumber;
            const isCurrent = draft.step === stepNumber;
            return (
              <li key={step.title} className={`relative flex flex-col min-w-0 ${index !== selectedFlow.steps.length - 1 ? 'flex-1' : ''}`}>
                <div className="flex items-center">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full ${isCompleted ? 'bg-primary-600 text-white' : isCurrent ? 'border-2 border-primary-600 bg-white text-primary-600' : 'border-2 border-slate-300 bg-white text-slate-500'}`}>
                    {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-sm font-medium">{stepNumber}</span>}
                  </span>
                  {index !== selectedFlow.steps.length - 1 && (
                    <div className={`h-1 mx-2 w-full rounded ${isCompleted ? 'bg-primary-600' : 'bg-slate-200'}`} />
                  )}
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-600 truncate max-w-[120px]">{step.title}</div>
              </li>
            );
          })}
        </ol>
      </nav>

      <PanelCard className="p-8">
        <div className="mb-6 grid gap-6 md:grid-cols-2">
          {/* Step 1 prefix: flow + consumer search + service */}
          {draft.step === 1 && (
            <>
              <label className="space-y-1 block">
                <span className="text-sm font-medium text-slate-700">Intake Flow</span>
                <select
                  className="block w-full rounded-xl border-0 py-2.5 px-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={draft.flow}
                  onChange={(e) => {
                    setField('flow', e.target.value);
                    setField('step', 1);
                    setField('serviceId', '');
                    setDraft((current) => ({ ...current, payload: { ...current.payload, select_court: '' } }));
                    setSelectedServiceCourts([]);
                  }}
                >
                  {flows.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </label>

              <label className="space-y-1 block">
                <span className="text-sm font-medium text-slate-700">Consumer<span className="text-rose-500 ml-0.5">*</span></span>
                <ConsumerSearch
                  value={draft.consumerId}
                  onChange={(id, lbl) => { setField('consumerId', id); setConsumerLabel(lbl); }}
                />
              </label>

              <label className="space-y-1 block md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Service<span className="text-rose-500 ml-0.5">*</span></span>
                <ServiceSelect
                  value={draft.serviceId}
                  onChange={(id, courts) => {
                    setField('serviceId', id);
                    setSelectedServiceCourts(courts);
                    setPayloadField('select_court', '');
                  }}
                  category={serviceCategory}
                />
              </label>
            </>
          )}

          {/* Geo cascading selects — shown when step field keys match geo fields */}
          {activeStep?.fields.some((f) => ['province', 'province_capital', 'select_court_city'].includes(f.key)) && (
            <div className="md:col-span-2 grid gap-4 md:grid-cols-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Province / Capital<span className="text-rose-500 ml-0.5">*</span></span>
                <select className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={geoIds.provinceId}
                  onChange={(e) => {
                    const opt = e.target.options[e.target.selectedIndex];
                    handleProvinceChange(e.target.value, opt?.text ?? e.target.value);
                  }}>
                  <option value="">— Province —</option>
                  {geo.provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">District</span>
                <select className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={geoIds.districtId} disabled={!geoIds.provinceId}
                  onChange={(e) => {
                    const opt = e.target.options[e.target.selectedIndex];
                    handleDistrictChange(e.target.value, opt?.text ?? e.target.value);
                  }}>
                  <option value="">— District —</option>
                  {geo.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">City</span>
                <select className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={geoIds.cityId} disabled={!geoIds.districtId}
                  onChange={(e) => {
                    const opt = e.target.options[e.target.selectedIndex];
                    handleCityChange(e.target.value, opt?.text ?? e.target.value);
                  }}>
                  <option value="">— City —</option>
                  {geo.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              {/* Court select for judicial flows */}
              {draft.flow.startsWith('judicial') && (
                <label className="block md:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Select Court<span className="text-rose-500 ml-0.5">*</span></span>
                  <select className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                    value={draft.payload.select_court ?? ''}
                    onChange={(e) => setPayloadField('select_court', e.target.value)}>
                    <option value="">— Select Court —</option>
                    {(selectedServiceCourts.length > 0
                      ? selectedServiceCourts
                      : geo.courts.map((court) => `${court.name} (${court.level})`)).map((courtName) => (
                        <option key={courtName} value={courtName}>{courtName}</option>
                      ))}
                  </select>
                </label>
              )}
              {/* Police station for non-judicial FIR */}
              {draft.flow === 'non_judicial_copy_of_fir' && geo.policeStations.length > 0 && (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Police Station</span>
                  <select className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                    value={draft.payload.station_id ?? ''}
                    onChange={(e) => {
                      const opt = e.target.options[e.target.selectedIndex];
                      setPayloadField('station_id', e.target.value);
                      setPayloadField('police_station', opt?.text ?? '');
                    }}>
                    <option value="">— Police Station —</option>
                    {geo.policeStations.map((ps) => <option key={ps.id} value={ps.id}>{ps.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          {/* Remaining fields — skip geo fields already handled above */}
          {activeStep?.fields
            .filter((f) =>
              ![
                'province',
                'province_capital',
                'district_id',
                'select_district',
                'select_court_city',
                'select_city',
                'station_id',
                'police_station',
                'select_court',
                'documents_upload_note',
              ].includes(f.key),
            )
            .map((field) => (
              <label key={field.key} className={`space-y-1 block ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}>
                <span className="text-sm font-medium text-slate-700">
                  {field.label} {field.required && <span className="text-rose-500">*</span>}
                </span>
                {renderField(field, draft.payload[field.key] ?? '', setPayloadField)}
              </label>
            ))}
        </div>

        {/* File upload on final step */}
        {draft.step === totalSteps && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-slate-900 mb-4">Supporting Documents</h4>
            <div className="flex justify-center rounded-xl border border-dashed border-slate-300 px-6 py-10">
              <div className="text-center">
                <UploadCloud className="mx-auto h-12 w-12 text-slate-300" />
                <div className="mt-4 flex text-sm leading-6 text-slate-600">
                  <label htmlFor="file-upload" className="relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 hover:text-primary-500">
                    <span>Upload files</span>
                    <input id="file-upload" type="file" multiple className="sr-only"
                      onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-slate-500">PNG, JPG, PDF, DOC up to 10MB each</p>
                {files.length > 0 && (
                  <ul className="mt-4 space-y-2 text-left">
                    {files.map((file, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <FileText className="h-4 w-4 text-primary-500" />
                        <span className="truncate">{file.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
          <button type="button" disabled={loading || draft.step === 1}
            className="rounded-lg bg-surface-muted px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            onClick={() => setField('step', Math.max(1, draft.step - 1))}>
            Back
          </button>

          <div className="flex gap-3">
            <button type="button" disabled={loading} onClick={saveDraft}
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors">
              Save Draft
            </button>
            {draft.step === totalSteps ? (
              <button type="button" disabled={loading} onClick={submitTicket}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors">
                Submit Ticket <CheckCircle2 className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
                onClick={() => { if (!validateCurrentStep()) return; setField('step', Math.min(totalSteps, draft.step + 1)); }}>
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </PanelCard>

      {message && (
        <div className={`rounded-lg p-4 text-sm font-medium ${message.includes('✅') || message.includes('success') || message.includes('saved') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          {message}
        </div>
      )}
    </div>
  );
}
