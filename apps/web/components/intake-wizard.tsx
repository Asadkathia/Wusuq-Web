/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { PanelCard } from '@/components/ui/panel-card';
import { Select } from '@/components/ui/select';
import { ChevronRight, CheckCircle2, FolderOpen, Sparkles, X } from 'lucide-react';
import type { IntakeFlow, IntakeStep } from '@/lib/intake-flows';

import type { IntakeWizardProps, TicketDraft, ServiceHit, LocalUser } from './intake-wizard/types';
import { StepRail } from './intake-wizard/step-rail';
import { renderField, colSpan } from './intake-wizard/field-renderer';
import { FileUpload } from './intake-wizard/file-upload';
import {
  JudicialCourtBlock,
  FirBlock,
  RegistryDeedBlock,
  LocationBlock,
} from './intake-wizard/service-geo-blocks';

// ─── Static lookup tables ────────────────────────────────────────────────────

const SERVICE_CASE_TYPES: Record<string, string[]> = {
  svc_judicial_lower_court: [
    'Bail Application (S)', 'Criminal Appeal', 'Criminal Misc.', 'Criminal Revision',
    'Hadood Cases (Under Hadood Ordinance)', 'Harrassment', 'Illegal Dispossession Act',
    'Inquiry (S)', 'Money Laundering Act', 'Narcotics Cases (S)', 'Other Cases (S)',
    'Petitions u/s 22-A/22-B Cr.P.C', 'Sessions Cases (Murder)', 'Sessions Cases (Others)',
    'STA Cases', 'Superdari', 'Habeas Corpus', 'Execution Petition (S)',
    'Application for Succession', 'Civil Appeal', 'Civil Case of Summary Nature Involving Evidence',
    'Civil Misc.', 'Civil Revision', 'Civil Suit', 'Commercial Cases', 'Election Petition',
    'Execution Petition (C)', 'Family Cases', 'Guardianship Cases', 'Inquiry (C)',
    'Insolvency Cases', 'Insurance Cases', 'Labour Cases', 'Land Acquisition Cases',
    'Obejcton Petiton', 'Original Suit', 'Other Cases (C)', 'Pauper Cases', 'Rent Cases',
    'Small Clam & Minor Offence', 'Bail Application (M)', 'Ist Class Cases', 'Minor Offences',
    'Narcotics Cases (M)', 'Other Cases (M)', 'Section 30 Case',
  ],
  svc_judicial_special_court: [
    'Pre-Arrest Bail Petition', 'Post-Arrest Bail Petition', 'Trail File', 'Miscellaneous',
  ],
  svc_judicial_high_court: [
    'Writ Petition', 'Criminal Miscellaneous', 'Civil Revision', 'Regular First Appeal',
    'First Appeal Against Order', 'Criminal Appeal', 'Criminal Revision', 'Murder Reference',
    'Petition For Special Leave To Appeal', 'Diary Number', 'Intra Court Appeal',
    'Review Application', 'Civil Suit', 'Labour Appeal', 'Arbitration Petition',
    'Companies Original', 'Execution Petition', 'Human Rights Petition', 'Election Petition',
    'Suo Moto', 'Tax Reference', 'Regular Second Appeal', 'Second Appeal Against Order',
    'Transfer Application', 'Civil Original Suit', 'Execution First Appeal',
    'Petition For Leave To Appear And Defend', 'Execution Second Appeal', 'Tax Appeal',
    'Custom Reference', 'Civil Reference', 'Cm Independent', 'Wealth Tax Appeal',
    'Commercial Appeal', 'Jail Appeal', 'Capital Sentence Reference',
    'Federal Excise & Reference Application', 'Sales Tax Reference', 'Income Tax Reference',
    'Sales Tax Appeal', 'Income Tax Appeal', 'Custom Appeal', 'C.T.R', 'Objection Case',
    'Office Objection', 'Criminal Original', 'Succession Appeal', 'Objection Petition',
    'Cross Objection', 'Secp Appeal', 'Judicial Reference', 'Ogra Application',
    'Consumer Appeal', 'Judicial Service Appeal', 'Auqaf Appeal', 'Election Appeal',
    'Criminal Original Case', 'Civil Miscellaneous Appeals', 'Miscellaneous Petitions',
    'Enforcement Petition', 'Complaint', 'Pre-Arrest Bail Petition', 'Post-Arrest Bail Petition',
  ],
  svc_judicial_federal_shariat: [],
  svc_judicial_supreme_court: [
    'C.A.', 'C.M.A.', 'C.M.Appeal.', 'C.P.', 'C.R.P.', 'C.Sh.A.', 'C.Sh.P.',
    'C.Sh.R.P.', 'Const.P.', 'Crl.A.', 'Crl.M.A.', 'Crl.M.Appeal.', 'Crl.O.P.',
    'Crl.P.', 'Crl.R.P.', 'Crl.S.M.R.P.', 'Crl.S.M.Sh.R.P.', 'Crl.Sh.A.', 'Crl.Sh.P.',
    'Crl.Sh.R.P.', 'D.S.A.', 'H.R.C.', 'H.R.M.A.', 'I.C.A.', 'J.P.', 'J.Sh.P.',
    'Reference.', 'S.M.C.', 'S.M.R.P.',
  ],
};

const SERVICE_COURTS: Record<string, string[]> = {
  svc_judicial_lower_court: ['Sessions Court', 'Magisterial Court', 'Civil Court', 'Family Court'],
  svc_judicial_special_court: [
    'Accountability Courts', 'Anti-Corruption Courts (Provincial)', 'Anti-Terrorism Courts',
    'Anti-Dumping Appellate Tribunal no bail', 'Appellate Tribunals Inland Revenue', 'Banking Courts',
    'Banking Muhtasib', 'Board of Revenue', 'Child Protection Court', 'Commercial Courts',
    'Competition Appellate Tribunal', 'Consumer Courts', 'Customs Appellate Tribunals', 'Drug Courts',
    'Environmental Protection Tribunals', 'Election Tribunal', 'Federal Insurance Tribunal',
    'Federal Ombudsman', 'Federal Service Tribunal', 'Federal tax ombudsman',
    'Foreign Exchange Regulation Appellate Boards', 'Income Tax Appellate Tribunal',
    'Insurance Appellate Tribunal', 'Intellectual Property Tribunal', 'Labor Appellate Tribunals',
    'Labor Courts', 'Lahore Development Authority Tribunal',
    'National industrial relations commission (NIRC)', 'Pakistan Maritime Carriage Appellate Tribunal',
    'Provincial Ombudsman', 'Provincial Service Tribunals', 'Special Courts (Central)',
    'Special Courts (Control of Narcotic Substances)', 'Special Courts (Customs, Taxation Anti-Smuggling)',
    'Special Courts (Offences in Banks)', 'Special Courts of Public Property (Removal of Encroachment)',
  ],
  svc_judicial_high_court: [
    'Lahore High Court', 'Sindh High Court', 'Peshawar High Court', 'Balochistan High Court',
    'Gilgit High Court', 'Azad Kashmir High Court', 'Islamabad High Court',
  ],
  svc_judicial_federal_shariat: ['Islamabad Court'],
  svc_judicial_supreme_court: ['Supreme Court'],
};

const JUDGE_DESIGNATIONS: Record<string, string[]> = {
  'Sessions Court': ['Sessions Judge', 'Additional Sessions Judge', 'Civil Judge', 'Judicial Magistrate'],
  'Magisterial Court': ['Executive Magistrate', 'Judicial Magistrate', '1st Class Magistrate', '2nd Class Magistrate', '3rd Class Magistrate'],
  'Civil Court': ['Civil Judge', 'Senior Civil Judge', 'Additional Civil Judge'],
  'Family Court': ['Family Judge', 'Additional Family Judge'],
  'Lahore High Court': ['Chief Justice', 'Justice', 'Additional Judge'],
  'Sindh High Court': ['Chief Justice', 'Justice', 'Additional Judge'],
  'Peshawar High Court': ['Chief Justice', 'Justice', 'Additional Judge'],
  'Balochistan High Court': ['Chief Justice', 'Justice', 'Additional Judge'],
  'Gilgit High Court': ['Chief Justice', 'Justice', 'Additional Judge'],
  'Azad Kashmir High Court': ['Chief Justice', 'Justice', 'Additional Judge'],
  'Islamabad High Court': ['Chief Justice', 'Justice', 'Additional Judge'],
  'Supreme Court': ['Chief Justice of Pakistan', 'Justice', 'Additional Judge'],
  'Islamabad Court': ['Judge Federal Shariat Court', 'Additional Judge Federal Shariat Court'],
};

const DEFAULT_JUDGE_DESIGNATIONS = [
  'Judge', 'Additional Judge', 'Senior Judge', 'Presiding Officer', 'Chairman',
];

// ─── Service Dropdown ────────────────────────────────────────────────────────
function ServiceSelect({
  value,
  onChange,
  services,
}: {
  value: string;
  onChange: (id: string, name: string, courts: string[], courtCities: Record<string, string[]>, caseTypes: string[]) => void;
  inputClass?: string;
  services: ServiceHit[];
}) {
  const options = services.map((s) => ({
    value: s.id,
    label: s.name,
    description: SERVICE_DESCRIPTIONS[s.name],
  }));
  return (
    <Select
      value={value}
      onChange={(id) => {
        const selected = services.find((s) => s.id === id);
        onChange(
          id,
          selected?.name ?? '',
          selected?.courts ?? [],
          selected?.courtCities ?? {},
          selected?.caseTypes ?? [],
        );
      }}
      options={options}
      placeholder="Select a service"
      searchPlaceholder="Search services…"
      allowClear
      ariaLabel="Service"
    />
  );
}

function ServiceCardGrid({
  services,
  value,
  onSelect,
}: {
  services: ServiceHit[];
  value: string;
  onSelect: (service: ServiceHit) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {services.map((service) => {
        const selected = value === service.id;
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onSelect(service)}
            className={`rounded-2xl border bg-surface p-5 text-left shadow-elev-1 transition-[transform,box-shadow,border-color] duration-200 ease-silk hover:-translate-y-0.5 hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
              selected
                ? 'border-brand-500 ring-2 ring-brand-500/30'
                : 'border-border-soft hover:border-brand-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">{service.name}</p>
                <p className="mt-1 text-sm text-slate-500">{getServiceDescription(service)}</p>
              </div>
              {selected ? <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Cascading Geo Hook ──────────────────────────────────────────────────────
function useGeo() {
  const [provinces, setProvinces] = useState<{ id: string; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [cityCourts, setCityCourts] = useState<{ id: string; name: string }[]>([]);
  const [policeStations, setPoliceStations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    apiClient.get<any>('/geo/provinces').then((r) => setProvinces(r)).catch(() => {});
  }, []);

  const loadDistricts = useCallback((provinceId: string) => {
    if (!provinceId) { setDistricts([]); setCities([]); setCityCourts([]); setPoliceStations([]); return; }
    apiClient.get<any>(`/geo/provinces/${provinceId}/districts`).then(setDistricts).catch(() => {});
  }, []);

  const loadCities = useCallback((districtId: string) => {
    if (!districtId) { setCities([]); setCityCourts([]); return; }
    apiClient.get<any>(`/geo/districts/${districtId}/cities`).then(setCities).catch(() => {});
  }, []);

  const loadCityCourts = useCallback((cityId: string) => {
    if (!cityId) { setCityCourts([]); return; }
    apiClient.get<any>(`/geo/cities/${cityId}/courts`).then(setCityCourts).catch(() => {});
  }, []);

  const loadDistrictPoliceStations = useCallback((districtId: string) => {
    if (!districtId) { setPoliceStations([]); return; }
    apiClient.get<any>(`/geo/districts/${districtId}/police-stations`).then(setPoliceStations).catch(() => {});
  }, []);

  return { provinces, districts, cities, cityCourts, policeStations, loadDistricts, loadCities, loadCityCourts, loadDistrictPoliceStations };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hasValue(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

const GEO_HANDLED_KEYS = new Set([
  'province', 'district_id', 'station_id', 'other_station_id', 'city_type', 'office_name',
  'select_court', 'select_court_city',
  'documents_upload_note', 'select_service',
  'city', 'city_id',
]);

const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'] as const;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  'Case Files': 'Request copies of the file, order sheets, or paperbook from court.',
  'Case Information': 'Get up-to-date information about a matter already in court.',
  'Case Search': 'Search for a case when you have only partial details available.',
  'Case Filling': 'Start a new filing request and share the core case particulars.',
  'Power of Attorney': 'Request certified power-of-attorney related court handling.',
  'Copy of FIR': 'Request a copy of the FIR from the relevant police station.',
  'Registry/Deed': 'Request a registry or deed copy from the sub-registrar office.',
};

function getServiceDescription(service: ServiceHit) {
  return SERVICE_DESCRIPTIONS[service.name] ?? `Use ${service.name} for this request.`;
}

function formatRelativeTime(value: number | null) {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 10) return 'Saved · just now';
  if (seconds < 60) return `Saved · ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Saved · ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `Saved · ${hours}h ago`;
}

// ─── Main Wizard ─────────────────────────────────────────────────────────────
export function IntakeWizard({ title, flows, variant = 'admin' }: IntakeWizardProps) {
  const [draft, setDraft] = useState<TicketDraft>({
    flow: flows[0]?.key ?? '',
    consumerId: '',
    serviceId: '',
    step: 1,
    payload: {},
  });
  const [consumerLabel, setConsumerLabel] = useState('');
  const [isConsumer, setIsConsumer] = useState(false);
  const [isAdminTestingMode, setIsAdminTestingMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<LocalUser | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHydrateRef = useRef(false);
  const [services, setServices] = useState<ServiceHit[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [documentsPanelOpen, setDocumentsPanelOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [draft.step]);
  const [apiError, setApiError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [selectedServiceCourts, setSelectedServiceCourts] = useState<string[]>([]);
  const [selectedServiceCaseTypes, setSelectedServiceCaseTypes] = useState<string[]>([]);

  const geo = useGeo();
  const [geoIds, setGeoIds] = useState({ provinceId: '', districtId: '', cityId: '' });

  const selectedFlow = useMemo(() => flows.find((f) => f.key === draft.flow) ?? flows[0], [draft.flow, flows]);

  const serviceCategory: 'judicial' | 'non_judicial' = draft.flow.startsWith('non_judicial') ? 'non_judicial' : 'judicial';
  const isJudicial = serviceCategory === 'judicial';
  const isConsumerVariant = variant === 'consumer';

  useEffect(() => {
    apiClient.get<any>(`/services?type=${serviceCategory}&limit=50`)
      .then((r) => setServices(r.items ?? r ?? []))
      .catch(() => setServices([]));
  }, [serviceCategory]);

  const displaySteps = useMemo<IntakeStep[]>(() => {
    if (!selectedFlow) return [];

    // Prepend a universal "Location" step, then keep the flow's own steps but
    // rename the first step from "Service Selection" → "Service" since the
    // location fields that used to live there are now in Step 1.
    const [firstStep, ...restSteps] = selectedFlow.steps;
    const serviceStep: IntakeStep = {
      title: isConsumerVariant ? 'Choose a Service' : 'Service',
      fields: isConsumerVariant
        ? (firstStep?.fields ?? []).filter((f) => f.key !== 'select_service')
        : (firstStep?.fields ?? []),
    };

    const locationStep: IntakeStep = { title: 'Location', fields: [] };
    return [locationStep, serviceStep, ...restSteps];
  }, [isConsumerVariant, selectedFlow]);

  const totalSteps = displaySteps.length || 1;
  const activeStep = displaySteps[draft.step - 1] ?? null;
  const displayFlow = useMemo<IntakeFlow | null>(
    () => (selectedFlow ? { ...selectedFlow, steps: displaySteps } : null),
    [displaySteps, selectedFlow],
  );
  const isLocationStep = draft.step === 1;
  const isServiceStep = draft.step === 2;
  // FIR/Registry geo blocks only render when the flow's own step exposes those fields.
  // After injecting Location at index 0, the former FIR "Service Selection" step (with
  // province/district/station/city_type fields) now lives at step 2. We keep the
  // city_type chip and station picker on that step, but province/district inputs are
  // hidden because the user already picked them in step 1.
  const stepHasFirGeo = Boolean(activeStep?.fields.some((field) => ['province', 'district_id', 'station_id', 'city_type'].includes(field.key)));
  const stepHasRegistryGeo = Boolean(activeStep?.fields.some((field) => ['office_name', 'city_type'].includes(field.key)));

  // Courts available for the current service in the user's chosen city.
  // Intersect: courts configured for the service × courts seeded in that city.
  const courtOptions: string[] = useMemo(() => {
    if (!geoIds.cityId) return [];
    const cityCourtNames = new Set(geo.cityCourts.map((c) => c.name));
    const serviceCourts = selectedServiceCourts;
    if (serviceCourts.length === 0) return Array.from(cityCourtNames).sort();
    return serviceCourts.filter((name) => cityCourtNames.has(name));
  }, [geo.cityCourts, geoIds.cityId, selectedServiceCourts]);

  const judgeDesignationOptions: string[] = useMemo(() => {
    const court = draft.payload.select_court;
    if (!court) return DEFAULT_JUDGE_DESIGNATIONS;
    return JUDGE_DESIGNATIONS[court] ?? DEFAULT_JUDGE_DESIGNATIONS;
  }, [draft.payload.select_court]);

  const setField = (field: keyof TicketDraft, value: string | number) =>
    setDraft((c) => ({ ...c, [field]: value }));

  const setPayloadField = (key: string, value: string) =>
    setDraft((c) => ({ ...c, payload: { ...c.payload, [key]: value } }));

  useEffect(() => {
    if (draft.flow === 'non_judicial_registry_deed' && draft.payload.office_name !== 'Sub Registrar') {
      setPayloadField('office_name', 'Sub Registrar');
    }
  }, [draft.flow, draft.payload.office_name]);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as LocalUser | null;
      setCurrentUser(user);
      const role = user?.role ?? '';
      const userIsAdmin = role.includes('admin');
      const userIsConsumer =
        CONSUMER_ROLES.includes(role as (typeof CONSUMER_ROLES)[number]) &&
        !role.includes('admin') &&
        role !== 'representative' &&
        role !== 'investor';
      setIsConsumer(userIsConsumer);
      setIsAdminTestingMode(userIsAdmin);
      if ((userIsConsumer || userIsAdmin) && user?.id) {
        setDraft((current) => ({ ...current, consumerId: user.id }));
        setConsumerLabel(user.name || user.email || user.id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!apiError) return;
    errorBannerRef.current?.focus();
  }, [apiError]);

  const handleProvinceChange = (provinceId: string, name: string) => {
    setGeoIds({ provinceId, districtId: '', cityId: '' });
    geo.loadDistricts(provinceId);
    setPayloadField('province', name);
    setPayloadField('district_id', '');
    setPayloadField('district_name', '');
    setPayloadField('city', '');
    setPayloadField('city_id', '');
    setPayloadField('station_id', '');
    setPayloadField('police_station', '');
    setPayloadField('other_station_id', '');
    setPayloadField('select_court', '');
    setPayloadField('select_court_city', '');
  };

  const handleDistrictChange = (districtId: string, name: string) => {
    setGeoIds((g) => ({ ...g, districtId, cityId: '' }));
    geo.loadCities(districtId);
    geo.loadDistrictPoliceStations(districtId);
    setPayloadField('district_id', districtId);
    setPayloadField('district_name', name);
    setPayloadField('city', '');
    setPayloadField('city_id', '');
    setPayloadField('station_id', '');
    setPayloadField('police_station', '');
    setPayloadField('other_station_id', '');
    setPayloadField('select_court', '');
    setPayloadField('select_court_city', '');
  };

  const handleCityChange = (cityId: string, name: string) => {
    setGeoIds((g) => ({ ...g, cityId }));
    geo.loadCityCourts(cityId);
    setPayloadField('city_id', cityId);
    setPayloadField('city', name);
    setPayloadField('select_court_city', name);
    setPayloadField('select_court', '');
  };

  const applySelectedService = useCallback((id: string, name: string, caseTypes: string[]) => {
    setField('serviceId', id);
    setPayloadField('select_service', name || id);
    setSelectedServiceCourts(SERVICE_COURTS[id] ?? []);
    setSelectedServiceCaseTypes(SERVICE_CASE_TYPES[id] ?? caseTypes);
    setPayloadField('select_court', '');
    setPayloadField('select_court_city', '');
    setPayloadField('judge_designation', '');
  }, []);

  const addFiles = useCallback((incomingFiles: File[]) => {
    if (incomingFiles.length === 0) return;
    const oversized = incomingFiles.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setUploadError(`${oversized.name} exceeds the 10 MB limit.`);
      return;
    }

    setUploadError('');
    setFiles((current) => [...current, ...incomingFiles]);
  }, []);

  const removeFileAt = useCallback((index: number) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const handleFileDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFiles(false);
    addFiles(Array.from(event.dataTransfer.files ?? []));
  }, [addFiles]);

  const handleFileDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFiles(true);
  }, []);

  const handleFileDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFiles(false);
  }, []);

  const validateLocationStep = useCallback(() => {
    if (!draft.consumerId) {
      setApiError(isConsumerVariant ? 'Your account information is missing.' : 'Please select a consumer');
      return false;
    }
    if (!geoIds.provinceId) {
      setApiError('Please select a province');
      return false;
    }
    if (!geoIds.districtId) {
      setApiError('Please select a district');
      return false;
    }
    if (!geoIds.cityId) {
      setApiError('Please select a city');
      return false;
    }
    return true;
  }, [draft.consumerId, geoIds.cityId, geoIds.districtId, geoIds.provinceId, isConsumerVariant]);

  const validateServiceStep = useCallback(() => {
    if (!draft.serviceId) {
      setApiError('Please select a service');
      return false;
    }
    if (isJudicial && !draft.payload.select_court) {
      setApiError('Please select a court');
      return false;
    }
    return true;
  }, [draft.payload.select_court, draft.serviceId, isJudicial]);

  const canAutosaveDraft = useCallback(() => {
    if (!selectedFlow) return false;
    return Boolean(
      draft.flow &&
      draft.consumerId &&
      geoIds.cityId &&
      draft.serviceId &&
      (!isJudicial || draft.payload.select_court),
    );
  }, [draft.consumerId, draft.flow, draft.payload.select_court, draft.serviceId, geoIds.cityId, isJudicial, selectedFlow]);

  useEffect(() => {
    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      return;
    }
    if (!canAutosaveDraft()) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void saveDraft('auto');
    }, 5000);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [canAutosaveDraft, draft]);

  const validateField = (key: string, value: string): string => {
    const allFields = activeStep?.fields ?? [];
    const field = allFields.find((f) => f.key === key);
    if (!field?.required) return '';
    if (field.showWhen && draft.payload[field.showWhen.field] !== field.showWhen.value) return '';
    if (!hasValue(value)) return `${field.label} is required`;
    return '';
  };

  const handleFieldBlur = (key: string) => {
    setTouched((t) => ({ ...t, [key]: true }));
    const err = validateField(key, draft.payload[key] ?? '');
    setErrors((e) => ({ ...e, [key]: err }));
  };

  const validateCurrentStep = (): boolean => {
    setApiError('');
    if (isLocationStep) return validateLocationStep();
    if (isServiceStep) return validateServiceStep();

    if (!activeStep) return true;

    const newErrors: Record<string, string> = {};
    const newTouched: Record<string, boolean> = {};
    let firstInvalidKey: string | null = null;

    for (const f of activeStep.fields) {
      if (GEO_HANDLED_KEYS.has(f.key)) continue;
      if (!f.required) continue;
      if (f.showWhen && draft.payload[f.showWhen.field] !== f.showWhen.value) continue;
      if (f.key === 'select_service') continue;

      newTouched[f.key] = true;

      if (draft.flow === 'non_judicial_copy_of_fir' && f.key === 'station_id') {
        if (!hasValue(draft.payload.station_id) && !hasValue(draft.payload.police_station)) {
          newErrors[f.key] = `${f.label} is required`;
          if (!firstInvalidKey) firstInvalidKey = f.key;
        }
        continue;
      }
      if (!hasValue(draft.payload[f.key])) {
        newErrors[f.key] = `${f.label} is required`;
        if (!firstInvalidKey) firstInvalidKey = f.key;
      }
    }

    setTouched((t) => ({ ...t, ...newTouched }));
    setErrors((e) => ({ ...e, ...newErrors }));

    if (Object.values(newErrors).some(Boolean)) {
      if (firstInvalidKey) {
        const el = document.querySelector<HTMLElement>(`[name="${firstInvalidKey}"], #field-${firstInvalidKey}`);
        el?.focus();
      }
      return false;
    }
    return true;
  };

  const saveDraft = async (mode: 'manual' | 'auto' = 'manual') => {
    if (!selectedFlow) return;
    if (mode === 'manual') setLoading(true);
    setInfoMsg(mode === 'auto' ? 'Saving…' : 'Saving draft...');
    setApiError('');
    try {
      const r = await apiClient.post<any>('/tickets/intake-drafts', {
        draftId: draft.draftId,
        flow: draft.flow,
        consumerId: draft.consumerId,
        serviceId: draft.serviceId,
        step: draft.step,
        payload: draft.payload,
      });
      setDraft((c) => (c.draftId === r.id ? c : { ...c, draftId: r.id }));
      setLastSavedAt(Date.now());
      setInfoMsg('Saved · just now');
      localStorage.setItem(`wusuq_intake_draft_id:${variant}:${draft.flow}`, r.id);
    } catch (e: any) {
      setApiError(e.message || 'Save failed');
    }
    if (mode === 'manual') setLoading(false);
  };

  const resetForm = () => {
    setDraft({
      flow: flows[0]?.key ?? '',
      consumerId: isConsumer || isAdminTestingMode ? (currentUser?.id ?? '') : '',
      serviceId: '',
      step: 1,
      payload: {},
    });
    if (!(isConsumer || isAdminTestingMode)) setConsumerLabel('');
    setFiles([]);
    setSelectedServiceCourts([]);
    setSelectedServiceCaseTypes([]);
    setGeoIds({ provinceId: '', districtId: '', cityId: '' });
    setTouched({});
    setErrors({});
    setUploadError('');
    setDocumentsPanelOpen(false);
    setLastSavedAt(null);
  };

  const submitTicket = async () => {
    if (!selectedFlow || !validateCurrentStep()) return;
    setLoading(true); setApiError('');
    try {
      const ticket = await apiClient.post<any>(selectedFlow.endpoint, {
        consumerId: draft.consumerId,
        serviceId: draft.serviceId,
        serviceCity:
          draft.payload.city ??
          draft.payload.select_court_city ??
          draft.payload.district_name ??
          '',
        caseType:
          draft.payload.case_type ??
          draft.payload.offence ??
          draft.payload.case_title ??
          '',
        payload: { ...draft.payload, source: 'next-web-intake' },
      });
      for (const file of files) {
        const fd = new FormData(); fd.append('file', file);
        await apiClient.post(`/tickets/${ticket.id}/documents/upload`, fd);
      }
      setInfoMsg('✅ Ticket created successfully! Batch No: ' + ticket.batchNo);
      resetForm();
    } catch (e: any) { setApiError(e.message || 'Submission failed'); }
    setLoading(false);
  };

  const inputClass = 'block w-full rounded-xl border-0 py-2.5 px-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm';
  const selectClass = 'mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm';
  const headingTitle = isConsumerVariant ? 'Request a service' : title;
  const headingCopy = isConsumerVariant
    ? 'Choose the service you need and provide the details step by step.'
    : 'Complete the multi-step form to file a new paralegal request.';
  const savedLabel = formatRelativeTime(lastSavedAt) || infoMsg;

  return (
    <div className={`mx-auto space-y-8 ${isConsumerVariant ? 'max-w-3xl' : 'max-w-4xl'}`}>
      <div>
        <h2 className={`${isConsumerVariant ? 'text-3xl' : 'text-2xl'} font-bold tracking-tight text-slate-900`}>
          {headingTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{headingCopy}</p>
      </div>

      {displayFlow && (
        <StepRail
          selectedFlow={displayFlow}
          currentStep={draft.step}
          onStepClick={(step) => setField('step', step)}
        />
      )}

      <PanelCard className={isConsumerVariant ? 'p-10' : 'p-8'}>
        <h3
          ref={stepHeadingRef}
          tabIndex={-1}
          className={`mb-4 outline-none ${isConsumerVariant ? 'text-xl font-semibold text-slate-900' : 'text-base font-semibold text-slate-800'}`}
        >
          {activeStep?.title}
        </h3>
        <div className="mb-6 grid gap-6 md:grid-cols-2">

          {isLocationStep && (
            <>
              <label className="space-y-1.5 block">
                <span className="text-sm font-medium text-slate-700">
                  {isConsumerVariant ? 'Service type' : 'Intake Flow'}
                </span>
                <Select
                  value={draft.flow}
                  onChange={(next) => {
                    setField('flow', next);
                    setField('step', 1);
                    setField('serviceId', '');
                    setDraft((c) => ({ ...c, payload: {} }));
                    setSelectedServiceCourts([]);
                                    setSelectedServiceCaseTypes([]);
                    setGeoIds({ provinceId: '', districtId: '', cityId: '' });
                  }}
                  options={flows.map((f) => ({ value: f.key, label: f.label }))}
                  placeholder="Select a flow"
                  ariaLabel="Intake flow"
                />
              </label>

              {!isConsumerVariant ? (
                <label className="space-y-1 block">
                  <span className="text-sm font-medium text-slate-700">Consumer<span className="text-rose-500 ml-0.5">*</span></span>
                  {isConsumer || isAdminTestingMode ? (
                    <div className="flex items-center rounded-xl border-0 py-2.5 px-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft bg-slate-50 text-sm">
                      <span>
                        {consumerLabel || currentUser?.name || currentUser?.email || 'Current User'}
                        {isAdminTestingMode ? ' (dev testing consumer)' : ''}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center rounded-xl border-0 py-2.5 px-3.5 text-slate-500 shadow-sm ring-1 ring-inset ring-border-soft bg-slate-50 text-sm">
                      Consumer selection is disabled in this environment.
                    </div>
                  )}
                </label>
              ) : null}

              <LocationBlock
                geo={geo}
                geoIds={geoIds}
                onProvinceChange={handleProvinceChange}
                onDistrictChange={handleDistrictChange}
                onCityChange={handleCityChange}
              />
            </>
          )}

          {isServiceStep && (
            <>
              <label className="space-y-1 block md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Service<span className="text-rose-500 ml-0.5">*</span></span>
                {isConsumerVariant ? (
                  <ServiceCardGrid
                    services={services}
                    value={draft.serviceId}
                    onSelect={(service) =>
                      applySelectedService(
                        service.id,
                        service.name,
                        service.caseTypes ?? [],
                      )
                    }
                  />
                ) : (
                  <ServiceSelect
                    value={draft.serviceId}
                    services={services}
                    onChange={(id, name, _courts, _courtCities, caseTypes) =>
                      applySelectedService(id, name, caseTypes)
                    }
                  />
                )}
              </label>

              {isJudicial && (
                <JudicialCourtBlock
                  serviceId={draft.serviceId}
                  courtOptions={courtOptions}
                  selectCourt={draft.payload.select_court ?? ''}
                  cityName={draft.payload.city ?? ''}
                  hasCity={Boolean(geoIds.cityId)}
                  onCourtChange={(court) => {
                    setPayloadField('select_court', court);
                    setPayloadField('judge_designation', '');
                  }}
                />
              )}
            </>
          )}

          {stepHasFirGeo && (
            <FirBlock
              geo={geo}
              geoIds={geoIds}
              stationId={draft.payload.station_id ?? ''}
              policeStation={draft.payload.police_station ?? ''}
              cityType={draft.payload.city_type ?? ''}
              inputClass={inputClass}
              selectClass={selectClass}
              onStationIdChange={(id, name) => {
                setPayloadField('station_id', id);
                setPayloadField('police_station', name);
              }}
              onPoliceStationChange={(value) => {
                setPayloadField('police_station', value);
                setPayloadField('station_id', value);
              }}
              onCityTypeChange={(value) => setPayloadField('city_type', value)}
            />
          )}

          {stepHasRegistryGeo && (
            <RegistryDeedBlock
              cityType={draft.payload.city_type ?? ''}
              inputClass={inputClass}
              onCityTypeChange={(value) => setPayloadField('city_type', value)}
            />
          )}

          {!isLocationStep && !isServiceStep && activeStep?.fields
            .filter((f) => !GEO_HANDLED_KEYS.has(f.key))
            .map((field) => {
              const dynamicOpts =
                field.key === 'case_type' ? selectedServiceCaseTypes :
                field.key === 'judge_designation' ? judgeDesignationOptions :
                undefined;
              const errorMsg = touched[field.key] ? (errors[field.key] ?? '') : '';
              const rendered = renderField(field, draft.payload[field.key] ?? '', draft.payload, setPayloadField, dynamicOpts, handleFieldBlur, errorMsg);
              if (rendered === null) return null;

              return (
                <div key={field.key} className={`space-y-1 ${colSpan(field)}`}>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      {field.label}
                      {field.required && (!field.showWhen || draft.payload[field.showWhen.field] === field.showWhen.value) && (
                        <span className="text-rose-500 ml-0.5">*</span>
                      )}
                    </label>
                    {isConsumerVariant && field.hint ? (
                      <p className="mt-1 text-xs text-slate-500">{field.hint}</p>
                    ) : null}
                  </div>
                  {rendered}
                </div>
              );
            })}
        </div>

        {draft.step === totalSteps && (
          <FileUpload
            files={files}
            onFilesAdd={addFiles}
            onRemoveFile={removeFileAt}
            inputId="final-step-file-upload"
            error={uploadError}
            isDragging={isDraggingFiles}
            onDragOver={handleFileDragOver}
            onDragLeave={handleFileDragLeave}
            onDrop={handleFileDrop}
          />
        )}

        <div className="mt-8 border-t border-border-soft pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setDocumentsPanelOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border-soft bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-elev-1 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <FolderOpen className="h-4 w-4 text-brand-500" /> Documents
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-50 px-1.5 text-[10px] font-semibold text-brand-700 tabular-nums">
                {files.length}
              </span>
            </button>
            {savedLabel ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {savedLabel}
              </span>
            ) : null}
          </div>

          {/* Mobile */}
          <div className="flex flex-col gap-3 sm:hidden">
            {draft.step === totalSteps ? (
              <button
                type="button"
                disabled={loading}
                onClick={submitTicket}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-elev-1 transition-[background-color,box-shadow] hover:bg-brand-600 hover:shadow-elev-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                Submit ticket <CheckCircle2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-elev-1 transition-[background-color,box-shadow] hover:bg-brand-600 hover:shadow-elev-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                onClick={() => { if (!validateCurrentStep()) return; setField('step', Math.min(totalSteps, draft.step + 1)); }}
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                disabled={loading || draft.step === 1}
                className="min-h-[44px] flex-1 rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-border-soft transition-colors hover:bg-surface-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                onClick={() => setField('step', Math.max(1, draft.step - 1))}
              >
                Back
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => saveDraft('manual')}
                className="min-h-[44px] flex-1 rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold text-slate-900 ring-1 ring-inset ring-border-soft transition-colors hover:bg-surface-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                Save draft
              </button>
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden sm:flex items-center justify-between">
            <button
              type="button"
              disabled={loading || draft.step === 1}
              className="min-h-[44px] rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-border-soft transition-colors hover:bg-surface-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              onClick={() => setField('step', Math.max(1, draft.step - 1))}
            >
              Back
            </button>

            <div className="flex gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => saveDraft('manual')}
                className="min-h-[44px] rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold text-slate-900 ring-1 ring-inset ring-border-soft transition-colors hover:bg-surface-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                Save draft
              </button>
              {draft.step === totalSteps ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={submitTicket}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-elev-1 transition-[background-color,box-shadow] hover:bg-brand-600 hover:shadow-elev-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  Submit ticket <CheckCircle2 className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-elev-1 transition-[background-color,box-shadow] hover:bg-brand-600 hover:shadow-elev-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                  onClick={() => { if (!validateCurrentStep()) return; setField('step', Math.min(totalSteps, draft.step + 1)); }}
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </PanelCard>

      {apiError && (
        <div
          ref={errorBannerRef}
          role="alert"
          aria-live="polite"
          tabIndex={-1}
          className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800 outline-none"
        >
          {apiError}
        </div>
      )}

      {documentsPanelOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/40">
          <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Documents</h4>
                <p className="text-sm text-slate-500">Attach files at any point before submitting the ticket.</p>
              </div>
              <button
                type="button"
                onClick={() => setDocumentsPanelOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
                aria-label="Close documents panel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <FileUpload
              files={files}
              onFilesAdd={addFiles}
              onRemoveFile={removeFileAt}
              inputId="drawer-file-upload"
              error={uploadError}
              isDragging={isDraggingFiles}
              onDragOver={handleFileDragOver}
              onDragLeave={handleFileDragLeave}
              onDrop={handleFileDrop}
              title="Supporting Documents"
              description="Upload or drag supporting files here. The list is shared with the final step."
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
