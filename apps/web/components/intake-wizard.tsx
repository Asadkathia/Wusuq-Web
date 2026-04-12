/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo, useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { PanelCard } from '@/components/ui/panel-card';
import { ChevronRight, CheckCircle2 } from 'lucide-react';

import type { IntakeWizardProps, TicketDraft, ServiceHit, LocalUser } from './intake-wizard/types';
import { StepRail } from './intake-wizard/step-rail';
import { renderField, colSpan } from './intake-wizard/field-renderer';
import { FileUpload } from './intake-wizard/file-upload';
import {
  JudicialCourtBlock,
  FirBlock,
  RegistryDeedBlock,
} from './intake-wizard/service-geo-blocks';

// ─── Static lookup tables ────────────────────────────────────────────────────

const COURT_CITIES: Record<string, string[]> = {
  'Supreme Court': ['Islamabad', 'Lahore', 'Karachi', 'Peshawar', 'Quetta', 'Azad Kashmir', 'Gilgit Baltistan'],
  'Islamabad Court': ['Islamabad'],
  'Lahore High Court': ['Lahore', 'Bahawalpur', 'Multan', 'Rawalpindi'],
  'Sindh High Court': ['Karachi', 'Sukkur', 'Hyderabad', 'Larkana'],
  'Peshawar High Court': ['Peshawar', 'Abbottabad', 'Mingora', 'Dera Ismail Khan', 'Bannu'],
  'Balochistan High Court': ['Quetta', 'Sibi', 'Turbat'],
  'Gilgit High Court': ['Gilgit', 'Skardu', 'Diamir'],
  'Azad Kashmir High Court': ['Muzaffarabad', 'Mirpur', 'Rawla', 'Kotli'],
  'Islamabad High Court': ['Islamabad'],
  'Sessions Court': [
    'Lahore', 'Karachi', 'Rawalpindi', 'Faisalabad', 'Multan', 'Gujranwala', 'Sialkot',
    'Bahawalpur', 'Sargodha', 'Sheikhupura', 'Jhang', 'Okara', 'Kasur', 'Gujrat', 'Sahiwal',
    'Dera Ghazi Khan', 'Vehari', 'Muzaffargarh', 'Mianwali', 'Attock', 'Chakwal', 'Jhelum',
    'Khushab', 'Narowal', 'Toba Tek Singh', 'Peshawar', 'Mardan', 'Abbottabad', 'Kohat',
    'Bannu', 'Dera Ismail Khan', 'Nowshera', 'Charsadda', 'Haripur', 'Swabi', 'Swat',
    'Hyderabad', 'Sukkur', 'Larkana', 'Nawabshah', 'Mirpur Khas', 'Quetta', 'Turbat',
    'Khuzdar', 'Hub', 'Gwadar', 'Islamabad', 'Muzaffarabad', 'Mirpur',
  ],
  'Magisterial Court': [
    'Lahore', 'Karachi', 'Rawalpindi', 'Faisalabad', 'Multan', 'Gujranwala', 'Sialkot',
    'Bahawalpur', 'Sargodha', 'Peshawar', 'Mardan', 'Abbottabad', 'Hyderabad', 'Sukkur',
    'Quetta', 'Islamabad', 'Muzaffarabad', 'Mirpur',
  ],
  'Civil Court': [
    'Lahore', 'Karachi', 'Rawalpindi', 'Faisalabad', 'Multan', 'Gujranwala', 'Sialkot',
    'Bahawalpur', 'Sargodha', 'Peshawar', 'Hyderabad', 'Sukkur', 'Quetta', 'Islamabad',
    'Muzaffarabad', 'Mirpur',
  ],
  'Family Court': [
    'Lahore', 'Karachi', 'Rawalpindi', 'Faisalabad', 'Multan', 'Gujranwala', 'Sialkot',
    'Bahawalpur', 'Sargodha', 'Peshawar', 'Hyderabad', 'Sukkur', 'Quetta', 'Islamabad',
    'Muzaffarabad', 'Mirpur',
  ],
  'Accountability Courts': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta', 'Rawalpindi'],
  'Anti-Corruption Courts (Provincial)': ['Lahore', 'Karachi', 'Peshawar', 'Quetta', 'Rawalpindi'],
  'Anti-Terrorism Courts': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta', 'Rawalpindi', 'Faisalabad'],
  'Anti-Dumping Appellate Tribunal no bail': ['Islamabad', 'Karachi', 'Lahore'],
  'Appellate Tribunals Inland Revenue': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta'],
  'Banking Courts': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan'],
  'Banking Muhtasib': ['Karachi', 'Lahore', 'Islamabad'],
  'Board of Revenue': ['Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Child Protection Court': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi'],
  'Commercial Courts': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad'],
  'Competition Appellate Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Consumer Courts': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta', 'Rawalpindi', 'Faisalabad'],
  'Customs Appellate Tribunals': ['Karachi', 'Lahore', 'Islamabad', 'Peshawar', 'Quetta'],
  'Drug Courts': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Peshawar'],
  'Environmental Protection Tribunals': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta'],
  'Election Tribunal': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta'],
  'Federal Insurance Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Federal Ombudsman': ['Islamabad', 'Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Federal Service Tribunal': ['Islamabad'],
  'Federal tax ombudsman': ['Islamabad', 'Lahore', 'Karachi'],
  'Foreign Exchange Regulation Appellate Boards': ['Islamabad', 'Karachi', 'Lahore'],
  'Income Tax Appellate Tribunal': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar'],
  'Insurance Appellate Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Intellectual Property Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Labor Appellate Tribunals': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Peshawar'],
  'Labor Courts': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta'],
  'Lahore Development Authority Tribunal': ['Lahore'],
  'National industrial relations commission (NIRC)': ['Islamabad', 'Karachi', 'Lahore'],
  'Pakistan Maritime Carriage Appellate Tribunal': ['Karachi'],
  'Provincial Ombudsman': ['Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Provincial Service Tribunals': ['Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Special Courts (Central)': ['Islamabad', 'Karachi', 'Lahore'],
  'Special Courts (Control of Narcotic Substances)': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta', 'Rawalpindi'],
  'Special Courts (Customs, Taxation Anti-Smuggling)': ['Karachi', 'Lahore', 'Islamabad'],
  'Special Courts (Offences in Banks)': ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi'],
  'Special Courts of Public Property (Removal of Encroachment)': ['Lahore', 'Karachi', 'Islamabad'],
};

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
  category,
  inputClass,
}: {
  value: string;
  onChange: (id: string, name: string, courts: string[], courtCities: Record<string, string[]>, caseTypes: string[]) => void;
  category: 'judicial' | 'non_judicial';
  inputClass: string;
}) {
  const [services, setServices] = useState<ServiceHit[]>([]);

  useEffect(() => {
    apiClient.get<any>(`/services?type=${category}&limit=50`)
      .then((r) => setServices(r.items ?? r ?? []))
      .catch(() => {});
  }, [category]);

  return (
    <select
      className={inputClass}
      value={value}
      onChange={(e) => {
        const nextId = e.target.value;
        const selected = services.find((s) => s.id === nextId);
        onChange(
          nextId,
          selected?.name ?? '',
          selected?.courts ?? [],
          selected?.courtCities ?? {},
          selected?.caseTypes ?? [],
        );
      }}
    >
      <option value="">— Select a service —</option>
      {services.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}

// ─── Cascading Geo Hook ──────────────────────────────────────────────────────
function useGeo() {
  const [provinces, setProvinces] = useState<{ id: string; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: string; name: string }[]>([]);
  const [policeStations, setPoliceStations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    apiClient.get<any>('/geo/provinces').then((r) => setProvinces(r)).catch(() => {});
  }, []);

  const loadDistricts = useCallback((provinceId: string) => {
    if (!provinceId) { setDistricts([]); setPoliceStations([]); return; }
    apiClient.get<any>(`/geo/provinces/${provinceId}/districts`).then(setDistricts).catch(() => {});
  }, []);

  const loadDistrictPoliceStations = useCallback((districtId: string) => {
    if (!districtId) { setPoliceStations([]); return; }
    apiClient.get<any>(`/geo/districts/${districtId}/police-stations`).then(setPoliceStations).catch(() => {});
  }, []);

  return { provinces, districts, policeStations, loadDistricts, loadDistrictPoliceStations };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hasValue(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

const GEO_HANDLED_KEYS = new Set([
  'province', 'district_id', 'station_id', 'other_station_id', 'city_type', 'office_name',
  'select_court', 'select_court_city',
  'documents_upload_note', 'select_service',
  'city',
]);

const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'] as const;

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
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [selectedServiceCourts, setSelectedServiceCourts] = useState<string[]>([]);
  const [selectedServiceCourtCities, setSelectedServiceCourtCities] = useState<Record<string, string[]>>({});
  const [selectedServiceCaseTypes, setSelectedServiceCaseTypes] = useState<string[]>([]);

  const geo = useGeo();
  const [geoIds, setGeoIds] = useState({ provinceId: '', districtId: '', cityId: '' });

  const selectedFlow = useMemo(() => flows.find((f) => f.key === draft.flow) ?? flows[0], [draft.flow, flows]);
  const totalSteps = selectedFlow?.steps.length ?? 1;
  const activeStep = selectedFlow?.steps[draft.step - 1] ?? null;

  const serviceCategory: 'judicial' | 'non_judicial' = draft.flow.startsWith('non_judicial') ? 'non_judicial' : 'judicial';
  const isJudicial = serviceCategory === 'judicial';

  const courtCityOptions: string[] = useMemo(() => {
    const court = draft.payload.select_court;
    if (!court) return [];
    return selectedServiceCourtCities[court] ?? COURT_CITIES[court] ?? [];
  }, [draft.payload.select_court, selectedServiceCourtCities]);

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

  const handleProvinceChange = (provinceId: string, name: string) => {
    setGeoIds((g) => ({ ...g, provinceId, districtId: '', cityId: '' }));
    geo.loadDistricts(provinceId);
    setPayloadField('province', name);
    setPayloadField('district_id', '');
    setPayloadField('district_name', '');
    setPayloadField('city', '');
    setPayloadField('station_id', '');
    setPayloadField('police_station', '');
    setPayloadField('other_station_id', '');
  };

  const handleDistrictChange = (districtId: string, name: string) => {
    setGeoIds((g) => ({ ...g, districtId, cityId: '' }));
    geo.loadDistrictPoliceStations(districtId);
    setPayloadField('district_id', districtId);
    setPayloadField('district_name', name);
    setPayloadField('city', '');
    setPayloadField('station_id', '');
    setPayloadField('police_station', '');
    setPayloadField('other_station_id', '');
  };

  const validateCurrentStep = () => {
    if (!activeStep) return true;
    for (const f of activeStep.fields) {
      if (!f.required) continue;
      if (f.showWhen && draft.payload[f.showWhen.field] !== f.showWhen.value) continue;
      if (f.key === 'select_service') continue;
      if (draft.flow === 'non_judicial_copy_of_fir' && f.key === 'station_id') {
        if (!hasValue(draft.payload.station_id) && !hasValue(draft.payload.police_station)) {
          setMessage(`Required field missing: ${f.label}`);
          return false;
        }
        continue;
      }
      if (!hasValue(draft.payload[f.key])) {
        setMessage(`Required field missing: ${f.label}`);
        return false;
      }
    }
    if (draft.step === 1 && !draft.consumerId) { setMessage('Please select a consumer'); return false; }
    if (draft.step === 1 && !draft.serviceId) { setMessage('Please select a service'); return false; }
    if (draft.step === 1 && isJudicial && !draft.payload.select_court) { setMessage('Please select a court'); return false; }
    if (draft.step === 1 && isJudicial && !draft.payload.select_court_city) { setMessage('Please select a court city'); return false; }
    return true;
  };

  const saveDraft = async () => {
    if (!selectedFlow) return;
    setLoading(true); setMessage('Saving draft...');
    try {
      const r = await apiClient.post<any>('/tickets/intake-drafts', {
        draftId: draft.draftId,
        flow: draft.flow,
        consumerId: draft.consumerId,
        serviceId: draft.serviceId,
        step: draft.step,
        payload: draft.payload,
      });
      setDraft((c) => ({ ...c, draftId: r.id }));
      setMessage('Draft saved');
    } catch (e: any) { setMessage(e.message || 'Save failed'); }
    setLoading(false);
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
    setSelectedServiceCourtCities({});
    setSelectedServiceCaseTypes([]);
    setGeoIds({ provinceId: '', districtId: '', cityId: '' });
    setTouched({});
    setErrors({});
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
      setMessage('✅ Ticket created successfully! Batch No: ' + ticket.batchNo);
      resetForm();
    } catch (e: any) { setMessage(e.message || 'Submission failed'); }
    setLoading(false);
  };

  const inputClass = 'block w-full rounded-xl border-0 py-2.5 px-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm';
  const selectClass = 'mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm';

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">Complete the multi-step form to file a new paralegal request.</p>
      </div>

      {selectedFlow && <StepRail selectedFlow={selectedFlow} currentStep={draft.step} />}

      <PanelCard className="p-8">
        <div className="mb-6 grid gap-6 md:grid-cols-2">

          {draft.step === 1 && (
            <>
              <label className="space-y-1 block">
                <span className="text-sm font-medium text-slate-700">Intake Flow</span>
                <select
                  className={inputClass}
                  value={draft.flow}
                  onChange={(e) => {
                    setField('flow', e.target.value);
                    setField('step', 1);
                    setField('serviceId', '');
                    setDraft((c) => ({ ...c, payload: {} }));
                    setSelectedServiceCourts([]);
                    setSelectedServiceCourtCities({});
                    setSelectedServiceCaseTypes([]);
                    setGeoIds({ provinceId: '', districtId: '', cityId: '' });
                  }}
                >
                  {flows.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </label>

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

              <label className="space-y-1 block md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Service<span className="text-rose-500 ml-0.5">*</span></span>
                <ServiceSelect
                  value={draft.serviceId}
                  inputClass={inputClass}
                  onChange={(id, name, _courts, _courtCities, caseTypes) => {
                    setField('serviceId', id);
                    setPayloadField('select_service', name || id);
                    setSelectedServiceCourts(SERVICE_COURTS[id] ?? []);
                    setSelectedServiceCourtCities(
                      Object.fromEntries(
                        (SERVICE_COURTS[id] ?? []).map((c) => [c, COURT_CITIES[c] ?? []])
                      )
                    );
                    setSelectedServiceCaseTypes(SERVICE_CASE_TYPES[id] ?? caseTypes);
                    setPayloadField('select_court', '');
                    setPayloadField('select_court_city', '');
                    setPayloadField('judge_designation', '');
                  }}
                  category={serviceCategory}
                />
              </label>

              {isJudicial && (
                <JudicialCourtBlock
                  serviceId={draft.serviceId}
                  selectedServiceCourts={selectedServiceCourts}
                  courtCityOptions={courtCityOptions}
                  selectCourt={draft.payload.select_court ?? ''}
                  selectCourtCity={draft.payload.select_court_city ?? ''}
                  selectClass={selectClass}
                  onCourtChange={(court) => {
                    setPayloadField('select_court', court);
                    setPayloadField('select_court_city', '');
                    setPayloadField('judge_designation', '');
                  }}
                  onCourtCityChange={(city) => setPayloadField('select_court_city', city)}
                />
              )}

              {draft.flow === 'non_judicial_copy_of_fir' && (
                <FirBlock
                  geo={geo}
                  geoIds={geoIds}
                  stationId={draft.payload.station_id ?? ''}
                  policeStation={draft.payload.police_station ?? ''}
                  cityType={draft.payload.city_type ?? ''}
                  inputClass={inputClass}
                  selectClass={selectClass}
                  onProvinceChange={handleProvinceChange}
                  onDistrictChange={handleDistrictChange}
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

              {draft.flow === 'non_judicial_registry_deed' && (
                <RegistryDeedBlock
                  cityType={draft.payload.city_type ?? ''}
                  inputClass={inputClass}
                  onCityTypeChange={(value) => setPayloadField('city_type', value)}
                />
              )}
            </>
          )}

          {draft.step > 1 && activeStep?.fields
            .filter((f) => !GEO_HANDLED_KEYS.has(f.key))
            .map((field) => {
              const dynamicOpts =
                field.key === 'case_type' ? selectedServiceCaseTypes :
                field.key === 'judge_designation' ? judgeDesignationOptions :
                undefined;

              const rendered = renderField(field, draft.payload[field.key] ?? '', draft.payload, setPayloadField, dynamicOpts);
              if (rendered === null) return null;

              return (
                <div key={field.key} className={`space-y-1 ${colSpan(field)}`}>
                  <label className="text-sm font-medium text-slate-700">
                    {field.label}
                    {field.required && (!field.showWhen || draft.payload[field.showWhen.field] === field.showWhen.value) && (
                      <span className="text-rose-500 ml-0.5">*</span>
                    )}
                  </label>
                  {rendered}
                </div>
              );
            })}

          {draft.step === 1 && activeStep?.fields
            .filter((f) => !GEO_HANDLED_KEYS.has(f.key))
            .map((field) => {
              const rendered = renderField(field, draft.payload[field.key] ?? '', draft.payload, setPayloadField);
              if (rendered === null) return null;
              return (
                <div key={field.key} className={`space-y-1 ${colSpan(field)}`}>
                  <label className="text-sm font-medium text-slate-700">
                    {field.label}
                    {field.required && <span className="text-rose-500 ml-0.5">*</span>}
                  </label>
                  {rendered}
                </div>
              );
            })}
        </div>

        {draft.step === totalSteps && (
          <FileUpload files={files} onFilesChange={setFiles} />
        )}

        <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
          <button
            type="button"
            disabled={loading || draft.step === 1}
            className="rounded-lg bg-surface-muted px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            onClick={() => setField('step', Math.max(1, draft.step - 1))}
          >
            Back
          </button>

          <div className="flex gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={saveDraft}
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Save Draft
            </button>
            {draft.step === totalSteps ? (
              <button
                type="button"
                disabled={loading}
                onClick={submitTicket}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors"
              >
                Submit Ticket <CheckCircle2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
                onClick={() => { if (!validateCurrentStep()) return; setField('step', Math.min(totalSteps, draft.step + 1)); }}
              >
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
