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
  | 'bench'             // multi-judge bench picker (PDF #15, #16)
  | 'info'              // readonly informational note (e.g. clerk dispatch address summary)
  | 'search_method_tabs' // PDF #37: two-tab search method picker (Case Search flow)
  | 'file';

// ─────────────────────────────────────────────
// Multi-judge bench (PDF #15, #16)
// ─────────────────────────────────────────────

/**
 * Shape of the payload value stored under `bench`. `benchType` is one of the
 * tier-specific bench-type values (see BENCH_TYPES_BY_TIER in
 * intake-wizard.tsx). `judges` is an array of judge names in seniority order;
 * its length is governed by the bench-type's expected count, with trailing
 * empty strings allowed during editing.
 */
export type Bench = {
  benchType: string;
  judges: string[];
};

/**
 * Parse a `bench` payload value (object or JSON string) into a {@link Bench}.
 * Falls back to a single-judge bench when the value is malformed/missing.
 */
export function parseBench(value: unknown): Bench {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const benchType = typeof obj.benchType === 'string' && obj.benchType ? obj.benchType : 'single_judge';
    const judges = Array.isArray(obj.judges)
      ? (obj.judges as unknown[]).map((j) => (typeof j === 'string' ? j : ''))
      : [];
    return { benchType, judges };
  }
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parseBench(parsed);
    } catch {
      // fall through
    }
  }
  return { benchType: 'single_judge', judges: [] };
}

/**
 * Format the bench judges into the display string convention
 * `J. <name1> & J. <name2> ...`, skipping empty names. Returns '' when no
 * non-empty names are present.
 */
export function formatBenchJudgeName(judges: string[]): string {
  return judges
    .map((j) => j.trim())
    .filter(Boolean)
    .map((j) => (j.toLowerCase().startsWith('j.') ? j : `J. ${j}`))
    .join(' & ');
}

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
  /**
   * Show this field only when another field equals a specific value, OR when
   * the other field's value is one of `valueIn` (use exactly one of the two).
   * `valueIn` is used by the Case Search search-method tabs (PDF #37) where a
   * field is visible for both the "CNIC" and "both" states.
   */
  showWhen?: { field: string; value?: string; valueIn?: string[]; valueNotIn?: string[] };
  /** Shown below the label in consumer variant only */
  hint?: string;
  /** Optional placeholder for text/textarea inputs */
  placeholder?: string;
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
  /**
   * Optional regex pattern enforced on non-empty values. The `regex` string is
   * compiled with `new RegExp(...)` and the field is rejected with `message`
   * when the value (after the field is required-resolved and non-empty) does
   * not match. Empty values fall through to the `required` check.
   */
  pattern?: { regex: string; message: string };
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
  let next: Record<string, string> = payload;
  const raw = payload?.required_documentations;
  if (raw) {
    const normalized = normalizeDocBundle(raw);
    if (normalized && normalized !== raw) {
      next = { ...next, required_documentations: normalized };
    }
  }
  // Migrate legacy `judge_name` text drafts into a structured `bench`
  // object (single-judge bench) so the new renderer can hydrate them.
  // PDF feedback #15/#16.
  if (next.judge_name && !next.bench) {
    const synthesized: Bench = {
      benchType: 'single_judge',
      judges: [next.judge_name],
    };
    next = { ...next, bench: JSON.stringify(synthesized) };
  }
  return next;
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
 * Determine whether a field's `showWhen` is satisfied by the current payload.
 * Returns true when the field has no `showWhen` (always visible) or when the
 * referenced field's value matches either `value` or any entry in `valueIn`.
 */
export function showWhenSatisfied(
  field: IntakeField,
  payload: Record<string, string>,
): boolean {
  const sw = field.showWhen;
  if (!sw) return true;
  const current = payload[sw.field] ?? '';
  // `valueNotIn` is a blacklist: the field is hidden when the referenced
  // value matches any entry, otherwise visible. Used independently of
  // value / valueIn (e.g. "show bench for everything EXCEPT Lower / Special").
  if (sw.valueNotIn) return !sw.valueNotIn.includes(current);
  if (sw.value !== undefined && current === sw.value) return true;
  if (sw.valueIn && sw.valueIn.includes(current)) return true;
  return false;
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
  /**
   * When the slug→flow mapping already uniquely determines the catalogue
   * service (single-service non-judicial flows), pre-select this service on
   * wizard mount so the user doesn't have to click the only available tile.
   * Judicial flows leave this undefined — the service is a genuine choice
   * (Lower / Special / High / Shariat / Supreme / FCC).
   */
  defaultServiceId?: string;
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
  hint: "Pick the document bundle you want. 'Petition + Last Order' covers most appeals; higher-court flows use Paperbook instead.",
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
    hint: 'Attested copies are sealed by the court. Non-Attested are plain photocopies. Both gives you one of each.',
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
  hint: "Pick the document bundle you want. 'Petition + Last Order' covers most appeals; higher-court flows use Paperbook instead.",
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
        key: 'case_date',
        label: 'Previous Case Date',
        type: 'date',
        hint: 'Date of the last hearing or order on this case.',
      },
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
        // PDF #23-#27 literal matrix (case-files step 2).
        // Special Court (#25) is the only tier that flags case_type as required.
        requiredByCourtTier: { lower: false, high: false, special: true, shariat: false, supreme: false, fcc: false },
        hint: "Pick the case category as printed on the petition or order sheet. Choose 'Other' if your category isn't listed.",
      },
      {
        key: 'case_type_other',
        label: 'Specify case type',
        type: 'text',
        required: false,
        placeholder: 'Type the case type as it appears on your record',
        showWhen: { field: 'case_type', value: 'Other' },
        hint: 'Type the case category exactly as it appears on your court record.',
      },
      {
        key: 'case_no',
        label: 'Case No',
        type: 'text',
        required: true,
        hint: 'Enter the exact number as it appears on the petition or order sheet.',
        // PDF #23-#27: High / Shariat / Supreme / FCC mark case_no required;
        // Lower (#23) and Special (#25) mark it optional with a red ✗.
        requiredByCourtTier: { lower: false, high: true, special: false, shariat: true, supreme: true, fcc: true },
      },
      {
        key: 'year',
        label: 'Year',
        type: 'year_select',
        required: true,
        // PDF #23-#27: year is required only for Special Court (#25).
        requiredByCourtTier: { lower: false, high: false, special: true, shariat: false, supreme: false, fcc: false },
        hint: 'Year the case was filed (per the order sheet or petition heading).',
        // 5-19-26 #6: for Decided cases the year that drives pricing is
        // `decided_date`, not this filing-year input. Two inputs on the same
        // step produced silent disagreement (year=2025 + decided_date=2024-XX
        // → pricing used 2024 → wrong band). Hide for Decided; the wizard
        // syncs payload.year = decided_date.slice(0,4) so backend validators
        // (REQUIRED_FIELDS_BY_FLOW) still see a year.
        showWhen: { field: 'case_status', valueIn: ['Pending Case', 'Unknown Case'] },
      },
      {
        key: 'case_title',
        label: 'Case Title',
        type: 'text',
        required: true,
        hint: 'Use the party names exactly as written in the court record.',
        // PDF #23-#27: Lower (#23), Special (#25), and FSC (#26 — unmarked,
        // treated as keep-required) mark case_title required. High (#24) and
        // Supreme/FCC (#27) mark it optional.
        requiredByCourtTier: { lower: true, high: false, special: true, shariat: true, supreme: false, fcc: false },
      },
      {
        key: 'bench',
        label: 'Bench',
        type: 'bench',
        required: true,
        // 5-19-26 CF#3: bench is hidden for Lower & Special — those tiers
        // are single-judge by default, so the picker is redundant with
        // judge_designation.
        requiredByCourtTier: { high: false, shariat: true, supreme: true, fcc: true },
        showWhen: { field: 'select_court_type', valueNotIn: ['Lower Court', 'Special Court'] },
        hint: 'For multi-judge benches, name each judge in seniority order.',
      },
      {
        key: 'judge_designation',
        label: 'Judge Designation',
        type: 'select',
        required: true,
        options: [],
        // PDF #23-#27 + QA 5-14-26 #34: judge_designation required for Lower
        // (parity with Case Information) / Special / Shariat / Supreme / FCC.
        // Optional for High Court only.
        requiredByCourtTier: { lower: true, high: false, special: true, shariat: true, supreme: true, fcc: true },
        hint: 'Title of the presiding judge — match the most recent order sheet.',
      },
      {
        key: 'judge_name',
        label: 'Judge Name',
        type: 'text',
        required: true,
        // 2026-05-23 B1: judge_name mandatory for Lower Court only.
        requiredByCourtTier: { lower: true, high: false, special: false, shariat: false, supreme: false, fcc: false },
        hint: 'Name of the presiding judge — match the most recent order sheet.',
      },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
        hint: "Pick 'Unknown' if you can't find the date on your papers — we'll do our best with what we have.",
      },
      {
        key: 'future_date',
        label: 'Future Date',
        type: 'date',
        hint: "Date of the upcoming hearing. We'll have the documents ready before then.",
      },
      {
        key: 'decided_date',
        label: 'Decided Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Decided Case' },
        hint: 'Date the case was decided, per the final court order.',
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
      // 2026-05-23 B3: case_date moved to first position.
      {
        key: 'case_date',
        label: 'Case Date',
        type: 'date',
        hint: 'Date of the last hearing or order on this case.',
      },
      // 2026-05-23 B2: case_type + case_type_other removed (Case Info is
      // pending-only — no case type picker needed).
      {
        key: 'case_no',
        label: 'Case No',
        type: 'text',
        required: true,
        // Per PDF #34: case_no is optional in Lower Case Info; higher tiers
        // need it as the lookup key.
        requiredByCourtTier: { lower: false, high: true, special: true, shariat: true, supreme: true, fcc: true },
      },
      {
        key: 'year',
        label: 'Year',
        type: 'year_select',
        required: true,
        // PDF #34 marks year optional for Lower Case Info. Mirror Case-Files
        // Special-Court (#25) so Special keeps it required.
        requiredByCourtTier: { lower: false, high: false, special: true, shariat: false, supreme: false, fcc: false },
        hint: 'Year the case was filed (per the order sheet or petition heading).',
      },
      {
        key: 'case_title',
        label: 'Case Title',
        type: 'text',
        required: true,
        // PDF #34 marks case_title required for Lower Case Info. Mirror
        // Case-Files for higher tiers (PDF #23-#27 matrix).
        requiredByCourtTier: { lower: true, high: false, special: true, shariat: true, supreme: false, fcc: false },
      },
      {
        key: 'bench',
        label: 'Bench',
        type: 'bench',
        required: true,
        // 5-19-26 CF#3: bench hidden for Lower & Special in Case Info too —
        // single-judge by default, redundant with judge_designation.
        requiredByCourtTier: { high: false, shariat: true, supreme: true, fcc: true },
        showWhen: { field: 'select_court_type', valueNotIn: ['Lower Court', 'Special Court'] },
        hint: 'For multi-judge benches, name each judge in seniority order.',
      },
      {
        key: 'judge_designation',
        label: 'Judge Designation',
        type: 'select',
        required: true,
        options: [],
        // PDF #34 marks judge_designation required for Lower Case Info. Same
        // matrix as Case-Files (#23-#27): Lower + High optional, the rest
        // required.
        requiredByCourtTier: { lower: true, high: false, special: true, shariat: true, supreme: true, fcc: true },
        hint: 'Title of the presiding judge — match the most recent order sheet.',
      },
      {
        key: 'judge_name',
        label: 'Judge Name',
        type: 'text',
        required: true,
        // 2026-05-23 B1: judge_name mandatory for Lower Court only.
        requiredByCourtTier: { lower: true, high: false, special: false, shariat: false, supreme: false, fcc: false },
        hint: 'Name of the presiding judge — match the most recent order sheet.',
      },
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
// 3) Case Search (PDF #36-#39)
//
// Step 1 supports multi-city selection (1..N cities). Pricing is linear in the
// number of cities (Rs 2,000 per city, or Rs 3,000 per city if both search
// methods are selected). Step 2 lets the consumer pick one or both of two
// search methods (by CNIC and/or by Case Details). All fields in Step 2 are
// optional — the form is intentionally free-form.
// ─────────────────────────────────────────────
const caseSearchSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [{ key: 'select_service', label: 'Select Service', type: 'text', required: true }],
  },
  {
    title: 'Case Details',
    fields: [
      // Search-method picker (PDF #37). Stored as 'cnic' | 'details' | 'both'.
      {
        key: 'search_method',
        label: 'How would you like to search?',
        type: 'search_method_tabs',
        hint: 'Pick either method, or pick both for a wider search.',
      },
      // CNIC tab fields — visible for 'cnic' and 'both'.
      {
        key: 'subject_cnic',
        label: 'Subject CNIC',
        type: 'text',
        hint: 'Format: 12345-1234567-1',
        showWhen: { field: 'search_method', valueIn: ['cnic', 'both'] },
        pattern: {
          regex: '^\\d{5}-\\d{7}-\\d$',
          message: 'CNIC must be in the format 12345-1234567-1',
        },
      },
      {
        key: 'subject_full_name',
        label: 'Subject full name',
        type: 'text',
        showWhen: { field: 'search_method', valueIn: ['cnic', 'both'] },
        hint: 'Full name as it appears on the CNIC.',
      },
      // Case Details tab fields — visible for 'details' and 'both'. All
      // optional (PDF #37: "Remove all * required asterisks").
      // 2026-05-23 B3: case_date leads the Case Details group; showWhen preserved.
      // 5-19-26 CS#4 + 5-16-26 Case Search Page 2: capture a date for
      // Pending / Unknown cases too — drives the years-since pricing the
      // owner wants (Rs 2,000 per year-back). decided_date covers Decided.
      {
        key: 'case_date',
        label: 'Case Date',
        type: 'date',
        showWhen: { field: 'case_status', valueIn: ['Pending Case', 'Unknown Case'] },
        hint: 'Date of the last hearing or order, if known.',
      },
      {
        key: 'case_status',
        label: 'Case Status',
        type: 'radio',
        options: ['Pending Case', 'Decided Case', 'Unknown Case'],
        showWhen: { field: 'search_method', valueIn: ['details', 'both'] },
      },
      {
        key: 'case_type',
        label: 'Case Type',
        type: 'select',
        options: [],
        showWhen: { field: 'search_method', valueIn: ['details', 'both'] },
        hint: "Pick the case category as printed on the petition or order sheet. Choose 'Other' if your category isn't listed.",
      },
      {
        key: 'case_type_other',
        label: 'Specify case type',
        type: 'text',
        required: false,
        placeholder: 'Type the case type as it appears on your record',
        showWhen: { field: 'case_type', value: 'Other' },
        hint: 'Type the case category exactly as it appears on your court record.',
      },
      {
        key: 'case_no',
        label: 'Case No',
        type: 'text',
        showWhen: { field: 'search_method', valueIn: ['details', 'both'] },
      },
      {
        key: 'year',
        label: 'Year',
        type: 'year_select',
        showWhen: { field: 'search_method', valueIn: ['details', 'both'] },
        hint: 'Year the case was filed (per the order sheet or petition heading).',
      },
      {
        key: 'case_title',
        label: 'Case Title',
        type: 'text',
        showWhen: { field: 'search_method', valueIn: ['details', 'both'] },
      },
      {
        key: 'judge_name',
        label: 'Judge Name',
        type: 'text',
        showWhen: { field: 'search_method', valueIn: ['details', 'both'] },
      },
      {
        key: 'judge_designation',
        label: 'Judge Designation',
        type: 'select',
        options: [],
        showWhen: { field: 'search_method', valueIn: ['details', 'both'] },
        hint: 'Title of the presiding judge — match the most recent order sheet.',
      },
      {
        key: 'decided_date',
        label: 'Decided Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Decided Case' },
        hint: 'Date the case was decided, per the final court order.',
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
      // 2026-05-23 B4: attested/non-attested set_type restricted to Case Files
      // only. Removed SET_TYPE_WITH_QUANTITIES spread from Case Search.
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    title: 'Others & Delivery',
    fields: [{ key: 'documents_upload_note', label: 'Upload files below', type: 'text' }],
  },
];

// ─────────────────────────────────────────────
// Multi-city payload helpers (Case Search — PDF #36)
//
// Cities are stored on the payload under the key `cities` as a JSON-stringified
// array of city ids (e.g. '["city_lhr","city_khi"]'). The legacy `city_id`
// remains in sync with `cities[0]` so the existing court loader / geo blocks
// continue to function. A consumer picking a single city writes `["<id>"]`.
// ─────────────────────────────────────────────

export function parseCities(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && Boolean(v));
  }
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string' && Boolean(v));
      }
    } catch {
      // fall through
    }
  }
  // Legacy single-id fallback.
  return [trimmed];
}

export function stringifyCities(ids: string[]): string {
  return JSON.stringify(ids.filter(Boolean));
}

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
      // 2026-05-23 B3: Pending-case case_date moved to first position; showWhen
      // preserved. New-case "Date of Institution" (same key) stays in place.
      {
        key: 'case_date',
        label: 'Case Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Pending Case' },
        hint: 'Date of the last hearing or order on this case.',
      },
      {
        key: 'case_status',
        label: 'Case Status',
        type: 'radio',
        required: true,
        options: ['New Case', 'Pending Case'],
      },
      {
        // QA R3: for NEW filings the consumer is always the filer (no
        // opposing party yet), so we hide the picker and let the wizard
        // auto-fill Plaintiff/Petitioner on submit. The picker stays
        // visible — and required — for replies on PENDING cases where
        // either side could be filing.
        key: 'party_type',
        label: 'Party Type',
        type: 'select',
        required: true,
        defaultValue: 'Plaintiff/Petitioner',
        options: ['Plaintiff/Petitioner', 'Defendant/Respondent'],
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      {
        key: 'case_type',
        label: 'Case Type',
        type: 'select',
        required: true,
        options: [],
        hint: "Pick the case category as printed on the petition or order sheet. Choose 'Other' if your category isn't listed.",
      },
      {
        key: 'case_type_other',
        label: 'Specify case type',
        type: 'text',
        required: false,
        placeholder: 'Type the case type as it appears on your record',
        showWhen: { field: 'case_type', value: 'Other' },
        hint: 'Type the case category exactly as it appears on your court record.',
      },
      {
        key: 'case_no',
        label: 'Case No',
        type: 'text',
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      {
        key: 'year',
        label: 'Year',
        type: 'year_select',
        required: true,
        hint: 'Year the case was filed (per the order sheet or petition heading).',
      },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      {
        key: 'judge_name',
        label: 'Judge Name',
        type: 'text',
        showWhen: { field: 'case_status', value: 'Pending Case' },
      },
      {
        key: 'judge_designation',
        label: 'Judge Designation',
        type: 'select',
        options: [],
        hint: 'Title of the presiding judge — match the most recent order sheet.',
      },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
        showWhen: { field: 'case_status', value: 'Pending Case' },
        hint: "Pick 'Unknown' if you can't find the date on your papers — we'll do our best with what we have.",
      },
      {
        // QA R4: for new filings, the clerk needs the Date of Institution
        // (i.e. when the case will be / has been filed). Same canonical
        // payload key (`case_date`) so the API normalises identically; the
        // label and helper text change based on case_status.
        key: 'case_date',
        label: 'Date of Institution',
        type: 'date',
        showWhen: { field: 'case_status', value: 'New Case' },
        hint: 'Date the case is being filed (or has just been filed) at the court registry.',
      },
      {
        key: 'future_date',
        label: 'Future Date',
        type: 'date',
        showWhen: { field: 'case_status', value: 'Pending Case' },
        hint: "Date of the upcoming hearing. We'll have the documents ready before then.",
      },
    ],
  },
  {
    title: 'Others Details',
    fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
  },
  {
    title: 'Documents & Delivery',
    fields: [
      // Readonly summary of where the clerk will physically file these docs
      // (PDF #42–#43). The wizard pre-populates select_court / select_court_city
      // in step 1; we just surface them back to the consumer here so they know
      // a clerk in that city will take dispatch from us.
      {
        key: 'clerk_dispatch_address',
        label: 'Clerk Dispatch Address',
        type: 'info',
      },
      { key: 'documents_upload_note', label: 'Upload files below', type: 'text' },
    ],
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
      // 2026-05-23 B3: case_date moved to first position; showWhen preserved.
      {
        key: 'case_date',
        label: 'Case Date',
        type: 'date',
        hint: 'Date of the last hearing or order on this case.',
      },
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
      {
        key: 'case_type',
        label: 'Case Type',
        type: 'select',
        required: true,
        options: [],
        hint: "Pick the case category as printed on the petition or order sheet. Choose 'Other' if your category isn't listed.",
      },
      {
        key: 'case_type_other',
        label: 'Specify case type',
        type: 'text',
        required: false,
        placeholder: 'Type the case type as it appears on your record',
        showWhen: { field: 'case_type', value: 'Other' },
        hint: 'Type the case category exactly as it appears on your court record.',
      },
      { key: 'case_no', label: 'Case No', type: 'text', required: true },
      {
        key: 'year',
        label: 'Year',
        type: 'year_select',
        required: true,
        hint: 'Year the case was filed (per the order sheet or petition heading).',
      },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
      { key: 'judge_name', label: 'Judge Name', type: 'text' },
      {
        key: 'judge_designation',
        label: 'Judge Designation',
        type: 'select',
        options: [],
        hint: 'Title of the presiding judge — match the most recent order sheet.',
      },
      {
        key: 'case_date_status',
        label: 'Case Date Status',
        type: 'radio',
        options: ['Known', 'Unknown'],
        hint: "Pick 'Unknown' if you can't find the date on your papers — we'll do our best with what we have.",
      },
      {
        key: 'future_date',
        label: 'Future Date',
        type: 'date',
        hint: "Date of the upcoming hearing. We'll have the documents ready before then.",
      },
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
// 5-14-26 addendum: "copy of fir is not only copy of fir its also search
// criminal record by cnic." The FIR flow now handles two modes via a
// top-of-flow `fir_mode` radio:
//   - `have_fir_number` (default): the original Copy-of-FIR fields
//     (fir_no / year / offence / case_title / …).
//   - `search_by_cnic`: the Search Criminal Record fields (subject_cnic /
//     subject_full_name / requestor_relationship / purpose).
// The shared steps (police-station geo + delivery) apply to both modes.
// On submit, `intake-wizard.tsx` reroutes search_by_cnic submissions to
// the criminal-record-search endpoint with the matching service/flow so
// backend validation + reporting keep the two cohorts cleanly separated.
const copyOfFirSteps: IntakeStep[] = [
  {
    title: 'Service Selection',
    fields: [
      {
        key: 'fir_mode',
        label: 'What are you looking for?',
        type: 'radio',
        required: true,
        defaultValue: 'have_fir_number',
        options: ['have_fir_number', 'search_by_cnic'],
        optionsLabel: (opt) =>
          opt === 'have_fir_number'
            ? 'I have an FIR number'
            : 'Search criminal records by CNIC',
      },
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
    title: 'Request Details',
    fields: [
      // 2026-05-23 B3: case_date + date_unknow moved to first; showWhen preserved.
      {
        key: 'case_date',
        label: 'Case Date',
        type: 'date',
        hint: 'Date of the last hearing or order on this case.',
        showWhen: { field: 'fir_mode', value: 'have_fir_number' },
      },
      {
        key: 'date_unknow',
        label: 'Date Unknown',
        type: 'radio',
        options: ['No', 'Yes'],
        showWhen: { field: 'fir_mode', value: 'have_fir_number' },
      },
      // have_fir_number mode — the original Copy of FIR fields.
      {
        key: 'fir_no',
        label: 'FIR No',
        type: 'text',
        required: true,
        showWhen: { field: 'fir_mode', value: 'have_fir_number' },
      },
      {
        key: 'year',
        label: 'Year',
        type: 'year_select',
        required: true,
        hint: 'Year the case was filed (per the order sheet or petition heading).',
        showWhen: { field: 'fir_mode', value: 'have_fir_number' },
      },
      {
        key: 'offence',
        label: 'Offence',
        type: 'text',
        required: true,
        showWhen: { field: 'fir_mode', value: 'have_fir_number' },
      },
      {
        key: 'case_title',
        label: 'Case Title',
        type: 'text',
        required: true,
        showWhen: { field: 'fir_mode', value: 'have_fir_number' },
      },
      // search_by_cnic mode — the Search Criminal Record fields.
      {
        key: 'subject_cnic',
        label: 'Subject CNIC',
        type: 'text',
        required: true,
        hint: 'Format: 12345-1234567-1',
        pattern: {
          regex: '^\\d{5}-\\d{7}-\\d$',
          message: 'CNIC must be in the format 12345-1234567-1',
        },
        showWhen: { field: 'fir_mode', value: 'search_by_cnic' },
      },
      {
        key: 'subject_full_name',
        label: 'Subject full name',
        type: 'text',
        required: true,
        hint: 'Full name as it appears on the CNIC.',
        showWhen: { field: 'fir_mode', value: 'search_by_cnic' },
      },
      {
        key: 'requestor_relationship',
        label: 'Your relationship to the subject',
        type: 'radio',
        required: true,
        options: ['Self', 'Family', 'Legal Representative', 'Other'],
        hint: 'Your relationship to the subject — helps the police station validate the request.',
        showWhen: { field: 'fir_mode', value: 'search_by_cnic' },
      },
      {
        key: 'purpose',
        label: 'Purpose of request',
        type: 'textarea',
        required: true,
        hint: "We use this to validate the request against the police station's records.",
        showWhen: { field: 'fir_mode', value: 'search_by_cnic' },
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
      // 2026-05-23 B4: SET_TYPE_WITH_QUANTITIES removed (attested/non-attested
      // restricted to Case Files only).
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
      // 2026-05-23 B3: case_date + date_unknow moved to first position.
      {
        key: 'case_date',
        label: 'Case Date',
        type: 'date',
        hint: 'Date of the last hearing or order on this case.',
      },
      {
        key: 'date_unknow',
        label: 'Date Unknown',
        type: 'radio',
        options: ['No', 'Yes'],
      },
      { key: 'doc_no', label: 'Doc No.', type: 'text', required: true },
      {
        key: 'year',
        label: 'Year',
        type: 'year_select',
        required: true,
        hint: 'Year the case was filed (per the order sheet or petition heading).',
      },
      { key: 'case_title', label: 'Case Title', type: 'text', required: true },
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
      // 2026-05-23 B4: SET_TYPE_WITH_QUANTITIES removed (attested/non-attested
      // restricted to Case Files only).
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
        pattern: {
          regex: '^\\d{5}-\\d{7}-\\d$',
          message: 'CNIC must be in the format 12345-1234567-1',
        },
      },
      {
        key: 'subject_full_name',
        label: 'Subject full name',
        type: 'text',
        required: true,
        hint: 'Full name as it appears on the CNIC.',
      },
      {
        key: 'requestor_relationship',
        label: 'Your relationship to the subject',
        type: 'radio',
        required: true,
        options: ['Self', 'Family', 'Legal Representative', 'Other'],
        hint: 'Your relationship to the subject — helps the police station validate the request.',
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
    label: 'Case Filing',
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
    defaultServiceId: 'svc_non_judicial_fir',
  },
  {
    key: 'non_judicial_registry_deed',
    label: 'Registry/Deed',
    endpoint: '/tickets/intake/non-judicial/registry-deed',
    steps: registryDeedSteps,
    description: 'Request registry, mutation, or deed copies from the land/registrar office.',
    icon: Stamp,
    defaultServiceId: 'svc_non_judicial_registry_deed',
  },
  {
    key: 'non_judicial_criminal_record_search',
    label: 'Search Criminal Record by CNIC by Police Station',
    endpoint: '/tickets/intake/non-judicial/criminal-record-search',
    steps: criminalRecordSearchSteps,
    description: 'Lookup records by CNIC at the relevant Police Station.',
    icon: UserSearch,
    defaultServiceId: 'svc_non_judicial_criminal_record',
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
