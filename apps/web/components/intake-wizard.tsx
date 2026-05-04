/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { PanelCard } from '@/components/ui/panel-card';
import { ChevronRight, CheckCircle2, FolderOpen, Sparkles, X } from 'lucide-react';
import type { IntakeFlow, IntakeStep } from '@/lib/intake-flows';

import type { IntakeWizardProps, TicketDraft, ServiceHit, LocalUser, CityCourtGroup } from './intake-wizard/types';
import { StepRail } from './intake-wizard/step-rail';
import { renderField, colSpan } from './intake-wizard/field-renderer';
import { FileUpload } from './intake-wizard/file-upload';
import {
  JudicialServiceBlock,
  FirBlock,
  RegistryDeedBlock,
  LocationBlock,
  CityBlock,
  CaseDateBlock,
} from './intake-wizard/service-geo-blocks';
import { CheckoutPanel, type CheckoutItem, type CheckoutSummary } from './intake-wizard/checkout-panel';

// ─── Static lookup tables ────────────────────────────────────────────────────
// Case-type options remain service-scoped (they describe what petitions exist
// inside a given court tier). Courts and court→city relationships now come
// from the /geo/cities/:id/courts endpoint, backed by pakistan-courts.json.

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
  svc_judicial_federal_shariat: [
    'C.Sh.A.', 'C.Sh.P.', 'C.Sh.R.P.', 'Crl.Sh.A.', 'Crl.Sh.P.', 'Crl.Sh.R.P.',
    'Crl.S.M.Sh.R.P.', 'J.Sh.P.', 'Sh.M.A.', 'Reference.',
  ],
  svc_judicial_supreme_court: [
    'C.A.', 'C.M.A.', 'C.M.Appeal.', 'C.P.', 'C.R.P.', 'C.Sh.A.', 'C.Sh.P.',
    'C.Sh.R.P.', 'Const.P.', 'Crl.A.', 'Crl.M.A.', 'Crl.M.Appeal.', 'Crl.O.P.',
    'Crl.P.', 'Crl.R.P.', 'Crl.S.M.R.P.', 'Crl.S.M.Sh.R.P.', 'Crl.Sh.A.', 'Crl.Sh.P.',
    'Crl.Sh.R.P.', 'D.S.A.', 'H.R.C.', 'H.R.M.A.', 'I.C.A.', 'J.P.', 'J.Sh.P.',
    'Reference.', 'S.M.C.', 'S.M.R.P.',
  ],
};

// Judge designations — first looked up by sub-court / service name (e.g.
// "Sessions Court"), then by court type (e.g. "Lower Court").
const JUDGE_DESIGNATIONS_BY_SERVICE: Record<string, string[]> = {
  'Sessions Court': ['Additional Session Judge', 'District and Session Judge'],
  'Civil Court': ['Civil Judge I', 'Civil Judge II', 'Civil Judge III', 'Civil Judge Rent Controller'],
  'Magisterial Court': ['Civil Judge 1 / Judicial Magistrate Section 30', 'Judicial Magistrate'],
  'Family Court': ['Family Judge', 'Guardian Judge'],
  'Guardian Court': ['Family Judge', 'Guardian Judge'],
  'Federal Constitutional Court': ['Chief Justice Bench', 'Divisional Bench'],
};

const JUDGE_DESIGNATIONS_BY_TYPE: Record<string, string[]> = {
  'Supreme Court': ['Chief Justice Bench', 'Divisional Bench'],
  'High Court': ['Chief Justice', 'Divisional Bench', 'Justice'],
  'Federal Shariat Court': ['Chief Justice', 'Justice'],
  'Federal Constitutional Court': ['Chief Justice Bench', 'Divisional Bench'],
  'Lower Court': [
    'Additional Session Judge', 'District and Session Judge',
    'Civil Judge I', 'Civil Judge II', 'Civil Judge III', 'Civil Judge Rent Controller',
    'Civil Judge 1 / Judicial Magistrate Section 30', 'Judicial Magistrate',
    'Family Judge', 'Guardian Judge',
  ],
  'Special Court': ['Judge Special Court'],
};

const DEFAULT_JUDGE_DESIGNATIONS = [
  'Judge', 'Additional Judge', 'Senior Judge', 'Presiding Officer', 'Chairman',
];


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
  const [allCities, setAllCities] = useState<{ id: string; name: string; province?: string; district?: string }[]>([]);
  const [policeStations, setPoliceStations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    apiClient.get<any>('/geo/provinces').then((r) => setProvinces(r)).catch(() => {});
    apiClient.get<any>('/geo/cities').then((r) => setAllCities(r)).catch(() => {});
  }, []);

  const loadDistricts = useCallback((provinceId: string) => {
    if (!provinceId) { setDistricts([]); setCities([]); setPoliceStations([]); return; }
    apiClient.get<any>(`/geo/provinces/${provinceId}/districts`).then(setDistricts).catch(() => {});
  }, []);

  const loadCities = useCallback((districtId: string) => {
    if (!districtId) { setCities([]); return; }
    apiClient.get<any>(`/geo/districts/${districtId}/cities`).then(setCities).catch(() => {});
  }, []);

  const loadDistrictPoliceStations = useCallback((districtId: string) => {
    if (!districtId) { setPoliceStations([]); return; }
    apiClient.get<any>(`/geo/districts/${districtId}/police-stations`).then(setPoliceStations).catch(() => {});
  }, []);

  return { provinces, districts, cities, allCities, policeStations, loadDistricts, loadCities, loadDistrictPoliceStations };
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

// Case date fields are rendered by CaseDateBlock on the Case Details step for
// flows that include case_status. They are skipped by the default field loop.
// `case_status` itself is also handled there so it renders ABOVE the date block.
const DATE_HANDLED_KEYS = new Set([
  'case_status', 'case_date_status', 'case_date', 'future_date', 'decided_date',
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

  const [selectedServiceCaseTypes, setSelectedServiceCaseTypes] = useState<string[]>([]);
  const [pricingResult, setPricingResult] = useState<{
    matched: boolean;
    basePrice: number;
    attestedCharge: number;
    nonAttestedCharge: number;
    deliveryCharge: number;
    serviceCost: number;
    total: number;
  } | null>(null);
  // Courts available in the currently selected Step-1 city, grouped by court
  // type. Populated from GET /geo/cities/:cityId/courts whenever the user
  // picks (or clears) a city.
  const [cityCourtGroups, setCityCourtGroups] = useState<CityCourtGroup[]>([]);

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

    // Step 1 is a combined "City & Court" step that holds city, service, and
    // (for judicial flows) court pickers. For non-judicial flows the flow's
    // firstStep holds follow-up fields (police-station, office_name, city_type)
    // and is kept as Step 2; for judicial flows firstStep only carried
    // select_service, so we drop it since it's rendered inline on Step 1.
    const [firstStep, ...restSteps] = selectedFlow.steps;
    const isNonJudicial = selectedFlow.key.startsWith('non_judicial');

    const cityCourtStep: IntakeStep = {
      title: isNonJudicial ? 'Location & Service' : 'City, Court & Service',
      fields: [],
    };

    if (isNonJudicial && firstStep) {
      return [cityCourtStep, firstStep, ...restSteps];
    }
    return [cityCourtStep, ...restSteps];
  }, [selectedFlow]);

  const totalSteps = displaySteps.length || 1;
  const activeStep = displaySteps[draft.step - 1] ?? null;
  const displayFlow = useMemo<IntakeFlow | null>(
    () => (selectedFlow ? { ...selectedFlow, steps: displaySteps } : null),
    [displaySteps, selectedFlow],
  );
  const isCityCourtStep = draft.step === 1;
  // FIR/Registry geo blocks only render when the flow's own step exposes those fields.
  // After injecting Location at index 0, the former FIR "Service Selection" step (with
  // province/district/station/city_type fields) now lives at step 2. We keep the
  // city_type chip and station picker on that step, but province/district inputs are
  // hidden because the user already picked them in step 1.
  const stepHasFirGeo = Boolean(activeStep?.fields.some((field) => ['province', 'district_id', 'station_id', 'city_type'].includes(field.key)));
  const stepHasRegistryGeo = Boolean(activeStep?.fields.some((field) => ['office_name', 'city_type'].includes(field.key)));
  // Render smart CaseDateBlock only when the step exposes the full date triad
  // (case_status + case_date + future_date). Case Information / Case Filing /
  // Power of Attorney use different date shapes and keep their flat renderer.
  const stepHasCaseDate = Boolean(
    activeStep?.fields.some((f) => f.key === 'case_status') &&
    activeStep?.fields.some((f) => f.key === 'future_date'),
  );

  // The court types the selected city supports — used to filter judicial
  // services to those whose tier actually has a court in this city.
  const cityCourtTypes: Set<string> = useMemo(
    () => new Set(cityCourtGroups.map((g) => g.type)),
    [cityCourtGroups],
  );

  // Filter services: non-judicial services are always listed; judicial
  // services show only if the city has at least one court of their tier.
  // Judicial services are then ordered by court hierarchy (lowest → highest).
  const availableServices: ServiceHit[] = useMemo(() => {
    const filtered = !draft.payload.city
      ? services
      : services.filter((svc) => {
          if (!svc.courtLevel) return true;
          return cityCourtTypes.has(svc.courtLevel);
        });

    const COURT_RANK: Record<string, number> = {
      'Lower Court': 1,
      'Special Court': 2,
      'High Court': 3,
      'Federal Shariat Court': 4,
      'Federal Constitutional Court': 5,
      'Supreme Court': 6,
    };

    return [...filtered].sort((a, b) => {
      const ra = a.courtLevel ? (COURT_RANK[a.courtLevel] ?? 99) : 100;
      const rb = b.courtLevel ? (COURT_RANK[b.courtLevel] ?? 99) : 100;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [services, cityCourtTypes, draft.payload.city]);

  // For the selected service, find the matching court group (by the service's
  // courtLevel). This is what drives the court picker in Step 1.
  const selectedService = useMemo(
    () => services.find((s) => s.id === draft.serviceId) ?? null,
    [services, draft.serviceId],
  );
  const selectedCourtGroup = useMemo(() => {
    if (!selectedService?.courtLevel) return null;
    return cityCourtGroups.find((g) => g.type === selectedService.courtLevel) ?? null;
  }, [selectedService, cityCourtGroups]);
  const selectedCourtType: string = selectedService?.courtLevel ?? '';
  const selectedCourtList = selectedCourtGroup?.courts ?? [];

  const judgeDesignationOptions: string[] = useMemo(() => {
    const subCourt = draft.payload.select_court ?? '';
    if (subCourt && JUDGE_DESIGNATIONS_BY_SERVICE[subCourt]) {
      return JUDGE_DESIGNATIONS_BY_SERVICE[subCourt];
    }
    if (selectedCourtType && JUDGE_DESIGNATIONS_BY_TYPE[selectedCourtType]) {
      return JUDGE_DESIGNATIONS_BY_TYPE[selectedCourtType];
    }
    return DEFAULT_JUDGE_DESIGNATIONS;
  }, [draft.payload.select_court, selectedCourtType]);

  // When the chosen service + city yields exactly one sub-court for the tier
  // (e.g. Supreme Court → "Supreme Court of Pakistan"), auto-select it so the
  // user isn't forced through a trivial "Supreme Court → Supreme Court"
  // dropdown. Clear the selection if the group becomes empty.
  useEffect(() => {
    if (!selectedService?.courtLevel) return;
    const only = selectedCourtList.length === 1 ? selectedCourtList[0] : null;
    if (only) {
      if (draft.payload.select_court_id === only.id) return;
      setDraft((c) => ({
        ...c,
        payload: {
          ...c.payload,
          select_court: only.name,
          select_court_id: only.id,
          select_court_type: selectedCourtType,
        },
      }));
    } else if (
      selectedCourtList.length === 0 &&
      (draft.payload.select_court_id || draft.payload.select_court)
    ) {
      setDraft((c) => ({
        ...c,
        payload: { ...c.payload, select_court: '', select_court_id: '', select_court_type: '' },
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService?.id, selectedCourtList]);

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
    const flow = draft.flow;
    const p = draft.payload;
    if (!flow || !p.select_court_type) { setPricingResult(null); return; }
    const setType = p.set_type;
    const attestedQty =
      setType === 'attested' ? parseInt(p.attested_qty ?? '0') || 0 :
      setType === 'both' ? parseInt(p.both_attested_qty ?? '0') || 0 : 0;
    const nonAttestedQty =
      setType === 'non_attested' ? parseInt(p.non_attested_qty ?? '0') || 0 :
      setType === 'both' ? parseInt(p.both_non_attested_qty ?? '0') || 0 : 0;
    const caseYear = parseInt(p.case_year ?? p.year ?? '0') || undefined;

    apiClient.post<any>('/pricing-rules/resolve', {
      flow,
      courtLevel: p.select_court_type || undefined,
      caseStatus: p.case_status || undefined,
      caseYear,
      setType: setType || undefined,
      attestedQty,
      nonAttestedQty,
      province: p.province ?? p.province_capital ?? undefined,
      city: p.select_court_city ?? p.city ?? undefined,
    })
      .then((r) => setPricingResult(r))
      .catch(() => setPricingResult(null));
  }, [
    draft.flow,
    draft.payload.select_court_type,
    draft.payload.select_court_city,
    draft.payload.city,
    draft.payload.case_status,
    draft.payload.case_year,
    draft.payload.year,
    draft.payload.set_type,
    draft.payload.attested_qty,
    draft.payload.non_attested_qty,
    draft.payload.both_attested_qty,
    draft.payload.both_non_attested_qty,
  ]);

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
    setDraft((c) => ({
      ...c,
      serviceId: '',
      payload: {
        ...c.payload,
        city_id: cityId,
        city: name,
        select_court_city: name,
        select_service: '',
        select_court: '',
        select_court_id: '',
        select_court_type: '',
        case_type: '',
        judge_designation: '',
      },
    }));
    setSelectedServiceCaseTypes([]);
    if (!cityId) {
      setCityCourtGroups([]);
      return;
    }
    apiClient
      .get<CityCourtGroup[]>(`/geo/cities/${cityId}/courts`)
      .then((r) => setCityCourtGroups(r ?? []))
      .catch(() => setCityCourtGroups([]));
  };

  const applySelectedService = useCallback((id: string, name: string, caseTypes: string[]) => {
    const courtLevel = availableServices.find((s) => s.id === id)?.courtLevel ?? '';
    setField('serviceId', id);
    setPayloadField('select_service', name || id);
    setSelectedServiceCaseTypes(SERVICE_CASE_TYPES[id] ?? caseTypes);
    setPayloadField('select_court', '');
    setPayloadField('select_court_id', '');
    setPayloadField('select_court_type', courtLevel);
    setPayloadField('judge_designation', '');
  }, [availableServices]);

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

  const isFirFlow = draft.flow === 'non_judicial_copy_of_fir';

  const validateLocationStep = useCallback(() => {
    if (!draft.consumerId) {
      setApiError(isConsumerVariant ? 'Your account information is missing.' : 'Please select a consumer');
      return false;
    }
    if (isFirFlow) {
      if (!geoIds.provinceId) {
        setApiError('Please select a province');
        return false;
      }
      if (!geoIds.districtId) {
        setApiError('Please select a district');
        return false;
      }
    }
    if (!geoIds.cityId) {
      setApiError('Please select a city');
      return false;
    }
    return true;
  }, [draft.consumerId, geoIds.cityId, geoIds.districtId, geoIds.provinceId, isConsumerVariant, isFirFlow]);

  const validateServiceStep = useCallback(() => {
    if (!draft.serviceId) {
      setApiError('Please select a court');
      return false;
    }
    if (isJudicial && !draft.payload.select_court) {
      setApiError('Please select a service');
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
    if (isCityCourtStep) return validateLocationStep() && validateServiceStep();

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
    setSelectedServiceCaseTypes([]);
    setCityCourtGroups([]);
    setGeoIds({ provinceId: '', districtId: '', cityId: '' });
    setTouched({});
    setErrors({});
    setUploadError('');
    setDocumentsPanelOpen(false);
    setLastSavedAt(null);
  };

  // Checkout summary — derives display items from draft payload. When a pricing
  // rule is matched, real amounts are shown; otherwise amounts remain null ("—").
  const checkoutSummary: CheckoutSummary = useMemo(() => {
    const p = draft.payload;
    const items: CheckoutItem[] = [];
    const pr = pricingResult;

    if (selectedFlow?.label) {
      items.push({ label: 'Intake type', detail: selectedFlow.label, amount: null });
    }
    if (p.select_service) {
      items.push({ label: 'Court', detail: p.select_service, amount: null });
    }
    if (p.city) {
      items.push({ label: 'City', detail: p.city, amount: null });
    }
    if (p.select_court) {
      items.push({ label: 'Service', detail: p.select_court, amount: null });
    }

    // Pricing breakdown — only show when matched
    if (pr?.matched) {
      if (pr.basePrice > 0) {
        items.push({ label: 'Base fee', amount: pr.basePrice });
      }
      if (pr.attestedCharge > 0) {
        items.push({ label: 'Attested copies', amount: pr.attestedCharge });
      }
      if (pr.nonAttestedCharge > 0) {
        items.push({ label: 'Non-attested copies', amount: pr.nonAttestedCharge });
      }
      if (pr.deliveryCharge > 0) {
        items.push({ label: 'Delivery', amount: pr.deliveryCharge });
      }
    } else {
      // Keep existing delivery_mode display when no pricing match
      if (p.delivery_mode) {
        items.push({ label: 'Delivery', detail: p.delivery_mode, amount: null });
      }
    }

    return {
      items,
      subtotal: pr?.matched ? pr.serviceCost : null,
      fees: null,
      total: pr?.matched ? pr.total : null,
      currency: 'PKR',
    };
  }, [draft.payload, pricingResult, selectedFlow]);

  const submitTicket = async () => {
    if (!selectedFlow || !validateCurrentStep()) return;
    setLoading(true); setApiError('');
    try {
      const p = draft.payload;
      const sets =
        p.set_type === 'attested' ? (p.attested_qty ?? '') :
        p.set_type === 'non_attested' ? (p.non_attested_qty ?? '') :
        p.set_type === 'both' ? (p.both_attested_qty ?? '') :
        '';
      const ticket = await apiClient.post<any>(selectedFlow.endpoint, {
        consumerId: draft.consumerId,
        serviceId: draft.serviceId,
        serviceCity:
          p.city ??
          p.select_court_city ??
          p.district_name ??
          '',
        caseType:
          p.case_type ??
          p.offence ??
          p.case_title ??
          '',
        payload: { ...p, sets, source: 'next-web-intake' },
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
    <div className={`mx-auto ${isConsumerVariant ? 'max-w-5xl' : 'max-w-6xl'}`}>
      <div className="mb-8">
        <h2 className={`${isConsumerVariant ? 'text-3xl' : 'text-2xl'} font-bold tracking-tight text-slate-900`}>
          {headingTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{headingCopy}</p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-8">

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

          {isCityCourtStep && (
            <>
              {isFirFlow ? (
                <LocationBlock
                  geo={geo}
                  geoIds={geoIds}
                  onProvinceChange={handleProvinceChange}
                  onDistrictChange={handleDistrictChange}
                  onCityChange={handleCityChange}
                />
              ) : (
                <CityBlock
                  cities={geo.allCities}
                  cityId={geoIds.cityId}
                  onCityChange={handleCityChange}
                />
              )}

              <label className="space-y-1 block md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Court<span className="text-rose-500 ml-0.5">*</span></span>
                {!draft.payload.city ? (
                  <p className="mt-1 rounded-xl bg-surface-muted/50 p-3 text-sm text-slate-500 ring-1 ring-inset ring-border-soft">
                    Select a city above to see available courts.
                  </p>
                ) : availableServices.length === 0 ? (
                  <p className="mt-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-100">
                    No courts are available in {draft.payload.city}. Pick a different city.
                  </p>
                ) : (
                  <ServiceCardGrid
                    services={availableServices}
                    value={draft.serviceId}
                    onSelect={(service) =>
                      applySelectedService(
                        service.id,
                        service.name,
                        service.caseTypes ?? [],
                      )
                    }
                  />
                )}
              </label>

              {isJudicial && draft.serviceId && (
                <JudicialServiceBlock
                  courtTierId={draft.serviceId}
                  cityName={draft.payload.city ?? ''}
                  courtTierName={selectedCourtType}
                  services={selectedCourtList}
                  selectServiceId={draft.payload.select_court_id ?? ''}
                  onServiceChange={(court) => {
                    setDraft((c) => ({
                      ...c,
                      payload: {
                        ...c.payload,
                        select_court: court.name,
                        select_court_id: court.id,
                        select_court_type: selectedCourtType,
                        judge_designation: '',
                      },
                    }));
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

          {stepHasCaseDate && (() => {
            const caseStatusField = activeStep?.fields.find((f) => f.key === 'case_status');
            if (!caseStatusField) return null;
            const errorMsg = touched['case_status'] ? (errors['case_status'] ?? '') : '';
            const rendered = renderField(
              caseStatusField,
              draft.payload.case_status ?? '',
              draft.payload,
              setPayloadField,
              undefined,
              handleFieldBlur,
              errorMsg,
            );
            return (
              <div className={`space-y-1 ${colSpan(caseStatusField)}`}>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    {caseStatusField.label}
                    {caseStatusField.required ? <span className="text-rose-500 ml-0.5">*</span> : null}
                  </label>
                  {isConsumerVariant && caseStatusField.hint ? (
                    <p className="mt-1 text-xs text-slate-500">{caseStatusField.hint}</p>
                  ) : null}
                </div>
                {rendered}
              </div>
            );
          })()}

          {stepHasCaseDate && (
            <CaseDateBlock
              caseStatus={draft.payload.case_status ?? ''}
              isUnknown={draft.payload.case_date_status === 'Unknown'}
              caseDate={draft.payload.case_date ?? ''}
              futureDate={draft.payload.future_date ?? ''}
              decidedDate={draft.payload.decided_date ?? ''}
              inputClass={inputClass}
              onCaseDateChange={(v) => setPayloadField('case_date', v)}
              onFutureDateChange={(v) => setPayloadField('future_date', v)}
              onDecidedDateChange={(v) => setPayloadField('decided_date', v)}
              onUnknownToggle={(unknown) => {
                setDraft((c) => ({
                  ...c,
                  payload: {
                    ...c.payload,
                    case_date_status: unknown ? 'Unknown' : 'Known',
                    ...(unknown ? { future_date: '', decided_date: '' } : {}),
                  },
                }));
              }}
            />
          )}

          {!isCityCourtStep && activeStep?.fields
            .filter((f) => !GEO_HANDLED_KEYS.has(f.key) && !DATE_HANDLED_KEYS.has(f.key))
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
        <CheckoutPanel summary={checkoutSummary} hasFlow={Boolean(draft.flow)} />
      </div>
    </div>
  );
}
