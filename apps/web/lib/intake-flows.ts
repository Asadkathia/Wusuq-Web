// ─────────────────────────────────────────────
// Pricing year bands (mirrors apps/api pricing engine v2)
// ─────────────────────────────────────────────

/**
 * Canonical year-band keys understood by the pricing resolver. Keep in sync
 * with the `YEAR_BANDS` table in `apps/api/src/pricing/pricing.service.ts`.
 */
export type YearBand =
  | 'pending'
  | 'current'
  | 'y2025'
  | 'y2024_2023'
  | 'y2022_2020'
  | 'y2019_2017'
  | 'y2016_back';

/**
 * Derive the canonical {@link YearBand} for the wizard payload.
 *
 *  - Pending cases short-circuit to `pending` regardless of any year input
 *    (they have no decided year).
 *  - Empty / undefined year falls back to `current`.
 *  - Years on/after the current year map to `current`.
 *  - Earlier years bucket into the explicit historical bands.
 */
export function computeYearBand(
  year: number | undefined,
  isPending: boolean,
): YearBand {
  if (isPending) return 'pending';
  if (!year || Number.isNaN(year)) return 'current';
  const currentYear = new Date().getFullYear();
  if (year >= currentYear) return 'current';
  if (year === 2025) return 'y2025';
  if (year >= 2023 && year <= 2024) return 'y2024_2023';
  if (year >= 2020 && year <= 2022) return 'y2022_2020';
  if (year >= 2017 && year <= 2019) return 'y2019_2017';
  if (year <= 2016) return 'y2016_back';
  return 'current';
}

export type IntakeFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox_single'   // single-select checkbox group (required_documentations)
  | 'year_select'       // year dropdown current→1970
  | 'structured_address' // multi-part delivery address (house/block/main area)
  | 'file';

// ─────────────────────────────────────────────
// Structured delivery address (PDF #31b)
// ─────────────────────────────────────────────

/**
 * Shape of the payload value stored under `delivery_address` when the
 * delivery method is TCS. Serialized to JSON for transport so the API layer
 * remains agnostic. `city` is read-only and pre-filled from the wizard's
 * selected city.
 */
export type StructuredAddress = {
  house: string;
  block: string;
  mainArea: string;
  city?: string;
};

/**
 * Parse a `delivery_address` payload value into a {@link StructuredAddress}.
 * Accepts:
 *   - JSON-stringified StructuredAddress (the new wire format)
 *   - Legacy plain-string textarea content (treated as `house`)
 *   - Anything else → empty record
 *
 * This keeps drafts saved before PDF #31b still editable.
 */
export function parseDeliveryAddress(value: unknown): StructuredAddress {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    return {
      house: typeof obj.house === 'string' ? obj.house : '',
      block: typeof obj.block === 'string' ? obj.block : '',
      mainArea: typeof obj.mainArea === 'string' ? obj.mainArea : '',
      city: typeof obj.city === 'string' ? obj.city : undefined,
    };
  }
  if (typeof value !== 'string') return { house: '', block: '', mainArea: '' };
  const trimmed = value.trim();
  if (!trimmed) return { house: '', block: '', mainArea: '' };
  // Try JSON first (the canonical serialised form).
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return {
        house: typeof parsed.house === 'string' ? parsed.house : '',
        block: typeof parsed.block === 'string' ? parsed.block : '',
        mainArea: typeof parsed.mainArea === 'string' ? parsed.mainArea : '',
        city: typeof parsed.city === 'string' ? parsed.city : undefined,
      };
    } catch {
      // fall through — treat as legacy free-form text
    }
  }
  // Legacy plain string from the old textarea — drop it into `house` so the
  // user can re-edit without losing data.
  return { house: trimmed, block: '', mainArea: '' };
}

/**
 * Determine whether a structured-address payload value satisfies the
 * "required" contract — i.e. all three text inputs are non-empty.
 */
export function isStructuredAddressComplete(value: unknown): boolean {
  const addr = parseDeliveryAddress(value);
  return Boolean(addr.house.trim() && addr.block.trim() && addr.mainArea.trim());
}

/**
 * Court tiers used to vary required-vs-optional status of intake fields.
 * Mapped from payload.select_court_type (case-insensitive). See
 * {@link courtTierFromCourtType} for the mapping.
 */
export type CourtTier =
  | 'lower'
  | 'high'
  | 'special'
  | 'shariat'
  | 'supreme'
  | 'fcc';

export type IntakeField = {
  key: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  options?: string[];
  /** Show this field only when another field equals a specific value */
  showWhen?: { field: string; value: string };
  /** Shown below the label in consumer variant only */
  hint?: string;
  /** Initial value applied on flow entry when payload has no value for this field */
  defaultValue?: string;
  /**
   * Override `required` on a per-court-tier basis. When the active court tier
   * has an explicit `true`/`false` entry here, it wins over `required`. When
   * the tier is absent or the entire map is undefined, fall back to `required`.
   */
  requiredByCourtTier?: Partial<Record<CourtTier, boolean>>;
  /**
   * Optional callback to override the displayed label for an option. The
   * stored payload value remains the raw option string; only presentation
   * changes. Used by `required_documentations` to swap Petition/Paperbook
   * based on the active court tier.
   */
  optionsLabel?: (opt: string, payload: Record<string, string>) => string;
};

// ─────────────────────────────────────────────
// Document bundle (Petition vs Paperbook) — see PDF feedback #35b
// ─────────────────────────────────────────────

/**
 * Canonical, court-tier-agnostic identifiers for the document-bundle
 * options on `required_documentations`. The user-visible label is
 * derived at render time via {@link docBundleLabel} so the same key
 * renders as "Petition + …" for Lower/High/Special/Shariat courts and
 * "Paperbook + …" for Supreme / Federal Constitutional Court.
 */
export type DocBundle =
  | 'doc_complete_file'
  | 'doc_only_last_order'
  | 'doc_only_complete_order_sheet'
  | 'doc_only_petition'
  | 'doc_petition_plus_last_order'
  | 'doc_petition_plus_complete_order';

/**
 * Tier-aware label for a {@link DocBundle}. For Supreme Court and
 * Federal Constitutional Court the word "Petition" is replaced with
 * "Paperbook"; all other tiers (lower, high, special, shariat,
 * undefined) render "Petition".
 */
export function docBundleLabel(bundle: string, tier: CourtTier | null | undefined): string {
  const usesPaperbook = tier === 'supreme' || tier === 'fcc';
  const petitionWord = usesPaperbook ? 'Paperbook' : 'Petition';
  switch (bundle) {
    case 'doc_complete_file':
      return 'Complete File';
    case 'doc_only_last_order':
      return 'Only Last Order';
    case 'doc_only_complete_order_sheet':
      return 'Only Complete Order Sheet';
    case 'doc_only_petition':
      return `Only ${petitionWord}`;
    case 'doc_petition_plus_last_order':
      return `${petitionWord} + Last Order`;
    case 'doc_petition_plus_complete_order':
      return `${petitionWord} + Complete Order`;
    default:
      return bundle;
  }
}

/**
 * Maps legacy display-string values (as historically stored in
 * `payload.required_documentations`) to the new canonical
 * {@link DocBundle} keys. Returns `undefined` when the value is
 * already canonical or unrecognised — callers should leave such
 * values unchanged.
 */
export function normalizeDocBundle(value: string | undefined | null): DocBundle | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  // Already canonical
  const canonical: DocBundle[] = [
    'doc_complete_file',
    'doc_only_last_order',
    'doc_only_complete_order_sheet',
    'doc_only_petition',
    'doc_petition_plus_last_order',
    'doc_petition_plus_complete_order',
  ];
  if ((canonical as string[]).includes(trimmed)) return trimmed as DocBundle;

  switch (trimmed) {
    case 'Complete File':
      return 'doc_complete_file';
    case 'Only Last Order':
      return 'doc_only_last_order';
    case 'Only Complete Order Sheet':
    case 'Only Complete Order':
      return 'doc_only_complete_order_sheet';
    case 'Only Petition':
    case 'Only Paperbook':
      return 'doc_only_petition';
    case 'Petition + Last Order':
    case 'Paperbook + Last Order':
      return 'doc_petition_plus_last_order';
    case 'Petition + Complete Order':
    case 'Petition + Complete Order Sheet':
    case 'Petition + Final Order':
    case 'Paperbook + Complete Order':
    case 'Paperbook + Complete Order Sheet':
      return 'doc_petition_plus_complete_order';
    default:
      return undefined;
  }
}

/**
 * Normalise the `required_documentations` value on a draft payload in
 * place. No-ops when the value is missing or already canonical. Unknown
 * values are left as-is so we never silently destroy data.
 */
export function normalizeDraftPayload(payload: Record<string, string>): Record<string, string> {
  const raw = payload?.required_documentations;
  if (!raw) return payload;
  const normalized = normalizeDocBundle(raw);
  if (!normalized || normalized === raw) return payload;
  return { ...payload, required_documentations: normalized };
}

/**
 * Map a `select_court_type` payload value to a {@link CourtTier}. Returns
 * `null` when the input is empty or unknown — callers should fall back to the
 * field's flat `required` flag in that case.
 */
export function courtTierFromCourtType(courtType: string | undefined | null): CourtTier | null {
  if (!courtType) return null;
  const normalised = courtType.trim().toLowerCase();
  switch (normalised) {
    case 'lower court':
      return 'lower';
    case 'high court':
      return 'high';
    case 'special court':
      return 'special';
    case 'federal shariat court':
      return 'shariat';
    case 'supreme court':
      return 'supreme';
    case 'federal constitutional court':
      return 'fcc';
    default:
      return null;
  }
}

/**
 * Resolve the effective `required` flag for an intake field given the active
 * court tier. Per-tier overrides take precedence over the flat `required`.
 */
export function resolveRequired(field: IntakeField, tier: CourtTier | null): boolean {
  if (tier && field.requiredByCourtTier && tier in field.requiredByCourtTier) {
    const override = field.requiredByCourtTier[tier];
    if (typeof override === 'boolean') return override;
  }
  return Boolean(field.required);
}

export type IntakeStep = {
  title: string;
  fields: IntakeField[];
};

import type { LucideIcon } from 'lucide-react';
import {
  FolderOpen,
  FileText,
  Search,
  Gavel,
  ScrollText,
  FileSearch,
  Stamp,
  UserSearch,
} from 'lucide-react';

export type IntakeFlow = {
  key: string;
  label: string;
  endpoint: string;
  steps: IntakeStep[];
  description?: string;
  icon?: LucideIcon;
};

// ─────────────────────────────────────────────
// Shared field definitions
// ─────────────────────────────────────────────

const REQUIRED_DOCS_CASE_FILES: IntakeField = {
  key: 'required_documentations',
  label: 'Required Documents',
  type: 'checkbox_single',
  required: true,
  // Stored values are canonical DocBundle keys; the renderer resolves the
  // displayed label via docBundleLabel() against the active court tier so the
  // same key renders as "Petition + …" for Lower/High/Shariat and
  // "Paperbook + …" for Supreme/FCC. See PDF feedback #35b.
  options: [
    'doc_complete_file',
    'doc_petition_plus_complete_order',
    'doc_petition_plus_last_order',
    'doc_only_petition',
    'doc_only_last_order',
    'doc_only_complete_order_sheet',
  ],
};

// Set type picker plus conditional quantity fields. Reused across flows that
// need the attested/non-attested/both set selector.
const SET_TYPE_WITH_QUANTITIES: IntakeField[] = [
  {
    key: 'set_type',
    label: 'Set Type',
    type: 'radio',
    required: true,
    options: ['attested', 'non_attested', 'both'],
  },
  {
    key: 'attested_qty',
    label: 'How many attested copies?',
    type: 'number',
    required: true,
    showWhen: { field: 'set_type', value: 'attested' },
  },
  {
    key: 'non_attested_qty',
    label: 'How many non-attested copies?',
    type: 'number',
    required: true,
    showWhen: { field: 'set_type', value: 'non_attested' },
  },
  {
    key: 'both_attested_qty',
    label: 'How many attested copies?',
    type: 'number',
    required: true,
    showWhen: { field: 'set_type', value: 'both' },
  },
  {
    key: 'both_non_attested_qty',
    label: 'How many non-attested copies?',
    type: 'number',
    required: true,
    showWhen: { field: 'set_type', value: 'both' },
  },
];

const REQUIRED_DOCS_CASE_INFO: IntakeField = {
  key: 'required_documentations',
  label: 'Required Documents',
  type: 'checkbox_single',
  required: true,
  // Canonical keys — label is resolved per court tier at render time.
  // Petition/Paperbook variants collapse into the same three keys; the
  // wording is swapped based on tier rather than offered as separate
  // user-selectable rows. See PDF feedback #35b.
  options: [
    'doc_petition_plus_last_order',
    'doc_petition_plus_complete_order',
    'doc_only_petition',
    'doc_only_last_order',
    'doc_only_complete_order_sheet',
  ],
};

// ─────────────────────────────────────────────
// 1) Case Files
// ─────────────────────────────────────────────
const caseFilesSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      {
        key: 'case_status',
        label: 'Case Status',
        type: 'radio',
        required: true,
        options: ['Pending Case', 'Decided Case', 'Unknown Case'],
        defaultValue: 'Pending Case',
        hint: 'Choose the option that best matches the latest status shown on the court file.',
      },
      {
        key: 'case_type',
        label: 'Case Type',
        type: 'select',
        required: true,
        options: [],
        // Per PDF #23-27: case_type is optional across every court tier.
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      {
        key: 'case_no',
        label: 'Case No',
        type: 'text',
        required: true,
        hint: 'Enter the exact number as it appears on the petition or order sheet.',
        // Per PDF #23-27: case_no is optional across every court tier for Case Files.
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      {
        key: 'year',
        label: 'Year',
        type: 'year_select',
        required: true,
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      {
        key: 'case_title',
        label: 'Case Title',
        type: 'text',
        required: true,
        hint: 'Use the party names exactly as written in the court record.',
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      {
        key: 'judge_name',
        label: 'Judge Name',
        type: 'text',
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      {
        key: 'judge_designation',
        label: 'Judge Designation',
        type: 'select',
        options: [],
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
      },
      { key: 'case_date', label: 'Previous Case Date', type: 'date' },
      { key: 'future_date', label: 'Future Date', type: 'date' },
      {
        key: 'decided_date',
        label: 'Decided Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Decided Case' },
      },
    ],
  },
  {
    title: 'Documents Required',
    fields: [
      ...SET_TYPE_WITH_QUANTITIES,
      REQUIRED_DOCS_CASE_FILES,
      {
        key: 'want_pdf_before_dispatch',
        label: 'Want PDF before dispatch?',
        type: 'radio',
        required: true,
        options: ['Yes', 'No'],
      },
      {
        key: 'delivery_mode',
        label: 'Delivery Method',
        type: 'radio',
        required: true,
        options: ['TCS', 'Uber', 'Self Collection'],
      },
      {
        key: 'delivery_address',
        label: 'Delivery Address',
        type: 'structured_address',
        required: true,
        showWhen: { field: 'delivery_mode', value: 'TCS' },
      },
      {
        key: 'coordinates',
        label: 'Uber Coordinates (lat, lng)',
        type: 'text',
        required: true,
        showWhen: { field: 'delivery_mode', value: 'Uber' },
      },
      {
        key: 'pickup_location',
        label: 'Pickup Location',
        type: 'text',
        required: true,
        showWhen: { field: 'delivery_mode', value: 'Self Collection' },
      },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Documents & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 2) Case Information
// ─────────────────────────────────────────────
const caseInformationSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      {
        key: 'case_type',
        label: 'Case Type',
        type: 'select',
        required: true,
        options: [],
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      {
        key: 'case_no',
        label: 'Case No',
        type: 'text',
        required: true,
        // Per PDF #34: for Case Information, case_no remains the lookup key for
        // higher courts but is optional in Lower Court.
        requiredByCourtTier: { lower: false, high: true, special: true, shariat: true, supreme: true, fcc: true },
      },
      {
        key: 'year',
        label: 'Year',
        type: 'year_select',
        required: true,
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      {
        key: 'case_title',
        label: 'Case Title',
        type: 'text',
        required: true,
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      {
        key: 'judge_name',
        label: 'Judge Name',
        type: 'text',
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      {
        key: 'judge_designation',
        label: 'Judge Designation',
        type: 'select',
        options: [],
        requiredByCourtTier: { lower: false, high: false, special: false, shariat: false, supreme: false, fcc: false },
      },
      { key: 'case_date', label: 'Case Date', type: 'date' },
    ],
  },
  {
    title: 'Required Documents & Notes',
    fields: [
      REQUIRED_DOCS_CASE_INFO,
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Information Delivery',
    fields: [
      { key: 'documents_upload_note', label: 'Upload files below', type: 'text' },
      {
        key: 'delivery_mode',
        label: 'Delivery Mode',
        type: 'radio',
        required: true,
        options: ['portal', 'whatsapp', 'other_no'],
        defaultValue: 'portal',
      },
      {
        key: 'other_no',
        label: 'Other Number',
        type: 'text',
        showWhen: { field: 'delivery_mode', value: 'other_no' },
      },
    ],
  },
];

// ─────────────────────────────────────────────
// 3) Case Search
// ─────────────────────────────────────────────
const caseSearchSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      {
        key: 'case_status',
        label: 'Case Status',
        type: 'radio',
        required: true,
        options: ['Pending Case', 'Decided Case', 'Unknown Case'],
      },
      { key: 'case_type', label: 'Case Type', type: 'select', required: true, options: [] },
      { key: 'case_no', label: 'Case No', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'judge_name', label: 'Judge Name', type: 'text' },
      { key: 'judge_designation', label: 'Judge Designation', type: 'select', options: [] },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
      },
      { key: 'case_date', label: 'Previous Case Date', type: 'date' },
      { key: 'future_date', label: 'Future Date', type: 'date' },
      {
        key: 'decided_date',
        label: 'Decided Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Decided Case' },
      },
    ],
  },
  {
    title: 'Required Documents',
    fields: [
      REQUIRED_DOCS_CASE_FILES,
      {
        key: 'delivery_mode',
        label: 'Delivery Mode',
        type: 'radio',
        required: true,
        options: ['courier', 'self_collection'],
      },
      {
        key: 'address',
        label: 'Delivery Address',
        type: 'textarea',
        showWhen: { field: 'delivery_mode', value: 'courier' },
      },
      ...SET_TYPE_WITH_QUANTITIES,
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Others & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 4) Case Filing
// ─────────────────────────────────────────────
const caseFilingSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      {
        key: 'case_status',
        label: 'Case Status',
        type: 'radio',
        required: true,
        options: ['New Case', 'Pending Case'],
      },
      {
        key: 'party_type',
        label: 'Party Type',
        type: 'select',
        required: true,
        options: ['Plaintiff/Petitioner', 'Defendant/Respondent'],
      },
      { key: 'case_type', label: 'Case Type', type: 'select', required: true, options: [] },
      {
        key: 'case_no',
        label: 'Case No',
        type: 'text',
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      {
        key: 'judge_name',
        label: 'Judge Name',
        type: 'text',
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      { key: 'judge_designation', label: 'Judge Designation', type: 'select', options: [] },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      {
        key: 'case_date',
        label: 'Case Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      {
        key: 'future_date',
        label: 'Future Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
    ],
  },
  {
    title: 'Others Details',
    fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
  },
  {
    title: 'Documents & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 5) Power of Attorney
// ─────────────────────────────────────────────
const powerOfAttorneySteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      {
        key: 'case_status',
        label: 'Case Status',
        type: 'radio',
        required: true,
        options: ['Pending Case'],
      },
      {
        key: 'party_type',
        label: 'Party Type',
        type: 'select',
        required: true,
        options: ['Plaintiff/Petitioner', 'Defendant/Respondent'],
      },
      { key: 'case_type', label: 'Case Type', type: 'select', required: true, options: [] },
      { key: 'case_no', label: 'Case No', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'judge_name', label: 'Judge Name', type: 'text' },
      { key: 'judge_designation', label: 'Judge Designation', type: 'select', options: [] },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
      },
      { key: 'case_date', label: 'Case Date', type: 'date' },
      { key: 'future_date', label: 'Future Date', type: 'date' },
    ],
  },
  {
    title: 'Others',
    fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
  },
  {
    title: 'Documents & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 6) Copy of FIR
// ─────────────────────────────────────────────
const copyOfFirSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [
      // province/district/police station handled by dedicated wizard geo block
      { key: 'province', label: 'Province', type: 'text', required: true },
      { key: 'district_id', label: 'District', type: 'text', required: true },
      { key: 'station_id', label: 'Police Station', type: 'select', required: true, options: [] },
      {
        key: 'city_type',
        label: 'City Type',
        type: 'radio',
        required: true,
        options: ['City', 'Sadar', 'Unknown'],
      },
    ],
  },
  {
    title: 'Case Particulars',
    fields: [
      { key: 'fir_no', label: 'FIR No', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'offence', label: 'Offence', type: 'text', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'case_date', label: 'Case Date', type: 'date' },
      {
        key: 'date_unknow',
        label: 'Date Unknown',
        type: 'radio',
        options: ['No', 'Yes'],
      },
    ],
  },
  {
    title: 'Required Documents & Others',
    fields: [
      {
        key: 'delivery_mode',
        label: 'Delivery Mode',
        type: 'radio',
        required: true,
        options: ['courier', 'self_collection'],
      },
      {
        key: 'address',
        label: 'Delivery Address',
        type: 'textarea',
        showWhen: { field: 'delivery_mode', value: 'courier' },
      },
      ...SET_TYPE_WITH_QUANTITIES,
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Images & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 7) Copy of Registry/Deed
// ─────────────────────────────────────────────
const registryDeedSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [
      { key: 'office_name', label: 'Office Name', type: 'text', required: true },
      {
        key: 'city_type',
        label: 'City Type',
        type: 'radio',
        required: true,
        options: ['City', 'Sadar', 'Unknown'],
      },
    ],
  },
  {
    title: 'Case Particulars',
    fields: [
      { key: 'doc_no', label: 'Doc No.', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'year_select', required: true },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'case_date', label: 'Case Date', type: 'date' },
      {
        key: 'date_unknow',
        label: 'Date Unknown',
        type: 'radio',
        options: ['No', 'Yes'],
      },
    ],
  },
  {
    title: 'Required Documents & Others',
    fields: [
      {
        key: 'delivery_mode',
        label: 'Delivery Mode',
        type: 'radio',
        required: true,
        options: ['courier', 'self_collection'],
      },
      {
        key: 'address',
        label: 'Delivery Address',
        type: 'textarea',
        showWhen: { field: 'delivery_mode', value: 'courier' },
      },
      ...SET_TYPE_WITH_QUANTITIES,
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Images & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// 8) Search Criminal Record (by CNIC + Police Station)
// ─────────────────────────────────────────────
const criminalRecordSearchSteps: IntakeStep[] = [
  {
    title: 'Location & Service',
    fields: [
      // Re-uses the same Police-Station geo block as `non_judicial_copy_of_fir`.
      { key: 'province', label: 'Province', type: 'text', required: true },
      { key: 'district_id', label: 'District', type: 'text', required: true },
      { key: 'station_id', label: 'Police Station', type: 'select', required: true, options: [] },
      {
        key: 'city_type',
        label: 'City Type',
        type: 'radio',
        required: true,
        options: ['City', 'Sadar', 'Unknown'],
      },
    ],
  },
  {
    title: 'Subject Details',
    fields: [
      {
        key: 'subject_cnic',
        label: 'Subject CNIC',
        type: 'text',
        required: true,
        hint: 'Format: 12345-1234567-1',
      },
      {
        key: 'subject_full_name',
        label: 'Subject full name',
        type: 'text',
        required: true,
      },
      {
        key: 'requestor_relationship',
        label: 'Your relationship to the subject',
        type: 'radio',
        required: true,
        options: ['Self', 'Family', 'Legal Representative', 'Other'],
      },
      {
        key: 'purpose',
        label: 'Purpose of request',
        type: 'textarea',
        required: true,
        hint: "We use this to validate the request against the police station's records.",
      },
    ],
  },
  {
    title: 'Information Delivery',
    fields: [
      {
        key: 'delivery_mode',
        label: 'Delivery Mode',
        type: 'radio',
        required: true,
        options: ['portal', 'whatsapp', 'other_no'],
        defaultValue: 'portal',
      },
      {
        key: 'other_no',
        label: 'Other Number',
        type: 'text',
        showWhen: { field: 'delivery_mode', value: 'other_no' },
      },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
];

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

export const judicialFlows: IntakeFlow[] = [
  {
    key: 'judicial_case_files',
    label: 'Case Files',
    endpoint: '/tickets/intake/judicial/case-files',
    steps: caseFilesSteps,
    description: 'Order certified or non-attested copies of complete case files and order sheets.',
    icon: FolderOpen,
  },
  {
    key: 'judicial_case_information',
    label: 'Case Information',
    endpoint: '/tickets/intake/judicial/case-information',
    steps: caseInformationSteps,
    description: 'Retrieve paperbook, petition, and order details for an existing case.',
    icon: FileText,
  },
  {
    key: 'judicial_case_search',
    label: 'Case Search',
    endpoint: '/tickets/intake/judicial/case-search',
    steps: caseSearchSteps,
    description: 'Locate a case by party name or particulars when the case number is unknown.',
    icon: Search,
  },
  {
    key: 'judicial_case_filing',
    label: 'Case Filling',
    endpoint: '/tickets/intake/judicial/case-filing',
    steps: caseFilingSteps,
    description: 'File a new petition or matter at the selected court seat.',
    icon: Gavel,
  },
  {
    key: 'judicial_power_of_attorney',
    label: 'Power of Attorney',
    endpoint: '/tickets/intake/judicial/power-of-attorney',
    steps: powerOfAttorneySteps,
    description: 'Prepare and file a power of attorney for representation in court.',
    icon: ScrollText,
  },
];

export const nonJudicialFlows: IntakeFlow[] = [
  {
    key: 'non_judicial_copy_of_fir',
    label: 'Copy of FIR',
    endpoint: '/tickets/intake/non-judicial/copy-of-fir',
    steps: copyOfFirSteps,
    description: 'Obtain a certified copy of a First Information Report from the relevant police station.',
    icon: FileSearch,
  },
  {
    key: 'non_judicial_registry_deed',
    label: 'Registry/Deed',
    endpoint: '/tickets/intake/non-judicial/registry-deed',
    steps: registryDeedSteps,
    description: 'Request registry, mutation, or deed copies from the land/registrar office.',
    icon: Stamp,
  },
  {
    key: 'non_judicial_criminal_record_search',
    label: 'Search Criminal Record',
    endpoint: '/tickets/intake/non-judicial/criminal-record-search',
    steps: criminalRecordSearchSteps,
    description: 'Lookup records by CNIC at the relevant Police Station.',
    icon: UserSearch,
  },
];

const FLOW_KEY_TO_SLUG: Record<string, string> = {
  judicial_case_files: 'case-files',
  judicial_case_information: 'case-information',
  judicial_case_search: 'case-search',
  judicial_case_filing: 'case-filing',
  judicial_power_of_attorney: 'power-of-attorney',
  non_judicial_copy_of_fir: 'copy-of-fir',
  non_judicial_registry_deed: 'registry-deed',
  non_judicial_criminal_record_search: 'criminal-record-search',
};

const SLUG_TO_FLOW_KEY: Record<'judicial' | 'non_judicial', Record<string, string>> = {
  judicial: {
    'case-files': 'judicial_case_files',
    'case-information': 'judicial_case_information',
    'case-search': 'judicial_case_search',
    'case-filing': 'judicial_case_filing',
    'power-of-attorney': 'judicial_power_of_attorney',
  },
  non_judicial: {
    'copy-of-fir': 'non_judicial_copy_of_fir',
    'registry-deed': 'non_judicial_registry_deed',
    'criminal-record-search': 'non_judicial_criminal_record_search',
  },
};

export function flowKeyToSlug(key: string): string {
  return FLOW_KEY_TO_SLUG[key] ?? key;
}

export function slugToFlowKey(
  slug: string,
  category: 'judicial' | 'non_judicial',
): string | null {
  return SLUG_TO_FLOW_KEY[category][slug] ?? null;
}
