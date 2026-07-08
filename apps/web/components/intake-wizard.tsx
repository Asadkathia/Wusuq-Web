/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo, useEffect, useState, useCallback, useRef, startTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { buildFutureTicketsPayload } from '@/lib/future-tickets';
import { buildRegeneratePayload } from '@/lib/regenerate-ticket';
import { PanelCard } from '@/components/ui/panel-card';
import { ChevronRight, CheckCircle2, FolderOpen, Pencil, Sparkles, X } from 'lucide-react';
import type { IntakeFlow, IntakeStep, CourtTier } from '@/lib/intake-flows';
import { courtTierFromCourtType, resolveRequired, docBundleLabel, normalizeDraftPayload, isStructuredAddressComplete, computeYearBand, parseBench, showWhenSatisfied, parseCities, stringifyCities, isFlowAvailableForCurrency, parseDeliveryAddress } from '@/lib/intake-flows';
import { BENCH_TYPE_LABELS } from '@/lib/bench-types';
import type { YearBand } from '@/lib/intake-flows';
import { judgeDesignationsForCaseType } from '@/lib/judge-designations';
import { buildPricingResolveInput, computeTicketTotal, computeCaseSearchBase, computeDecidedAgeSurcharge } from '@wusuq/shared';

import type { IntakeWizardProps, TicketDraft, ServiceHit, LocalUser, CityCourtGroup } from './intake-wizard/types';
import { StepRail } from './intake-wizard/step-rail';
import { FutureTicketsBanner } from './intake-wizard/future-tickets-banner';
import { RegenerateBanner } from './intake-wizard/regenerate-banner';
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
import { paymentModelFor } from '@wusuq/shared';

// ─── Static lookup tables ────────────────────────────────────────────────────
// Courts and court→city relationships come from the /geo/cities/:id/courts
// endpoint, backed by pakistan-courts.json. Case-type options now come from
// GET /case-types (see selectedServiceCaseTypes loader in the component), so
// the legacy SERVICE_CASE_TYPES / SUBCOURT_CASE_TYPES constants have been
// removed (PDF #18-#21b, including the "Other" free-text fallback).

// Judge designations — first looked up by sub-court / service name (e.g.
// "Sessions Court"), then by court type (e.g. "Lower Court").
const JUDGE_DESIGNATIONS_BY_SERVICE: Record<string, string[]> = {
  'Sessions Court': ['District and Session Judge', 'Additional Session Judge'],
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
    'District and Session Judge', 'Additional Session Judge',
    'Civil Judge I', 'Civil Judge II', 'Civil Judge III', 'Civil Judge Rent Controller',
    'Civil Judge 1 / Judicial Magistrate Section 30', 'Judicial Magistrate',
    'Family Judge', 'Guardian Judge',
  ],
  'Special Court': ['Judge Special Court'],
};

const DEFAULT_JUDGE_DESIGNATIONS = [
  'Judge', 'Additional Judge', 'Senior Judge', 'Presiding Officer', 'Chairman',
];

// Bench composition options per court tier (PDF #15, #16).
// `count` is the expected number of judge-name inputs to render.
const BENCH_TYPES_BY_TIER: Record<CourtTier, Array<{ value: string; label: string; count: number }>> = {
  lower:    [{ value: 'single_judge', label: BENCH_TYPE_LABELS.single_judge, count: 1 }],
  special:  [{ value: 'single_judge', label: BENCH_TYPE_LABELS.single_judge, count: 1 }],
  high:     [
    { value: 'single_judge', label: BENCH_TYPE_LABELS.single_judge, count: 1 },
    { value: 'db_2',         label: BENCH_TYPE_LABELS.db_2,         count: 2 },
    { value: 'fb_3',         label: BENCH_TYPE_LABELS.fb_3,         count: 3 },
    { value: 'larger',       label: BENCH_TYPE_LABELS.larger,       count: 5 },
  ],
  shariat:  [
    { value: 'single_judge', label: BENCH_TYPE_LABELS.single_judge, count: 1 },
    { value: 'db_2',         label: BENCH_TYPE_LABELS.db_2,         count: 2 },
    { value: 'fb_3',         label: BENCH_TYPE_LABELS.fb_3,         count: 3 },
  ],
  supreme:  [
    { value: 'single_judge', label: BENCH_TYPE_LABELS.single_judge, count: 1 },
    { value: 'db_2',         label: BENCH_TYPE_LABELS.db_2,         count: 2 },
    { value: 'fb_3',         label: BENCH_TYPE_LABELS.fb_3,         count: 3 },
    { value: 'larger_5',     label: BENCH_TYPE_LABELS.larger_5,     count: 5 },
    { value: 'larger_7',     label: BENCH_TYPE_LABELS.larger_7,     count: 7 },
  ],
  fcc:      [
    { value: 'single_judge', label: BENCH_TYPE_LABELS.single_judge, count: 1 },
    { value: 'db_2',         label: BENCH_TYPE_LABELS.db_2,         count: 2 },
    { value: 'fb_3',         label: BENCH_TYPE_LABELS.fb_3,         count: 3 },
    { value: 'larger',       label: BENCH_TYPE_LABELS.larger,       count: 5 },
  ],
};

export { BENCH_TYPES_BY_TIER };


export function ServiceCardGrid({
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
  'Case Filing': 'Start a new filing request and share the core case particulars.',
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
export function IntakeWizard({
  title,
  flows,
  variant = 'admin',
  caseId,
  lockedConsumerId,
  initialPayload,
}: IntakeWizardProps) {
  const [draft, setDraft] = useState<TicketDraft>({
    flow: flows[0]?.key ?? '',
    consumerId: lockedConsumerId ?? '',
    serviceId: '',
    step: 1,
    payload: initialPayload ?? {},
  });
  const [, setConsumerLabel] = useState('');
  const [isConsumer, setIsConsumer] = useState(false);
  const [isAdminTestingMode, setIsAdminTestingMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<LocalUser | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  // PDF #43 — per-file caption tagged by the consumer (Petition, PoA, etc.).
  // Parallel-indexed with `files`; entries default to empty string and stay
  // in sync via addFiles/removeFileAt below.
  const [fileCaptions, setFileCaptions] = useState<string[]>([]);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHydrateRef = useRef(false);
  // B9: guards the delivery-address profile-address prefill so it fires at
  // most once per consumer (never re-seeds after the user edits/clears it).
  const deliveryAddressSeededForRef = useRef<string | null>(null);
  const [services, setServices] = useState<ServiceHit[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [documentsPanelOpen, setDocumentsPanelOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // Tax rate fetched from /settings/tax on mount (0 = disabled / not configured).
  const [taxRate, setTaxRate] = useState(0);
  // Consumer billing currency (PKR default; USD for international customers).
  // Seeded from the stored user and confirmed via /wallet/me on mount.
  const [currency, setCurrency] = useState<'PKR' | 'USD'>('PKR');
  // Promo-code state: the code the user typed, the validated discount amount,
  // and any validation error message.
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [draft.step]);
  const [apiError, setApiError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Case-type options shown in Step 2's dropdown. Fetched from GET /case-types
  // keyed on (courtLevel, subCourt, district). The API implements the
  // specificity-fallback chain (sub-court + district → sub-court → court level)
  // and always appends an "Other" row. We keep storing labels in payload (no
  // wire-format change) and detect the Other reveal via
  // `payload.case_type === 'Other'`.
  const [selectedServiceCaseTypes, setSelectedServiceCaseTypes] = useState<string[]>([]);

  useEffect(() => {
    const courtLevel = draft.payload.select_court_type;
    if (!courtLevel) {
      setSelectedServiceCaseTypes([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ courtLevel });
    if (draft.payload.select_court) params.set('subCourt', draft.payload.select_court);
    if (draft.payload.select_court_city) params.set('district', draft.payload.select_court_city);
    apiClient
      .get<Array<{ code: string; label: string; source: string }>>(
        `/case-types?${params.toString()}`,
      )
      .then((rows) => {
        if (cancelled) return;
        setSelectedServiceCaseTypes(rows.map((r) => r.label));
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedServiceCaseTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [
    draft.payload.select_court_type,
    draft.payload.select_court,
    draft.payload.select_court_city,
  ]);
  const [pricingResult, setPricingResult] = useState<{
    matched: boolean;
    available?: boolean;
    reason?: string;
    basePrice: number;
    base?: number;
    pdfSurcharge?: number;
    deliveryFee?: number;
    titleSurcharge?: number;
    ageSurcharge?: number;
    bundleSurcharge?: number;
    searchBothSurcharge?: number;
    cityCount?: number;
    attestedCharge: number;
    nonAttestedCharge: number;
    deliveryCharge: number;
    serviceCost: number;
    total: number;
    turnaroundLabel?: string | null;
  } | null>(null);
  // Per-option availability for the Set Type picker. Populated by the
  // /pricing-rules/availability endpoint whenever the relevant context
  // (court level, case status, year band, city) changes. The wizard uses
  // this to grey-out "Can't Get" combinations rather than letting the user
  // submit a request that the resolver will reject.
  const [setTypeAvailability, setSetTypeAvailability] = useState<Record<string, boolean>>({});
  // Courts available in the currently selected Step-1 city, grouped by court
  // type. Populated from GET /geo/cities/:cityId/courts whenever the user
  // picks (or clears) a city.
  const [cityCourtGroups, setCityCourtGroups] = useState<CityCourtGroup[]>([]);
  // True while /geo/cities/:cityId/courts is in flight. Distinguishes "haven't
  // fetched yet" from "fetched, result was empty" so the UI can render a
  // loading state instead of a misleading "No courts available" message.
  const [cityCourtsLoading, setCityCourtsLoading] = useState(false);
  // Whether the courts fetch for the CURRENT city has RESOLVED (vs. not-started
  // or in-flight). An empty `cityCourtGroups` is otherwise ambiguous — "still
  // loading" vs. "this city genuinely has no courts" — which made the picker
  // spin forever on court-less cities (e.g. the stray district-named "Hunza"
  // city whose seats actually live on Aliabad/Gojal). Reset to false at the
  // start of every courts fetch; set true in each fetch's finally.
  const [cityCourtsLoaded, setCityCourtsLoaded] = useState(false);
  // Monotonic request counter for the courts fetch. Each fetch captures the
  // current value; its .then/.finally only apply state when still the latest.
  // Closes a stale-response race: rapidly switching city A→B (A court-less, B
  // not) could otherwise let A's later-arriving empty response overwrite B's
  // courts, mis-rendering "No courts available in B".
  const cityCourtsReqRef = useRef(0);
  // Stale-response guard for promo validation: mirrors cityCourtsReqRef.
  // Incremented before each /promos/validate request and on resetForm so that
  // a late response can't overwrite a reset's 0 with a non-zero discount.
  const promoReqRef = useRef(0);
  // QA: autosave/submit race guard. The 5s debounced autosave fires from a
  // closure that captures the pre-submit draft. If it lands at the server
  // AFTER the submit-side draft delete, it upserts a phantom draft with the
  // old payload — which the wizard happily restores on the next visit,
  // pre-filling the previous ticket's title/etc. Setting this ref ahead of
  // the submit POST blocks the autosave from firing during and after the
  // submit; resetForm() clears it so the next intake can autosave normally.
  const submittingRef = useRef(false);
  // Idempotency key for the CURRENT submission attempt. Minted on the first
  // submit of a draft and kept across failed retries (so a re-click after a
  // lost response replays the SAME key and the server returns the original
  // ticket instead of duplicating); cleared on success via resetForm.
  const submitRequestIdRef = useRef<string | null>(null);
  // QA: when the wizard hydrates an existing server draft on mount we surface
  // a "Resumed your previous draft" banner so the restore behaviour is
  // explicit. Dismissed automatically as soon as the user opens Start Fresh
  // or successfully submits.
  const [resumedDraftAt, setResumedDraftAt] = useState<string | null>(null);

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

  // Fetch the platform tax rate once on wizard mount. startTransition avoids
  // the React 19 "setState synchronously in effect body" lint rule.
  useEffect(() => {
    apiClient.get<{ rate: number }>('/settings/tax/rate')
      .then((r) => { startTransition(() => setTaxRate(r.rate)); })
      .catch(() => {});
  }, []);

  // Resolve the consumer's billing currency. /wallet/me is authoritative (it
  // reads User.currency server-side); the stored user is the instant seed.
  useEffect(() => {
    apiClient.get<{ currency?: 'PKR' | 'USD' }>('/wallet/me')
      .then((r) => { if (r.currency) startTransition(() => setCurrency(r.currency!)); })
      .catch(() => {});
  }, []);

  // Admin / staff acting on behalf of a consumer (incl. the staff Regenerate
  // flow, where consumerId is the source ticket's owner): the preview must use
  // the TARGET consumer's currency, not the acting staff member's /wallet/me.
  useEffect(() => {
    const cid = draft.consumerId;
    if (!cid || !currentUser?.id || cid === currentUser.id) return;
    apiClient.get<{ currency?: 'PKR' | 'USD' }>(`/users/${cid}`)
      .then((r) => { if (r.currency) startTransition(() => setCurrency(r.currency!)); })
      .catch(() => {});
  }, [draft.consumerId, currentUser?.id]);

  // B9: prefill the structured delivery address's `house` line from the
  // intake consumer's saved profile address (serializeUser returns
  // `address`). Unlike the currency effect above, this must ALSO run for
  // self-intake (cid === currentUser.id) — there's no self-serving endpoint
  // like /wallet/me for address, so /users/:id is fetched unconditionally
  // once a consumer id is known. Only fires for flows that actually expose a
  // `delivery_address` field (Case Files / Case Search TCS branch), seeds at
  // most once per consumer, and never overwrites a value the user already
  // entered (draft-resume, or having already typed something in).
  const flowHasDeliveryAddress = useMemo(
    () => Boolean(selectedFlow?.steps.some((s) => s.fields.some((f) => f.key === 'delivery_address'))),
    [selectedFlow],
  );
  useEffect(() => {
    const cid = draft.consumerId;
    if (!cid || !flowHasDeliveryAddress) return;
    if (deliveryAddressSeededForRef.current === cid) return;
    if (parseDeliveryAddress(draft.payload.delivery_address).house.trim()) {
      // Already has a value (resumed draft, or the user typed one) — don't
      // fetch or overwrite; mark seeded so we don't re-check every render.
      deliveryAddressSeededForRef.current = cid;
      return;
    }
    // Self-intake reads /users/me (consumers can't hit the staff-only
    // /users/:id); staff-on-behalf reads the target consumer's /users/:id.
    const profileUrl = cid === currentUser?.id ? '/users/me' : `/users/${cid}`;
    apiClient.get<{ address?: string }>(profileUrl)
      .then((r) => {
        deliveryAddressSeededForRef.current = cid;
        if (!r.address?.trim()) return;
        startTransition(() => {
          setDraft((c) => {
            const existing = parseDeliveryAddress(c.payload.delivery_address);
            if (existing.house.trim()) return c; // never overwrite a non-empty value
            return {
              ...c,
              payload: {
                ...c.payload,
                delivery_address: JSON.stringify({ ...existing, house: r.address!.trim() }),
              },
            };
          });
        });
      })
      .catch(() => { deliveryAddressSeededForRef.current = cid; });
  }, [draft.consumerId, draft.payload.delivery_address, flowHasDeliveryAddress, currentUser?.id]);

  // Clear a stale "Non Attested" selection when the user flips to Decided Case,
  // since that option is hidden in this configuration.
  useEffect(() => {
    if (draft.payload.case_status === 'Decided Case' && draft.payload.set_type === 'non_attested') {
      setDraft((c) => ({ ...c, payload: { ...c.payload, set_type: '', non_attested_qty: '' } }));
    }
  }, [draft.payload.case_status, draft.payload.set_type]);

  // 5-19-26 #6: for Decided cases, decided_date is the canonical year source
  // (drives the pricing band). The `year` input is hidden for Decided cases
  // (see intake-flows.ts). `withDerivedYear` derives `payload.year` from
  // `decided_date` at submit/save time so backend validators in
  // REQUIRED_FIELDS_BY_FLOW (case_year) and the pricing resolver (caseYear)
  // still see a value. No effect-based mirroring — derive on use.
  const withDerivedYear = useCallback(
    (p: Record<string, string | undefined>): Record<string, string | undefined> => {
      let next = p;
      // Re-stamp the TCS delivery_address city from the (pinned) case city at
      // every save/submit, so a city change AFTER the address step can't leave a
      // stale denormalized city in the JSON → dispatch to the wrong city. The
      // city is read-only in the renderer, so this never overrides user intent.
      if (next.delivery_address && next.city) {
        const addr = parseDeliveryAddress(next.delivery_address);
        if ((addr.city ?? '') !== next.city) {
          next = {
            ...next,
            delivery_address: JSON.stringify({ ...addr, city: next.city }),
          };
        }
      }
      if (next.case_status !== 'Decided Case') return next;
      if (next.year) return next;
      const m = /^(\d{4})/.exec(next.decided_date ?? '');
      if (!m) return next;
      return { ...next, year: m[1] };
    },
    [],
  );

  // Validate a promo code against the server. On success, sets promoDiscount
  // so the checkout total updates immediately. On failure, shows the reason and
  // resets the discount to 0.
  const validatePromo = useCallback(async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError('');
    const reqId = ++promoReqRef.current;
    const matchedAndAvailable = pricingResult?.matched && pricingResult.available !== false;
    const billedBase = matchedAndAvailable
      ? (paymentModelFor(draft.flow) === 'SPLIT' ? pricingResult!.serviceCost : pricingResult!.total)
      : 0;
    try {
      const r = await apiClient.post<{ valid: boolean; reason?: string; discount: number }>(
        '/promos/validate',
        { code: promoCode.trim(), flow: draft.flow, subtotal: billedBase },
      );
      if (promoReqRef.current !== reqId) return;
      if (r.valid) {
        startTransition(() => setPromoDiscount(r.discount));
      } else {
        startTransition(() => {
          setPromoDiscount(0);
          setPromoError(r.reason ?? 'Invalid promo code');
        });
      }
    } catch (e: any) {
      if (promoReqRef.current !== reqId) return;
      startTransition(() => {
        setPromoDiscount(0);
        setPromoError(e.message ?? 'Could not validate promo code');
      });
    } finally {
      if (promoReqRef.current === reqId) setPromoLoading(false);
    }
  }, [promoCode, draft.flow, pricingResult]);

  // Apply any per-field `defaultValue` declared in the flow to the payload
  // when the flow changes, so radios/selects start preselected.
  useEffect(() => {
    if (!selectedFlow) return;
    setDraft((c) => {
      const next = { ...c.payload };
      let changed = false;
      for (const step of selectedFlow.steps) {
        for (const f of step.fields) {
          if (f.defaultValue !== undefined && (next[f.key] === undefined || next[f.key] === '')) {
            next[f.key] = f.defaultValue;
            changed = true;
          }
        }
      }
      return changed ? { ...c, payload: next } : c;
    });
  // Re-run when draftId becomes available so that defaults are re-applied
  // AFTER server-side draft hydration overwrites the payload.
  }, [selectedFlow, draft.draftId]);

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
  // The case_status header + CaseDateBlock render together. Gate them on the
  // case_status field's own showWhen so Case Search — which only shows
  // case_status (and the date block) for search_method = details/both — keeps
  // the block hidden for CNIC-only searches. Case Files / Case Information have
  // no showWhen on case_status, so this is always true for them. NOTE: the flat
  // field loop's DATE_HANDLED_KEYS skip below stays keyed on `stepHasCaseDate`
  // so those keys never fall through to the flat renderer when the block is
  // hidden (they simply don't render — correct for a CNIC-only search).
  const caseDateBlockVisible =
    stepHasCaseDate &&
    (() => {
      const csf = activeStep?.fields.find((f) => f.key === 'case_status');
      return !csf || showWhenSatisfied(csf, draft.payload);
    })();

  // The court types the selected city supports — used to filter judicial
  // services to those whose tier actually has a court in this city.
  const cityCourtTypes: Set<string> = useMemo(
    () => new Set(cityCourtGroups.map((g) => g.type)),
    [cityCourtGroups],
  );

  // Filter services: non-judicial services are always listed; judicial
  // services show only if the city has at least one court of their tier.
  // Judicial services are then ordered by court hierarchy (lowest → highest).
  // 5-19-26 bug #6: when a flow declares a defaultServiceId, restrict the
  // picker to that one service. The flow's URL already commits the consumer
  // to it (e.g. /registry-deed shouldn't surface FIR / Criminal Record as
  // alternates). The defaultServiceId effect would auto-select it anyway,
  // but the picker rendered all 3 tiles in the meantime — confusing because
  // the page heading already says "Registry/Deed".
  const availableServices: ServiceHit[] = useMemo(() => {
    const defaultId = selectedFlow?.defaultServiceId;
    const base = defaultId
      ? services.filter((svc) => svc.id === defaultId)
      : services;
    const filtered = !draft.payload.city
      ? base
      : base.filter((svc) => {
          if (!svc.courtLevel) return true;
          return cityCourtTypes.has(svc.courtLevel);
        });

    const COURT_RANK: Record<string, number> = {
      'Lower Court': 1,
      'Special Court': 2,
      'High Court': 3,
      'Federal Shariat Court': 4,
      'Supreme Court': 5,
      'Federal Constitutional Court': 6,
    };

    return [...filtered].sort((a, b) => {
      const ra = a.courtLevel ? (COURT_RANK[a.courtLevel] ?? 99) : 100;
      const rb = b.courtLevel ? (COURT_RANK[b.courtLevel] ?? 99) : 100;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [services, cityCourtTypes, draft.payload.city, selectedFlow?.defaultServiceId]);

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

  // Reconcile serviceId from a hydrated court tier once `services` finishes
  // loading. The edit/regenerate/future prefill effects write draft.payload
  // (incl. select_court_type) but CAN'T set serviceId, because `services` is
  // fetched async and is still empty when they run. Everything that shows a
  // field as "selected" — the court-tier tile, the specific-court picker, the
  // judge-designation options — derives from draft.serviceId, so without this
  // an edited ticket opens with the court level unselected + judge blank.
  // Guarded on empty serviceId so it never fights a live user selection.
  useEffect(() => {
    if (draft.serviceId) return;
    const tier = draft.payload.select_court_type;
    if (!tier || services.length === 0) return;
    const match = services.find((s) => s.courtLevel === tier);
    if (!match) return;
    startTransition(() =>
      setDraft((c) => (c.serviceId ? c : { ...c, serviceId: match.id })),
    );
  }, [services, draft.payload.select_court_type, draft.serviceId]);

  // Active court tier governs per-tier `requiredByCourtTier` overrides on
  // intake fields. Derive from the payload-persisted select_court_type so
  // the value survives draft hydration and admin pre-fill.
  const activeCourtTier: CourtTier | null = useMemo(
    () => courtTierFromCourtType(draft.payload.select_court_type ?? selectedCourtType),
    [draft.payload.select_court_type, selectedCourtType],
  );

  const judgeDesignationOptions: string[] = useMemo(() => {
    // B7: Family/Guardian case types have exactly one correct designation
    // regardless of the resolved sub-court — check this first.
    const byType = judgeDesignationsForCaseType(draft.payload.case_type);
    if (byType) return byType;
    const subCourt = draft.payload.select_court ?? '';
    if (subCourt && JUDGE_DESIGNATIONS_BY_SERVICE[subCourt]) {
      return JUDGE_DESIGNATIONS_BY_SERVICE[subCourt];
    }
    if (selectedCourtType && JUDGE_DESIGNATIONS_BY_TYPE[selectedCourtType]) {
      return JUDGE_DESIGNATIONS_BY_TYPE[selectedCourtType];
    }
    return DEFAULT_JUDGE_DESIGNATIONS;
  }, [draft.payload.case_type, draft.payload.select_court, selectedCourtType]);

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
    // 5-24-26 #8/#9: don't clear a resumed court selection while courts are still loading — that wiped court + pricing on draft resume.
    } else if (
      !cityCourtsLoading &&
      cityCourtGroups.length > 0 &&
      selectedCourtList.length === 0 &&
      (draft.payload.select_court_id || draft.payload.select_court)
    ) {
      setDraft((c) => ({
        ...c,
        payload: { ...c.payload, select_court: '', select_court_id: '', select_court_type: '' },
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService?.id, selectedCourtList, cityCourtsLoading, cityCourtGroups]);

  const setField = (field: keyof TicketDraft, value: string | number) =>
    setDraft((c) => ({ ...c, [field]: value }));

  const setPayloadField = (key: string, value: string) =>
    setDraft((c) => ({ ...c, payload: { ...c.payload, [key]: value } }));

  useEffect(() => {
    if (draft.flow === 'non_judicial_registry_deed' && draft.payload.office_name !== 'Sub Registrar') {
      setPayloadField('office_name', 'Sub Registrar');
    }
  }, [draft.flow, draft.payload.office_name]);

  // ── Pricing resolver — recompute total whenever the payload's pricing
  //    inputs change. Surfaces base/PDF/delivery surcharges in the checkout.
  // 5-19-26 bug #4: debounced by 400ms — click-heavy steps (set-type, qty
  // increments, delivery mode toggles) used to fire a resolve per change and
  // exhaust the per-user 15/min rate limit, leaving the consumer staring at
  // a stale checkout while requests 429'd. Debounce coalesces rapid-fire
  // changes into a single request and the trailing tick reflects the final
  // state.
  useEffect(() => {
    const flow = draft.flow;
    const p = draft.payload;
    // Audit 1.4: the gate is per-flow — non-judicial flows have no
    // select_court_type, so gating every flow on it left their checkout
    // permanently quote-less ("—") while the server billed whatever the
    // resolver said. Judicial flows still wait for a court tier (the
    // resolver needs it); non-judicial flows resolve as soon as the flow is
    // known and re-resolve as location fields land.
    const needsCourtType = flow.startsWith('judicial');
    if (!flow || (needsCourtType && !p.select_court_type)) {
      setPricingResult(null);
      return;
    }

    // Build the resolver input with the SAME shared mapper the server uses in
    // createIntakeTicket (buildPricingResolveInput). This guarantees the live
    // checkout quote and the persisted charge are computed from identical
    // inputs — no hand-maintained field list to drift (yearBand/caseTitle/
    // cityCount/searchMethod were previously dropped server-side).
    const resolveInput = buildPricingResolveInput(flow, p, currency);

    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      apiClient.post<any>('/pricing-rules/resolve', resolveInput)
        .then((r) => { if (!cancelled) setPricingResult(r); })
        .catch(() => { if (!cancelled) setPricingResult(null); });
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [
    draft.flow,
    draft.payload.select_court_type,
    draft.payload.select_court_city,
    draft.payload.city,
    // Audit 5.5: the shared builder reads city_id / province /
    // province_capital — omitting them risked a stale quote one edit away.
    draft.payload.city_id,
    draft.payload.province,
    draft.payload.province_capital,
    draft.payload.case_status,
    draft.payload.case_year,
    draft.payload.year,
    draft.payload.decided_date,
    draft.payload.set_type,
    draft.payload.attested_qty,
    draft.payload.non_attested_qty,
    draft.payload.both_attested_qty,
    draft.payload.both_non_attested_qty,
    draft.payload.want_pdf_before_dispatch,
    draft.payload.delivery_mode,
    draft.payload.case_title,
    draft.payload.cities,
    draft.payload.search_method,
    draft.payload.required_documentations,
    currency,
  ]);

  // ── Set-type availability — batched lookup ("Can't Get" handling) ────────
  // Whenever the upstream context (court level, case status, year band, city)
  // changes, hit /pricing-rules/availability once and cache which set-type
  // options are purchasable. We avoid an N+1 round trip per option.
  useEffect(() => {
    const flow = draft.flow;
    const p = draft.payload;
    if (!flow || !p.select_court_type) { setSetTypeAvailability({}); return; }
    const isPending = p.case_status === 'Pending Case';
    const decidedYear = (() => {
      if (p.decided_date) {
        const m = /^(\d{4})/.exec(p.decided_date);
        if (m && m[1]) return parseInt(m[1]);
      }
      return undefined;
    })();
    const caseYear = decidedYear ?? (parseInt(p.case_year ?? p.year ?? '0') || undefined);
    const yearBand: YearBand = computeYearBand(caseYear, isPending);

    // Debounced to coalesce upstream-field churn (case_status flip cascades
    // year/decided_date changes); part of the bug #4 rate-limit fix.
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      apiClient.post<Record<string, boolean>>('/pricing-rules/availability', {
        flow,
        courtLevel: p.select_court_type || undefined,
        caseStatus: p.case_status || undefined,
        yearBand,
        province: p.province ?? p.province_capital ?? undefined,
        // #26: prefer the GeoCity id for reliable region derivation.
        cityId: p.city_id || undefined,
        city: p.select_court_city ?? p.city ?? undefined,
        currency,
        options: ['attested', 'non_attested', 'both'],
      })
        .then((r) => { if (!cancelled) setSetTypeAvailability(r ?? {}); })
        .catch(() => { if (!cancelled) setSetTypeAvailability({}); });
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [
    draft.flow,
    draft.payload.select_court_type,
    draft.payload.select_court_city,
    draft.payload.city,
    draft.payload.case_status,
    draft.payload.case_year,
    draft.payload.year,
    draft.payload.decided_date,
    currency,
  ]);

  // Auto-uncheck the currently selected set type if the availability map flips
  // it to false (e.g. user changed from Pending → Decided and Non-Attested is
  // no longer purchasable). Keeps the form internally consistent.
  useEffect(() => {
    const current = draft.payload.set_type;
    if (!current) return;
    if (Object.keys(setTypeAvailability).length === 0) return;
    if (setTypeAvailability[current] === false) {
      setDraft((c) => ({
        ...c,
        payload: {
          ...c.payload,
          set_type: '',
          attested_qty: '',
          non_attested_qty: '',
          both_attested_qty: '',
          both_non_attested_qty: '',
        },
      }));
    }
  }, [setTypeAvailability, draft.payload.set_type]);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as LocalUser | null;
      setCurrentUser(user);
      if (user?.currency) startTransition(() => setCurrency(user.currency!));
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
        // When regenerating, consumerId is sourced from the source ticket (not
        // the logged-in admin) — the regenerate hydration effect overrides it.
        // Skip defaulting here to avoid a transient clobber before the async
        // fetch resolves. For the non-regenerate path this is the correct init.
        if (!regenerateFromTicketId && !editTicketId) {
          setDraft((current) => ({ ...current, consumerId: user.id }));
        }
        setConsumerLabel(user.name || user.email || user.id);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Future-tickets prefill (PDF #2) ──────────────────────────────────────
  // When the wizard mounts with ?futureFromTicketId=<id>, fetch the source
  // ticket and pre-populate the draft via buildFutureTicketsPayload (FT-T1),
  // then jump to the wizard's final step. This short-circuits the active-
  // draft hydration below: the prefill is the source of truth, not whatever
  // stale draft happens to exist for the active consumer + flow.
  const searchParams = useSearchParams();
  const router = useRouter();
  const futureFromTicketId = searchParams?.get('futureFromTicketId') ?? null;
  const futurePrefillAppliedRef = useRef(false);
  const [futureSourceLabel, setFutureSourceLabel] = useState<string>('');

  // ── Regenerate prefill (B3) ───────────────────────────────────────────────
  // When the wizard mounts with ?regenerateFromTicketId=<id> (staff-only),
  // fetch the source ticket and pre-populate the draft with a full copy of
  // its formPayload so staff can review and adjust before re-submitting.
  // Takes precedence over futureFromTicketId if both are somehow present.
  const regenerateFromTicketId = searchParams?.get('regenerateFromTicketId') ?? null;
  const regeneratePrefillAppliedRef = useRef(false);
  const [regenerateSourceLabel, setRegenerateSourceLabel] = useState<string>('');
  const [regenerateConsumerLabel, setRegenerateConsumerLabel] = useState<string>('');

  // ── Edit-ticket mode (Task 5/6) ───────────────────────────────────────────
  // When the wizard mounts with ?editTicketId=<id> (staff-only), fetch the
  // ticket and hydrate the draft for in-place editing. Highest precedence:
  // blocks regenerate, future, and resume-draft effects.
  const editTicketId = searchParams?.get('editTicketId') ?? null;
  const editMode = Boolean(editTicketId);
  const editPrefillAppliedRef = useRef(false);

  useEffect(() => {
    if (!regenerateFromTicketId) return;
    if (editTicketId) return; // edit takes precedence over regenerate
    if (regeneratePrefillAppliedRef.current) return;
    regeneratePrefillAppliedRef.current = true;
    // No cancelled flag: the ref guard ensures exactly-once execution per
    // component instance (same reasoning as the futureFromTicketId effect).
    apiClient
      .get<{
        id: string;
        consumerId?: string;
        consumer?: { id: string; name?: string | null; email?: string | null };
        batchNo?: string;
        formPayload?: Record<string, string>;
        intakeFlow?: string;
      }>(`/tickets/${encodeURIComponent(regenerateFromTicketId)}`)
      .then((source) => {
        if (!source?.formPayload) return;
        const nextPayload = normalizeDraftPayload(buildRegeneratePayload(source.formPayload));
        startTransition(() => {
          setDraft((current) => ({
            ...current,
            // Drop the previous draftId so the next autosave creates a fresh
            // row rather than mutating the active draft for this flow.
            draftId: undefined,
            flow: (source.intakeFlow as typeof current.flow) ?? current.flow,
            // Land at step 1 so staff can review the full form before submitting.
            step: 1,
            payload: nextPayload,
            // CRITICAL: bill the regenerated ticket to the SOURCE consumer,
            // not the logged-in admin. The user-load effect already ran and
            // set consumerId = admin.id; override it here with the real owner.
            consumerId: source.consumerId ?? current.consumerId,
          }));
          // Hydrate geoIds from the copied payload so location-dependent selects
          // (CityBlock, service picker, court loader) render with the right context.
          // Mirror the resume-draft pattern: hydrate district too, not just city.
          if (nextPayload.city_id || nextPayload.district_id) {
            setGeoIds((g) => ({
              ...g,
              districtId: nextPayload.district_id || g.districtId,
              cityId: nextPayload.city_id || g.cityId,
            }));
          }
          // Load the city's court groups so the court picker resolves (Continue
          // would otherwise stick on "Loading courts…" → "Please select a court").
          // Mirror the resume-draft loader: false-before / true-in-finally with
          // the monotonic cityCourtsReqRef stale-guard (no cancelled flag — the
          // regeneratePrefillAppliedRef already ensures exactly-once execution).
          if (nextPayload.city_id) {
            setCityCourtsLoading(true);
            setCityCourtsLoaded(false);
            const reqSeq = ++cityCourtsReqRef.current;
            apiClient
              .get<CityCourtGroup[]>(`/geo/cities/${nextPayload.city_id}/courts`)
              .then((groups) => {
                if (reqSeq === cityCourtsReqRef.current) setCityCourtGroups(groups ?? []);
              })
              .catch(() => {
                if (reqSeq === cityCourtsReqRef.current) setCityCourtGroups([]);
              })
              .finally(() => {
                if (reqSeq !== cityCourtsReqRef.current) return;
                setCityCourtsLoading(false);
                setCityCourtsLoaded(true);
              });
          }
          // Mark hydration complete so the autosave effect doesn't trample the
          // prefilled state on its first run.
          didHydrateRef.current = true;
          setRegenerateSourceLabel(source.batchNo ?? source.id);
          // Surface source consumer name so the banner confirms who the
          // regenerated ticket will be filed under.
          const cLabel =
            source.consumer?.name || source.consumer?.email || source.consumer?.id || '';
          setRegenerateConsumerLabel(cLabel);
        });
      })
      .catch((e: any) => {
        startTransition(() => {
          setApiError(e?.message || 'Failed to load source ticket for regeneration.');
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerateFromTicketId]);

  // ── Edit prefill effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (!editTicketId || editPrefillAppliedRef.current) return;
    editPrefillAppliedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const src = await apiClient.get<{
          consumerId?: string;
          formPayload?: Record<string, string>;
          intakeFlow?: string;
        }>(`/tickets/${encodeURIComponent(editTicketId)}`);
        if (cancelled || !src?.formPayload) return;
        const nextPayload = normalizeDraftPayload({ ...src.formPayload });
        startTransition(() => {
          setDraft((c) => ({
            ...c,
            consumerId: src.consumerId ?? c.consumerId, // keep the ticket's owner
            payload: nextPayload,
            step: 1,
          }));
          // Hydrate geoIds so location-dependent selects render correctly.
          if (nextPayload.city_id || nextPayload.district_id) {
            setGeoIds((g) => ({
              ...g,
              districtId: nextPayload.district_id || g.districtId,
              cityId: nextPayload.city_id || g.cityId,
            }));
          }
          // Mark hydration done so autosave doesn't trample the prefilled state.
          didHydrateRef.current = true;
        });
        // Load courts for the hydrated city so the Court step isn't blocked.
        if (nextPayload.city_id) {
          const reqSeq = ++cityCourtsReqRef.current;
          startTransition(() => {
            setCityCourtsLoading(true);
            setCityCourtsLoaded(false);
          });
          apiClient
            .get<CityCourtGroup[]>(`/geo/cities/${nextPayload.city_id}/courts`)
            .then((groups) => {
              if (reqSeq === cityCourtsReqRef.current) setCityCourtGroups(groups ?? []);
            })
            .catch(() => {
              if (reqSeq === cityCourtsReqRef.current) setCityCourtGroups([]);
            })
            .finally(() => {
              if (reqSeq !== cityCourtsReqRef.current) return;
              if (!cancelled) {
                setCityCourtsLoading(false);
                setCityCourtsLoaded(true);
              }
            });
        }
      } catch (e: any) {
        if (!cancelled) {
          startTransition(() => {
            setApiError(e?.message || 'Could not load the ticket to edit.');
          });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTicketId]);

  useEffect(() => {
    if (!futureFromTicketId) return;
    if (editTicketId) return; // edit takes precedence
    if (regenerateFromTicketId) return;
    if (futurePrefillAppliedRef.current) return;
    futurePrefillAppliedRef.current = true;
    // No cancelled flag: the ref guard already ensures exactly-once
    // execution per component instance. A `cancelled` boolean closed over
    // by the effect's cleanup would be set to true on the next render
    // (selectedFlow / other captured deps re-derive) and would silently
    // discard our resolved fetch.
    apiClient
      .get<{
        id: string;
        batchNo?: string;
        formPayload?: Record<string, string>;
        intakeFlow?: string;
      }>(`/tickets/${encodeURIComponent(futureFromTicketId)}`)
      .then((source) => {
        if (!source?.formPayload) return;
        const nextPayload = buildFutureTicketsPayload({
          sourceTicketId: source.id,
          sourcePayload: source.formPayload,
        });
        // draft.step is 1-indexed (activeStep = displaySteps[draft.step - 1]).
        // For judicial flows, displaySteps.length === selectedFlow.steps.length
        // (one step is replaced, not added), so the last step number equals the
        // flow's step count. Future-tickets only triggers for judicial flows.
        const flowSteps = selectedFlow?.steps ?? [];
        // Audit 5.4: land on the FIRST step with a missing required field
        // (the prefill deliberately clears set_type / delivery_mode / doc
        // selections) instead of the final step — landing at the end let the
        // user submit past the cleared fields straight into a server 400.
        const tier = courtTierFromCourtType(nextPayload.select_court_type);
        let landStepNum = Math.max(flowSteps.length, 1);
        for (let i = 1; i < flowSteps.length; i++) {
          const incomplete = flowSteps[i]!.fields.some(
            (f) =>
              resolveRequired(f, tier) &&
              showWhenSatisfied(f, nextPayload) &&
              !GEO_HANDLED_KEYS.has(f.key) &&
              !hasValue(nextPayload[f.key]),
          );
          if (incomplete) {
            landStepNum = i + 1; // display steps are 1-indexed
            break;
          }
        }
        setDraft((current) => ({
          ...current,
          // Drop the previous draftId so the next autosave creates a fresh
          // row rather than mutating whatever active draft was loaded.
          draftId: undefined,
          flow: (source.intakeFlow as typeof current.flow) ?? current.flow,
          step: landStepNum,
          payload: nextPayload,
        }));
        // Hydrate geoIds from the copied payload (city_id is whitelisted in
        // buildFutureTicketsPayload) so the location step — which the
        // submit-time all-steps validator now re-checks — is satisfied.
        if (nextPayload.city_id) {
          setGeoIds((g) => ({ ...g, cityId: nextPayload.city_id! }));
        }
        // Mark hydration as done so the autosave effect doesn't immediately
        // trample the prefilled state.
        didHydrateRef.current = true;
        setFutureSourceLabel(source.batchNo ?? source.id);
      })
      .catch(() => {
        // Silent failure: leave the wizard in its default empty state. The
        // contextual banner (FT-T4) will still render and the user can
        // adjust fields manually.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [futureFromTicketId, editTicketId, regenerateFromTicketId]);

  // Resume from server-side draft. The server is the source of truth; the
  // localStorage id is only a fast-path cache. Always ask the API for the
  // active draft for (consumer, flow) so a cleared localStorage / different
  // browser / re-login still resumes where the user left off.
  useEffect(() => {
    if (editTicketId || futureFromTicketId || regenerateFromTicketId) return; // B3/FT-T3: prefill takes priority; edit is highest
    const flowKey = flows[0]?.key;
    if (!flowKey) return;
    if (!draft.consumerId) return; // wait until the consumer id is known
    let cancelled = false;
    (async () => {
      try {
        const r = await apiClient.get<any>(
          `/tickets/intake-drafts/active?flow=${encodeURIComponent(flowKey)}`,
        );
        if (cancelled || !r || !r.id) return;
        setResumedDraftAt(typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString());
        setDraft((current) => ({
          ...current,
          draftId: r.id,
          flow: r.flow ?? current.flow,
          serviceId: r.serviceId ?? current.serviceId,
          step: typeof r.step === 'number' ? r.step : current.step,
          // Normalise legacy display-string values (e.g. "Petition + Last Order")
          // into canonical DocBundle keys so the renderer can swap the word
          // Petition <-> Paperbook based on court tier. See PDF feedback #35b.
          payload: normalizeDraftPayload({ ...(r.payload ?? {}) }),
        }));
        // Hydrate geoIds from the resumed payload so the cascading geo selects
        // and city-court loader behave correctly on resume.
        const p = (r.payload ?? {}) as Record<string, string>;
        setGeoIds((g) => ({
          provinceId: g.provinceId,
          districtId: p.district_id || g.districtId,
          cityId: p.city_id || g.cityId,
        }));
        if (p.city_id) {
          setCityCourtsLoading(true);
          setCityCourtsLoaded(false);
          const reqSeq = ++cityCourtsReqRef.current;
          const stillCurrent = () => !cancelled && reqSeq === cityCourtsReqRef.current;
          apiClient
            .get<CityCourtGroup[]>(`/geo/cities/${p.city_id}/courts`)
            .then((groups) => {
              if (stillCurrent()) setCityCourtGroups(groups ?? []);
            })
            .catch(() => {})
            .finally(() => {
              if (stillCurrent()) {
                setCityCourtsLoading(false);
                setCityCourtsLoaded(true);
              }
            });
        }
        try {
          localStorage.setItem(
            `wusuq_intake_draft_id:${variant}:${flowKey}`,
            r.id,
          );
        } catch {}
        // Mark hydration as complete so the autosave effect doesn't immediately
        // fire on the just-restored state.
        didHydrateRef.current = true;
      } catch {
        // No active draft / not authenticated yet — leave the wizard in its
        // initial state.
      }
    })();
    return () => {
      cancelled = true;
    };
  // We intentionally only run this once per (consumerId, first-flow) pairing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.consumerId, flows[0]?.key, editTicketId, futureFromTicketId, regenerateFromTicketId]);

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
    // Clear the previous city's court groups synchronously. Without this,
    // the wizard keeps rendering the old city's JudicialServiceBlock
    // (e.g. "Islamabad High Court · Selected" while the chip shows Karachi)
    // for the duration of the /geo/cities/<id>/courts fetch — the bug
    // reported in the 5-14-26 addendum (#8 / N6).
    setCityCourtGroups([]);
    setCityCourtsLoaded(false);
    const reqSeq = ++cityCourtsReqRef.current;
    if (!cityId) {
      setCityCourtsLoading(false);
      return;
    }
    setCityCourtsLoading(true);
    apiClient
      .get<CityCourtGroup[]>(`/geo/cities/${cityId}/courts`)
      .then((r) => {
        if (reqSeq === cityCourtsReqRef.current) setCityCourtGroups(r ?? []);
      })
      .catch(() => {
        if (reqSeq === cityCourtsReqRef.current) setCityCourtGroups([]);
      })
      .finally(() => {
        if (reqSeq !== cityCourtsReqRef.current) return;
        setCityCourtsLoading(false);
        setCityCourtsLoaded(true);
      });
  };

  // Auto-pick the single available service for non-judicial slugs whose
  // flow→service mapping is 1:1 (Copy of FIR, Registry/Deed, Search Criminal
  // Record). The 3-tile picker still renders so it remains visible if the
  // catalogue grows, but the right tile is pre-selected so the user doesn't
  // have to click to satisfy the wizard.
  useEffect(() => {
    if (!selectedFlow?.defaultServiceId) return;
    if (draft.serviceId) return;
    if (!availableServices.length) return;
    const match = availableServices.find((s) => s.id === selectedFlow.defaultServiceId);
    if (!match) return;
    applySelectedServiceRef.current?.(match.id, match.name, match.caseTypes ?? []);
     
  }, [selectedFlow?.key, selectedFlow?.defaultServiceId, availableServices, draft.serviceId]);

  // Ref-indirection to applySelectedService so the auto-pick effect above
  // doesn't have to be ordered after the callback definition.
  const applySelectedServiceRef = useRef<((id: string, name: string, caseTypes: string[]) => void) | null>(null);

  const applySelectedService = useCallback((id: string, name: string, caseTypes: string[]) => {
    void caseTypes; // case-type options are now derived; arg preserved for callsite stability
    const courtLevel = availableServices.find((s) => s.id === id)?.courtLevel ?? '';
    setField('serviceId', id);
    setPayloadField('select_service', name || id);
    setPayloadField('select_court', '');
    setPayloadField('select_court_id', '');
    setPayloadField('select_court_type', courtLevel);
    setPayloadField('judge_designation', '');
  }, [availableServices]);

  // Keep the auto-pick effect's ref pointed at the latest callback so it can
  // call into applySelectedService without a forward-declaration loop.
  useEffect(() => {
    applySelectedServiceRef.current = applySelectedService;
  }, [applySelectedService]);

  const addFiles = useCallback((incomingFiles: File[]) => {
    if (incomingFiles.length === 0) return;
    const oversized = incomingFiles.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setUploadError(`${oversized.name} exceeds the 10 MB limit.`);
      return;
    }

    setUploadError('');
    setFiles((current) => [...current, ...incomingFiles]);
    setFileCaptions((current) => [...current, ...incomingFiles.map(() => '')]);
  }, []);

  const removeFileAt = useCallback((index: number) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setFileCaptions((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const setFileCaption = useCallback((index: number, caption: string) => {
    setFileCaptions((current) => {
      const next = current.slice();
      // Backfill in case captions array drifted out of sync (defensive).
      while (next.length <= index) next.push('');
      next[index] = caption;
      return next;
    });
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

  const isFirFlow =
    draft.flow === 'non_judicial_copy_of_fir' ||
    draft.flow === 'non_judicial_criminal_record_search';

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
    if (editMode) return false; // edits are not server drafts
    // QA: never autosave while a submit is in flight — the autosave timer
    // would otherwise upsert a phantom draft on the just-deleted server row
    // and the wizard would restore it on the next visit (prefill bug).
    if (submittingRef.current) return false;
    return Boolean(
      draft.flow &&
      draft.consumerId &&
      geoIds.cityId &&
      draft.serviceId &&
      (!isJudicial || draft.payload.select_court),
    );
  }, [draft.consumerId, draft.flow, draft.payload.select_court, draft.serviceId, editMode, geoIds.cityId, isJudicial, selectedFlow]);

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
    if (!field) return '';
    // Special case: when case_type is 'Other', the case_type_other free-text
    // field becomes required even though its flat `required` flag is false.
    if (
      field.key === 'case_type_other' &&
      draft.payload.case_type === 'Other' &&
      showWhenSatisfied(field, draft.payload)
    ) {
      if (!hasValue(value)) return `${field.label} is required`;
      return '';
    }
    if (!resolveRequired(field, activeCourtTier)) return '';
    if (!showWhenSatisfied(field, draft.payload)) return '';
    if (field.type === 'structured_address') {
      if (!isStructuredAddressComplete(value)) return 'Please complete the delivery address';
      return '';
    }
    if (field.type === 'bench') {
      const bench = parseBench(value);
      if (!bench.judges.some((j) => j.trim())) return `${field.label} is required`;
      return '';
    }
    if (!hasValue(value)) return `${field.label} is required`;
    if (field.pattern && value) {
      try {
        const re = new RegExp(field.pattern.regex);
        if (!re.test(value)) return field.pattern.message;
      } catch {
        // malformed regex in flow definition — fail open so it never blocks
      }
    }
    return '';
  };

  // The optional `newValue` argument is critical for click-style fields
  // (radio, checkbox tile, search-method tabs). React state updates are async,
  // so the click handler calls `onChange(...)` then `onBlur(key, newValue)`
  // in the same tick — at that point `draft.payload[key]` still holds the
  // PREVIOUS value. Without `newValue` the validator would see the stale
  // value and flag a "Required" error the user perceives as a missed click,
  // forcing a second click to clear it (PDF #22). Text inputs call
  // `onBlur(key)` without an argument because their value is committed via
  // onChange before blur fires, so reading from payload is correct.
  const handleFieldBlur = (key: string, newValue?: string) => {
    setTouched((t) => ({ ...t, [key]: true }));
    const valueToValidate = newValue !== undefined ? newValue : draft.payload[key] ?? '';
    const err = validateField(key, valueToValidate);
    setErrors((e) => ({ ...e, [key]: err }));
  };

  // Per-step field validation, extracted so both the step-by-step Continue
  // gate and the whole-form submit gate (audit 5.4) share one rule set.
  const stepFieldErrors = (step: IntakeStep) => {
    const newErrors: Record<string, string> = {};
    const newTouched: Record<string, boolean> = {};
    let firstInvalidKey: string | null = null;

    for (const f of step.fields) {
      // Audit 5.2: city_type and station_id are committed by the geo chips
      // (which bypass per-field onBlur validation) but are BE-required for
      // the non-judicial flows — validate them here instead of skipping them
      // with the purely-geo keys.
      if (f.key === 'city_type' || f.key === 'station_id') {
        if (!resolveRequired(f, activeCourtTier)) continue;
        if (!showWhenSatisfied(f, draft.payload)) continue;
        newTouched[f.key] = true;
        const satisfied =
          f.key === 'station_id'
            ? hasValue(draft.payload.station_id) || hasValue(draft.payload.police_station)
            : hasValue(draft.payload.city_type);
        if (!satisfied) {
          newErrors[f.key] = `${f.label} is required`;
          if (!firstInvalidKey) firstInvalidKey = f.key;
        }
        continue;
      }
      if (GEO_HANDLED_KEYS.has(f.key)) continue;
      // Special case: case_type_other is conditionally required when the user
      // picks "Other" from the Case Type dropdown.
      if (f.key === 'case_type_other') {
        if (draft.payload.case_type === 'Other' && showWhenSatisfied(f, draft.payload)) {
          newTouched[f.key] = true;
          if (!hasValue(draft.payload.case_type_other)) {
            newErrors[f.key] = `${f.label} is required`;
            if (!firstInvalidKey) firstInvalidKey = f.key;
          }
        }
        continue;
      }
      if (!resolveRequired(f, activeCourtTier)) continue;
      if (!showWhenSatisfied(f, draft.payload)) continue;
      if (f.key === 'select_service') continue;

      newTouched[f.key] = true;

      if (f.type === 'structured_address') {
        if (!isStructuredAddressComplete(draft.payload[f.key])) {
          newErrors[f.key] = 'Please complete the delivery address';
          if (!firstInvalidKey) firstInvalidKey = f.key;
        }
        continue;
      }
      if (f.type === 'bench') {
        const bench = parseBench(draft.payload[f.key]);
        if (!bench.judges.some((j) => j.trim())) {
          newErrors[f.key] = `${f.label} is required`;
          if (!firstInvalidKey) firstInvalidKey = f.key;
        }
        continue;
      }
      if (!hasValue(draft.payload[f.key])) {
        newErrors[f.key] = `${f.label} is required`;
        if (!firstInvalidKey) firstInvalidKey = f.key;
        continue;
      }
      if (f.pattern) {
        try {
          const re = new RegExp(f.pattern.regex);
          if (!re.test(draft.payload[f.key] ?? '')) {
            newErrors[f.key] = f.pattern.message;
            if (!firstInvalidKey) firstInvalidKey = f.key;
          }
        } catch {
          // malformed regex — skip
        }
      }
    }

    return { newErrors, newTouched, firstInvalidKey };
  };

  const validateCurrentStep = (): boolean => {
    setApiError('');
    if (isCityCourtStep) return validateLocationStep() && validateServiceStep();

    if (!activeStep) return true;

    const { newErrors, newTouched, firstInvalidKey } = stepFieldErrors(activeStep);

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

  // Audit 5.4: submit used to validate only the ACTIVE step, so a prefill
  // (future tickets) or a hydrated draft landing on the last step sailed past
  // earlier steps with cleared BE-required fields and 400'd server-side.
  // Validate every display step and bounce the user to the first failing one.
  const validateAllSteps = (): boolean => {
    setApiError('');
    if (!validateLocationStep() || !validateServiceStep()) {
      setDraft((c) => (c.step === 1 ? c : { ...c, step: 1 }));
      return false;
    }
    for (let i = 1; i < displaySteps.length; i++) {
      const step = displaySteps[i];
      if (!step) continue;
      const { newErrors, newTouched } = stepFieldErrors(step);
      if (Object.values(newErrors).some(Boolean)) {
        setTouched((t) => ({ ...t, ...newTouched }));
        setErrors((e) => ({ ...e, ...newErrors }));
        const stepNum = i + 1; // draft.step is 1-indexed
        setDraft((c) => (c.step === stepNum ? c : { ...c, step: stepNum }));
        setApiError('Please complete the highlighted required fields before submitting.');
        return false;
      }
    }
    return true;
  };

  const saveDraft = async (mode: 'manual' | 'auto' = 'manual') => {
    if (!selectedFlow) return;
    // QA: extra belt — even if an autosave timer slipped past the guard
    // above (e.g. fired after submittingRef flipped), bail out here so we
    // never re-create the server draft mid-/post-submit.
    if (mode === 'auto' && submittingRef.current) return;
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
        payload: withDerivedYear(draft.payload),
      });
      // Audit 2.4 (related Low): an in-flight autosave response landing after
      // submit/Start Fresh must not re-write the just-removed localStorage
      // pointer, and a server-suppressed save has no id — storing it would
      // corrupt the pointer with a useless value.
      const staleAutosave = mode === 'auto' && submittingRef.current;
      const savedForReal = !staleAutosave && !r?.suppressed && Boolean(r?.id);
      if (savedForReal) {
        setDraft((c) => (c.draftId === r.id ? c : { ...c, draftId: r.id }));
        setLastSavedAt(Date.now());
        setInfoMsg('Saved · just now');
        localStorage.setItem(`wusuq_intake_draft_id:${variant}:${draft.flow}`, r.id);
      }
      // QA 5-14-26 #1: manual Save Draft should park the current draft in the
      // Drafts folder and hand the user a fresh, empty wizard so they can
      // start the next ticket without manually reloading. Auto-save keeps the
      // user on the current step.
      if (mode === 'manual' && savedForReal) {
        localStorage.removeItem(`wusuq_intake_draft_id:${variant}:${draft.flow}`);
        resetForm();
        setInfoMsg('Draft saved — start a new ticket below.');
      }
    } catch (e: any) {
      setApiError(e.message || 'Save failed');
    }
    if (mode === 'manual') setLoading(false);
  };

  // QA P1: "Start Fresh" — explicit affordance for the consumer to abandon
  // the restored draft and begin a brand-new ticket without first saving.
  // Confirms before discarding so an accidental click doesn't nuke work in
  // progress. Mirrors Save Draft's reset path minus the server save, and
  // also deletes the server-side draft so a subsequent reload doesn't
  // restore the discarded payload (QA cosmetic follow-up).
  const startFresh = async () => {
    if (!window.confirm('Discard the current draft and start a new ticket? This cannot be undone.')) return;
    // Audit 2.4: mirror submitTicket — set the discard guard and clear any
    // armed autosave BEFORE the awaited DELETE, or a 5s timer firing
    // mid-delete re-upserts the payload we're discarding (the server's 30s
    // belt only suppresses after ticket creation, not draft deletion).
    // resetForm() below clears the guard for the next intake.
    submittingRef.current = true;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    try {
      localStorage.removeItem(`wusuq_intake_draft_id:${variant}:${draft.flow}`);
    } catch {
      /* localStorage unavailable */
    }
    if (draft.flow) {
      try {
        await apiClient.delete(`/tickets/intake-drafts/active?flow=${encodeURIComponent(draft.flow)}`);
      } catch {
        // Best-effort — the local reset below still lands the user on a
        // blank wizard even if the server delete fails (e.g. no draft
        // existed, or transient network error). Reload would re-restore
        // the draft in that edge case, which is the prior behaviour.
      }
    }
    resetForm();
    setInfoMsg('Started a fresh ticket.');
  };

  const resetForm = () => {
    // Clear the submission guard so the next intake's autosave can fire.
    submittingRef.current = false;
    // New draft → new idempotency key on its first submit.
    submitRequestIdRef.current = null;
    // Tear down the "Resumed draft" banner — the user is on a fresh form now.
    setResumedDraftAt(null);
    setDraft({
      flow: flows[0]?.key ?? '',
      consumerId: isConsumer || isAdminTestingMode ? (currentUser?.id ?? '') : '',
      serviceId: '',
      step: 1,
      payload: {},
    });
    if (!(isConsumer || isAdminTestingMode)) setConsumerLabel('');
    setFiles([]);
    setFileCaptions([]);
    setCityCourtGroups([]);
    setGeoIds({ provinceId: '', districtId: '', cityId: '' });
    setTouched({});
    setErrors({});
    setUploadError('');
    setDocumentsPanelOpen(false);
    setLastSavedAt(null);
    setPromoCode('');
    setPromoDiscount(0);
    setPromoError('');
    setPromoLoading(false);
    promoReqRef.current++;
  };

  // Checkout summary — derives display items from draft payload. When a pricing
  // rule is matched, real amounts are shown; otherwise amounts remain null ("—").
  //
  // SPLIT flows (e.g. judicial_case_files): show base service cost only at
  // checkout — attested/non-attested, delivery, and PDF line items move to the
  // clerk phase-2 prompt and are excluded here.
  // ONE_TIME flows: show the full breakdown as before.
  const checkoutSummary: CheckoutSummary = useMemo(() => {
    const p = draft.payload;
    const items: CheckoutItem[] = [];
    // USD orders are always ONE_TIME (all-inclusive flat) and carry no tax or
    // promo — the list price is final.
    const isSplit = paymentModelFor(draft.flow, currency) === 'SPLIT';
    const effectiveTaxRate = currency === 'USD' ? 0 : taxRate;
    const effectivePromo = currency === 'USD' ? 0 : promoDiscount;

    // ── Instant year-driven checkout estimate (Task C2) ───────────────────
    // Derive the effective case year from the payload the same way
    // buildPricingResolveInput does: prefer decided_date year, then the
    // case_year / year alias. This extraction is the ONLY client-side
    // pricing math — no full resolver replication.
    const _effectiveCaseYear = (() => {
      if (p.decided_date) {
        const m = /^(\d{4})/.exec(p.decided_date);
        if (m && m[1]) return parseInt(m[1], 10) || undefined;
      }
      return parseInt(p.case_year ?? p.year ?? '0') || undefined;
    })();

    // Patch the server result with the instant year-driven component so the
    // checkout base updates on every keystroke, not after the 400ms debounce.
    // The shared functions are the SAME ones the server resolver calls, so the
    // instant estimate and the reconciled server value always agree on the
    // year-driven portion. The patch is a no-op when the server result is
    // already current (delta === 0).
    const pr = (() => {
      const raw = pricingResult;
      if (!raw?.matched || raw.available === false) return raw;
      // USD is an all-inclusive flat lookup — the year-driven PKR patch
      // (per-year Case Search base / decided-age surcharge) must not apply.
      if (currency === 'USD') return raw;
      if (draft.flow === 'judicial_case_search') {
        // Base is per-city: computeCaseSearchBase returns a per-city value; the
        // server's raw.basePrice is also per-city (the resolver multiplies by
        // cityCount only into serviceCost/total, never into basePrice). Guard
        // and delta must both stay in per-city units; delta is then scaled by
        // cityCount before adjusting serviceCost/total.
        const cityCount = raw.cityCount ?? Math.max(1, parseCities(p.cities ?? '').length);
        const instantPerCityBase = computeCaseSearchBase(_effectiveCaseYear);
        if (instantPerCityBase === raw.basePrice) return raw; // per-city vs per-city — true no-op when year unchanged
        const delta = (instantPerCityBase - raw.basePrice) * cityCount; // scale by cityCount
        return { ...raw, basePrice: instantPerCityBase, serviceCost: raw.serviceCost + delta, total: raw.total + delta };
      }
      if (draft.flow === 'judicial_case_files' && p.case_status === 'Decided Case') {
        // Only the age-surcharge is year-driven; banded base is server-only.
        const instantAge = computeDecidedAgeSurcharge(p.case_status, _effectiveCaseYear);
        const oldAge = raw.ageSurcharge ?? 0;
        if (instantAge === oldAge) return raw; // server already current
        const delta = instantAge - oldAge;
        return { ...raw, ageSurcharge: instantAge, serviceCost: raw.serviceCost + delta, total: raw.total + delta };
      }
      return raw;
    })();

    // Suppress the placeholder Base fee / Total for Case Files until a Set Type
    // is chosen. With no set_type the resolver matches the setType=null headline
    // rule whose seeded base is a bogus ~Rs 20 placeholder — showing it as the
    // quote is misleading. (The underlying seed/data fix is out of scope for
    // this FE-only change.) Once a set type is picked the real banded rule
    // matches and the quote renders.
    const caseFilesNeedsSetType = draft.flow === 'judicial_case_files' && !p.set_type;
    const pricingDisplayable = Boolean(pr?.matched && pr.available !== false && !caseFilesNeedsSetType);

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

    // Pricing breakdown — only show when matched. For SPLIT flows (Case Files)
    // the base service cost, title/age/bundle surcharges AND the PDF surcharge
    // are billed at intake; attested/non-attested copies and delivery are
    // deferred to the phase-2 clerk charge window (the second payment) and are
    // not shown here.
    if (pr?.matched && pr.available !== false && !caseFilesNeedsSetType) {
      if (pr.basePrice > 0) {
        items.push({ label: 'Base fee', amount: pr.basePrice });
      }
      if ((pr.titleSurcharge ?? 0) > 0) {
        items.push({
          label: 'Title surcharge (State vs …)',
          amount: pr.titleSurcharge!,
        });
      }
      // PDF #7: decided cases older than 10 years accrue Rs 1,000/year. Folded
      // into serviceCost at intake, so show it as a line for both flow models.
      if ((pr.ageSurcharge ?? 0) > 0) {
        items.push({ label: 'Age surcharge (10+ yrs)', amount: pr.ageSurcharge! });
      }
      // 5-24-26 #17: PDF is priced at intake (folded into serviceCost), so it is
      // shown and billed at checkout for ALL flows — including SPLIT/Case Files
      // — not deferred to the phase-2 clerk window like delivery/attestation.
      if ((pr.pdfSurcharge ?? 0) > 0) {
        items.push({ label: 'PDF surcharge', amount: pr.pdfSurcharge! });
      }
      // Case Search: surface the search-both surcharge and the per-city
      // multiplication so the line items actually sum to the billed total.
      if ((pr.searchBothSurcharge ?? 0) > 0) {
        items.push({
          label: 'Both search methods',
          amount: pr.searchBothSurcharge!,
        });
      }
      if ((pr.cityCount ?? 1) > 1) {
        items.push({
          label: `Cities searched × ${pr.cityCount}`,
          detail: 'Per-city rate applies to each selected city',
          amount: null,
        });
      }
      if (!isSplit) {
        if ((pr.deliveryFee ?? 0) > 0) {
          items.push({ label: 'Delivery fee', amount: pr.deliveryFee! });
        }
        if (pr.attestedCharge > 0) {
          items.push({ label: 'Attested copies', amount: pr.attestedCharge });
        }
        if (pr.nonAttestedCharge > 0) {
          items.push({ label: 'Non-attested copies', amount: pr.nonAttestedCharge });
        }
        // Show the static deliveryCharge from the rule only when there's any
        // (the new flat deliveryFee already covers the Rs 100 surcharge).
        const staticDelivery = pr.deliveryCharge - (pr.deliveryFee ?? 0);
        if (staticDelivery > 0) {
          items.push({ label: 'Delivery', amount: staticDelivery });
        }
      }
      // C16: editable per-rule turnaround estimate (display-only — no effect
      // on submit body or money math).
      if (pr.turnaroundLabel) {
        items.push({ label: `Estimated turnaround: ${pr.turnaroundLabel}`, amount: null });
      }
    } else {
      // Keep existing delivery_mode display when no pricing match
      if (p.delivery_mode) {
        items.push({ label: 'Delivery', detail: p.delivery_mode, amount: null });
      }
    }

    const matchedAndAvailable = pricingDisplayable;
    // For SPLIT flows, the checkout total is the base service cost only.
    // The remainder (attested/non-attested/PDF/delivery) is billed after
    // the clerk enters phase-2 charges. billedBase is the pre-tax /
    // pre-promo subtotal that computeTicketTotal works from.
    const billedBase = matchedAndAvailable
      ? (isSplit ? pr!.serviceCost : pr!.total)
      : null;

    // Promo discount line — shown when a valid code has been applied.
    if (billedBase !== null && effectivePromo > 0) {
      items.push({ label: 'Discount', amount: -effectivePromo });
    }

    // Use computeTicketTotal (same function the server uses for createIntakeTicket
    // and finalizeRemainderCore) so the checkout quote cannot drift from the
    // persisted charge: promo + tax math is in exactly one place.
    const money = billedBase !== null
      ? computeTicketTotal({
          charges: {
            serviceCost: billedBase,
            deliveryCharges: 0,
            printingCharges: 0,
            attestedCharges: 0,
            nonAttestedCharges: 0,
            additionalCharges: 0,
            additionalServiceCost: 0,
          },
          promoDiscount: effectivePromo,
          taxRate: effectiveTaxRate,
        })
      : null;

    // Tax line — shown only when a non-zero tax rate is configured.
    if (money && effectiveTaxRate > 0) {
      items.push({ label: `Tax (${Math.round(effectiveTaxRate * 100)}%)`, amount: money.taxAmount });
    }

    return {
      items,
      subtotal: billedBase,
      fees: null,
      total: money ? money.totalAmount : null,
      currency,
    };
  }, [draft.payload, draft.flow, pricingResult, selectedFlow, promoDiscount, taxRate, currency]);

  const submitTicket = async () => {
    if (!selectedFlow || !validateAllSteps()) return;
    // Block USD consumers from a PKR-only flow before hitting the server (which
    // would reject anyway — no USD pricing rule). Matches the banner above.
    if (isConsumer && !isFlowAvailableForCurrency(draft.flow, currency)) {
      setApiError(
        'This service is not available for international (USD) customers.',
      );
      return;
    }
    // QA: flip the submission guard BEFORE any await, and clear any pending
    // autosave timer. Both are required to prevent the autosave from
    // resurrecting the draft we're about to delete server-side.
    submittingRef.current = true;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (
      !submitRequestIdRef.current &&
      typeof crypto !== 'undefined' &&
      'randomUUID' in crypto
    ) {
      submitRequestIdRef.current = crypto.randomUUID();
    }
    setLoading(true); setApiError('');
    try {
      const p = withDerivedYear(draft.payload);

      // ── Edit-ticket path: PATCH /tickets/:id/reprice instead of create ──
      if (editMode && editTicketId) {
        try {
          await apiClient.patch(`/tickets/${encodeURIComponent(editTicketId)}/reprice`, { payload: p });
          setLoading(false);
          router.push(`/tickets/${encodeURIComponent(editTicketId)}`);
          return;
        } catch (e: any) {
          setApiError(e?.message ?? 'Could not save the changes.');
          setLoading(false);
          submittingRef.current = false;
          return;
        }
      }

      const sets =
        p.set_type === 'attested' ? (p.attested_qty ?? '') :
        p.set_type === 'non_attested' ? (p.non_attested_qty ?? '') :
        p.set_type === 'both' ? (p.both_attested_qty ?? '') :
        '';
      // Audit 1.3: the POSTed payload must be byte-identical to the payload
      // the live preview priced. The old `flowDefaults` spread (a relic from
      // when Case Information was pending-only) overwrote case_status at
      // submit, so the server priced a different band than the quote.
      // 5-14-26 addendum: the Copy-of-FIR landing tile now hosts both the
      // "I have an FIR number" and "Search by CNIC" modes (see
      // `copyOfFirSteps` in lib/intake-flows.ts). When the user picks
      // search_by_cnic we override endpoint + service + flow to the
      // criminal-record-search variants so the backend's REQUIRED_FIELDS_BY_FLOW
      // validation and downstream reporting keep the two cohorts separated.
      const isCriminalRecordSearch =
        draft.flow === 'non_judicial_copy_of_fir' && p.fir_mode === 'search_by_cnic';
      const submitEndpoint = isCriminalRecordSearch
        ? '/tickets/intake/non-judicial/criminal-record-search'
        : selectedFlow.endpoint;
      const submitServiceId = isCriminalRecordSearch
        ? 'svc_non_judicial_criminal_record'
        : draft.serviceId;
      const ticket = await apiClient.post<any>(submitEndpoint, {
        consumerId: draft.consumerId,
        serviceId: submitServiceId,
        // Audit 1.9: one idempotency key per submission attempt (stable
        // across user retries of the same draft) — a network retry or
        // re-click replays the same key and the API returns the
        // already-created ticket instead of a duplicate.
        requestId: submitRequestIdRef.current ?? undefined,
        serviceCity:
          p.city ??
          p.select_court_city ??
          p.district_name ??
          '',
        caseType: isCriminalRecordSearch
          ? (p.subject_full_name ?? p.subject_cnic ?? '')
          : (p.case_type ?? p.offence ?? p.case_title ?? ''),
        payload: { ...p, sets, source: 'next-web-intake' },
        // Atomic case linkage when the wizard is launched from a case page.
        ...(caseId ? { caseId } : {}),
        // Server re-validates and redeems the promo code so the discount
        // cannot be fabricated client-side.
        // USD orders can't use promo codes; never send a stale code (the
        // server rejects it, which would otherwise wedge submit when the
        // promo input is hidden after an async currency flip to USD).
        ...(promoCode && currency !== 'USD' ? { promoCode } : {}),
        // B3: stamp the source ticket id when the wizard was opened via the
        // staff Regenerate button so the API can record the lineage.
        ...(regenerateFromTicketId ? { regeneratedFromTicketId: regenerateFromTicketId } : {}),
      });
      // The ticket now EXISTS — this is the commit point. Attachment uploads
      // are best-effort: a failed upload must NOT throw out to the catch and
      // leave the user to re-submit the whole form, because the stable
      // requestId would replay the same (already-created) ticket while the
      // file loop re-ran from the top, duplicating every document. Collect
      // failures and surface a soft note instead.
      let uploadFailures = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        try {
          const fd = new FormData();
          fd.append('file', file);
          const caption = (fileCaptions[i] ?? '').trim();
          if (caption) fd.append('caption', caption);
          await apiClient.post(`/tickets/${ticket.id}/documents/upload`, fd);
        } catch {
          uploadFailures++;
        }
      }
      // The backend deletes the (consumerId, flow) draft after a ticket is
      // created. Clear the matching localStorage pointer so the next intake
      // doesn't try to hydrate from a stale id.
      try {
        localStorage.removeItem(`wusuq_intake_draft_id:${variant}:${draft.flow}`);
      } catch {}
      setInfoMsg(
        uploadFailures > 0
          ? `✅ Ticket created (Batch No: ${ticket.batchNo}). ${uploadFailures} attachment(s) didn't upload — you can add them on the ticket page.`
          : '✅ Ticket created successfully! Batch No: ' + ticket.batchNo,
      );
      resetForm();
      // 5-24-26 #18: land on the ticket detail page after creation so the
      // consumer can review what they requested (it carries the Pay-now action
      // for unpaid tickets) instead of jumping straight to payment.
      router.push(`/consumer/tickets/${ticket.id}`);
    } catch (e: any) {
      setApiError(e.message || 'Submission failed');
      // Re-enable autosave only on failure — on success resetForm() clears
      // the flag (so the next intake starts clean).
      submittingRef.current = false;
    }
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

      {editMode ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Editing this ticket — your changes update it and re-price the total. No new ticket is created.
        </div>
      ) : regenerateFromTicketId && regenerateSourceLabel ? (
        <RegenerateBanner
          sourceTicketLabel={regenerateSourceLabel}
          consumerLabel={regenerateConsumerLabel}
        />
      ) : futureFromTicketId && futureSourceLabel ? (
        <FutureTicketsBanner sourceTicketLabel={futureSourceLabel} />
      ) : null}

      {isConsumer && draft.flow && !isFlowAvailableForCurrency(draft.flow, currency) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This service isn&apos;t available for international (USD) customers.
          Please choose Case Files, Case Information, or Case Search.
        </div>
      ) : null}

      {resumedDraftAt && !editMode && !futureFromTicketId && !regenerateFromTicketId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-brand-800">
          <div className="flex items-start gap-2">
            <FolderOpen className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Resumed your previous draft</span>
              {(() => {
                const rel = formatRelativeTime(new Date(resumedDraftAt).getTime());
                return rel ? <span className="ml-1 text-brand-700/80">· last saved {rel}</span> : null;
              })()}
              . Continue where you left off, or start a fresh ticket.
            </span>
          </div>
          <button
            type="button"
            onClick={startFresh}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-300 bg-surface px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
          >
            Start fresh
          </button>
        </div>
      ) : null}

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
                  multiSelect={draft.flow === 'judicial_case_search'}
                  selectedCityIds={
                    draft.flow === 'judicial_case_search'
                      ? parseCities(draft.payload.cities)
                      : undefined
                  }
                  onCitiesChange={(ids) => {
                    // Multi-city sync (Case Search). cities[0] is the primary
                    // city used by the court loader / select_court_city.
                    const primaryId = ids[0] ?? '';
                    const primaryName =
                      geo.allCities.find((c) => c.id === primaryId)?.name ?? '';
                    const previousPrimary = geoIds.cityId;
                    setGeoIds((g) => ({ ...g, cityId: primaryId }));
                    setDraft((c) => ({
                      ...c,
                      // Reset service only when the primary city actually changed
                      // (adding a 2nd/3rd city to the same primary shouldn't
                      // wipe the chosen court).
                      ...(primaryId !== previousPrimary ? { serviceId: '' } : {}),
                      payload: {
                        ...c.payload,
                        cities: stringifyCities(ids),
                        city_id: primaryId,
                        city: primaryName,
                        select_court_city: primaryName,
                        // QA MC-1: when the consumer moves from 1 → multi
                        // city while search_method='both', downgrade to
                        // 'cnic' so the price stays resolvable. Single-city
                        // states leave search_method untouched.
                        ...(ids.length > 1 && c.payload.search_method === 'both'
                          ? { search_method: 'cnic' }
                          : {}),
                        ...(primaryId !== previousPrimary
                          ? {
                              select_service: '',
                              select_court: '',
                              select_court_id: '',
                              select_court_type: '',
                              case_type: '',
                              judge_designation: '',
                            }
                          : {}),
                      },
                    }));
                    if (primaryId && primaryId !== previousPrimary) {
                      setCityCourtsLoading(true);
                      setCityCourtsLoaded(false);
                      const reqSeq = ++cityCourtsReqRef.current;
                      apiClient
                        .get<CityCourtGroup[]>(`/geo/cities/${primaryId}/courts`)
                        .then((r) => {
                          if (reqSeq === cityCourtsReqRef.current)
                            setCityCourtGroups(r ?? []);
                        })
                        .catch(() => {
                          if (reqSeq === cityCourtsReqRef.current)
                            setCityCourtGroups([]);
                        })
                        .finally(() => {
                          if (reqSeq !== cityCourtsReqRef.current) return;
                          setCityCourtsLoading(false);
                          setCityCourtsLoaded(true);
                        });
                    } else if (!primaryId) {
                      setCityCourtGroups([]);
                      setCityCourtsLoaded(false);
                      setCityCourtsLoading(false);
                      cityCourtsReqRef.current++;
                    }
                  }}
                />
              )}

              {isJudicial ? (
                // NOTE: must be a <div>, NOT a <label>. A <label> that wraps a
                // grid of <button> cards hijacks taps on touch devices (iOS
                // Safari / Chrome Android forward the tap to the label's first
                // labelable control instead of the tapped card), so the court
                // cards become unselectable on mobile. The non-judicial branch
                // below already uses a <div> for the identical ServiceCardGrid.
                <div className="space-y-1 md:col-span-2">
                  <span className="block text-sm font-medium text-slate-700">Court<span className="text-rose-500 ml-0.5">*</span></span>
                  {!draft.payload.city ? (
                    <p className="mt-1 rounded-xl bg-surface-muted/50 p-3 text-sm text-slate-500 ring-1 ring-inset ring-border-soft">
                      Select a city above to see available courts.
                    </p>
                  ) : cityCourtsLoading || (!cityCourtsLoaded && draft.payload.city) ? (
                    // Show a loading state while /geo/cities/:id/courts is
                    // in-flight OR hasn't started yet for the selected city
                    // (`!cityCourtsLoaded` covers the mount/hydration window
                    // before the fetch is kicked off, avoiding a "No courts"
                    // flash). Once the fetch RESOLVES, a still-empty
                    // `cityCourtGroups` means the city genuinely has no courts
                    // and we fall through to the "No courts available" branch
                    // below — previously this clause keyed on
                    // `cityCourtGroups.length === 0`, which made court-less
                    // cities (e.g. the stray "Hunza" city) spin forever.
                    <p className="mt-1 flex items-center gap-2 rounded-xl bg-surface-muted/50 p-3 text-sm text-slate-500 ring-1 ring-inset ring-border-soft">
                      <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-brand-400" aria-hidden />
                      Loading courts for {draft.payload.city}…
                    </p>
                  ) : availableServices.length === 0 ? (
                    <p className="mt-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-100">
                      No courts are available in {draft.payload.city}. Pick a different city.
                    </p>
                  ) : selectedService ? (
                    // Once a court is selected, collapse the grid to a chip
                    // with a Change button — mirrors the City field pattern
                    // and removes the visual noise of unavailable options.
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span className="font-semibold">{selectedService.name}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => applySelectedService('', '', [])}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border-soft bg-surface px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-surface-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Change
                      </button>
                    </div>
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
                </div>
              ) : (
                // Non-judicial flows have no court selection — render the
                // service tile picker directly without the "Court*" label.
                availableServices.length > 0 && (
                  <div className="space-y-1 md:col-span-2">
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
                  </div>
                )
              )}

              {isJudicial && draft.serviceId && selectedCourtList.length > 1 && (
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

              {/* 5-19-26 CF#1b: delivery method was previously hoisted to
                  Page 1 (per 5-10-26 QA #2) so consumers committed early.
                  Owner reversed this — delivery is now too far upstream of
                  the case-details + document choices that influence it.
                  Leaving the field on its native later step (Documents &
                  Delivery for Case Files; Information Delivery for Case
                  Info; Others & Delivery for Filing/PoA). */}
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

          {caseDateBlockVisible && (() => {
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
                    {resolveRequired(caseStatusField, activeCourtTier) ? <span className="text-rose-500 ml-0.5">*</span> : null}
                  </label>
                  {isConsumerVariant && caseStatusField.hint ? (
                    <p className="mt-1 text-xs text-slate-500">{caseStatusField.hint}</p>
                  ) : null}
                </div>
                {rendered}
              </div>
            );
          })()}

          {caseDateBlockVisible && (
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
            // DATE_HANDLED_KEYS are owned by CaseDateBlock — but only when
            // stepHasCaseDate (the full case_status + future_date triad is
            // present). For flows like Case Information and Case Search
            // that expose case_date / decided_date without the full triad,
            // render them via the default loop. 5-19-26 CI#1 / CS#4.
            .filter((f) => !GEO_HANDLED_KEYS.has(f.key) && !(stepHasCaseDate && DATE_HANDLED_KEYS.has(f.key)))
            .map((rawField) => {
              // A decided case has, by definition, been attested by the court — so the
              // "Non Attested" set type is invalid. Filter it out of the options when
              // case_status is Decided Case. Safe when case_status is undefined.
              let field =
                rawField.key === 'set_type' && draft.payload.case_status === 'Decided Case'
                  ? { ...rawField, options: (rawField.options ?? []).filter((o) => o !== 'non_attested') }
                  : rawField;
              // For the document-bundle picker, render labels as
              // Petition / Paperbook based on the active court tier while
              // keeping the canonical DocBundle key as the stored value.
              if (field.key === 'required_documentations') {
                // 2026-06 #4: no inline price hint. For Case Information the
                // selected bundle's price IS the Base fee shown in the checkout
                // panel (folded into base server-side), so the picker shows
                // clean tier-aware labels only — Petition / Paperbook by tier.
                field = {
                  ...field,
                  optionsLabel: (opt: string) =>
                    docBundleLabel(opt, activeCourtTier),
                };
              }
              const dynamicOpts =
                field.key === 'case_type' ? selectedServiceCaseTypes :
                field.key === 'judge_designation' ? judgeDesignationOptions :
                undefined;
              const errorMsg = touched[field.key] ? (errors[field.key] ?? '') : '';
              // For the Set Type picker, mark options the pricing engine has
              // flagged as "Can't Get" as disabled so the user can't proceed
              // with an impossible combination. Hint copy reflects the reason.
              const disabledOpts: Record<string, { disabled: boolean; hint?: string }> | undefined =
                field.key === 'set_type'
                  ? (field.options ?? []).reduce(
                      (acc, opt) => {
                        const available = setTypeAvailability[opt];
                        if (available === false) {
                          const isDecided = draft.payload.case_status === 'Decided Case';
                          acc[opt] = {
                            disabled: true,
                            hint: isDecided
                              ? '(unavailable for decided cases)'
                              : '(unavailable at this court tier)',
                          };
                        }
                        return acc;
                      },
                      {} as Record<string, { disabled: boolean; hint?: string }>,
                    )
                  : undefined;
              const benchOpts = field.type === 'bench'
                ? (activeCourtTier ? BENCH_TYPES_BY_TIER[activeCourtTier] : BENCH_TYPES_BY_TIER.lower)
                : undefined;
              const rendered = renderField(field, draft.payload[field.key] ?? '', draft.payload, setPayloadField, dynamicOpts, handleFieldBlur, errorMsg, disabledOpts, benchOpts);
              if (rendered === null) return null;

              return (
                <div key={field.key} className={`space-y-1 ${colSpan(field)}`}>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      {field.label}
                      {resolveRequired(field, activeCourtTier) && showWhenSatisfied(field, draft.payload) && (
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
            captions={fileCaptions}
            onCaptionChange={setFileCaption}
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
            <button
              type="button"
              disabled={loading}
              onClick={startFresh}
              className="min-h-[44px] rounded-xl px-4 py-2.5 text-xs font-medium text-slate-500 underline-offset-2 transition-colors hover:text-rose-600 hover:underline disabled:opacity-50"
            >
              Start fresh
            </button>
          </div>

          {/* Desktop */}
          <div className="hidden sm:flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={loading || draft.step === 1}
                className="min-h-[44px] rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-border-soft transition-colors hover:bg-surface-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                onClick={() => setField('step', Math.max(1, draft.step - 1))}
              >
                Back
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={startFresh}
                className="min-h-[44px] rounded-xl px-3 py-2.5 text-xs font-medium text-slate-500 underline-offset-2 transition-colors hover:text-rose-600 hover:underline disabled:opacity-50"
              >
                Start fresh
              </button>
            </div>

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
              captions={fileCaptions}
              onCaptionChange={setFileCaption}
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
        <CheckoutPanel
          summary={checkoutSummary}
          hasFlow={Boolean(draft.flow)}
          promoSlot={currency === 'USD' ? undefined : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Promo code</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => { setPromoCode(e.target.value); setPromoError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && promoDiscount === 0) { void validatePromo(); } }}
                  placeholder="Enter code"
                  disabled={promoDiscount > 0}
                  aria-label="Promo code"
                  className="min-w-0 flex-1 rounded-xl border-0 py-2 px-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500"
                />
                {promoDiscount > 0 ? (
                  <button
                    type="button"
                    onClick={() => { setPromoDiscount(0); setPromoCode(''); setPromoError(''); }}
                    className="shrink-0 rounded-xl border border-border-soft px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                  >
                    Clear
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { void validatePromo(); }}
                    disabled={promoLoading || !promoCode.trim()}
                    className="shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white shadow-elev-1 transition-colors hover:bg-brand-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                  >
                    {promoLoading ? '…' : 'Apply'}
                  </button>
                )}
              </div>
              {promoError ? (
                <p className="text-xs text-rose-600">{promoError}</p>
              ) : null}
              {promoDiscount > 0 ? (
                <p className="text-xs text-emerald-600">Promo applied — discount deducted above.</p>
              ) : null}
            </div>
          )}
        />
      </div>
    </div>
  );
}
