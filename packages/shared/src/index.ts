export const USER_ROLES = [
  'super-admin',
  'manager-admin',
  'staff-admin',
  'lead-admin',
  'lawyer',
  'consumer',
  'representative',
  'investor',
  'company',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const TICKET_STATUSES = [
  'UNPAID',
  'PAID',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_APPROVAL',
  'COMPLETED',
  'DELIVERED',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

// Spec 4: paymentStatus is retired — payment state derives from amounts.
// Single source for the money comparisons used across API + web.
export function isBaseCovered(t: {
  amountPaid: unknown;
  serviceCost: unknown;
}): boolean {
  return Number(t.amountPaid ?? 0) >= Number(t.serviceCost ?? 0);
}
export function isFullyPaid(t: {
  amountPaid: unknown;
  totalAmount: unknown;
}): boolean {
  return Number(t.amountPaid ?? 0) >= Number(t.totalAmount ?? 0);
}

export const PAYMENT_MODES = ['JAZZ_CASH', 'EASY_PAISA', 'BANK_TRANSFER'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const CONSUMER_KINDS = ['LAWYER', 'NON_LAWYER', 'CORPORATE'] as const;
export type ConsumerKind = (typeof CONSUMER_KINDS)[number];
export const CONSUMER_KIND_LABELS: Record<ConsumerKind, string> = {
  LAWYER: 'Lawyer',
  NON_LAWYER: 'Non-Lawyer',
  CORPORATE: 'Corporate',
};
export const CONSUMER_KIND_DESCRIPTIONS: Record<ConsumerKind, string> = {
  LAWYER: 'Practicing attorney filing or pursuing cases.',
  NON_LAWYER: 'Individual seeking paralegal services.',
  CORPORATE:
    'Company or organization requesting services on behalf of staff or clients.',
};

export const PERMISSIONS = [
  'users.read',
  'users.write',
  'tickets.read',
  'tickets.write',
  'finance.read',
  'finance.write',
  'wallet.read',
  'wallet.write',
  'wallet.topup',
  'costs.read',
  'costs.write',
  'elections.read',
  'elections.write',
  'elections.vote',
  'reports.read',
  'documents.read',
  'audit.read',
  'cases.read',
  'cases.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  'super-admin': PERMISSIONS,
  'manager-admin': [
    'users.read',
    'tickets.read',
    'tickets.write',
    'finance.read',
    'wallet.read',
    'wallet.topup',
    'costs.read',
    'costs.write',
    'elections.read',
    'elections.vote',
    'reports.read',
    'documents.read',
    'audit.read',
    'cases.read',
    'cases.write',
  ],
  'staff-admin': [
    'users.read',
    'users.write',
    'tickets.read',
    'tickets.write',
    'wallet.read',
    'wallet.write',
    'wallet.topup',
    'costs.read',
    'elections.read',
    'reports.read',
    'documents.read',
    'audit.read',
    'cases.read',
    'cases.write',
  ],
  'lead-admin': [
    'tickets.read',
    'tickets.write',
    'elections.read',
    'elections.vote',
    'reports.read',
    'documents.read',
    'audit.read',
    'cases.read',
    'cases.write',
  ],
  lawyer: ['tickets.read', 'tickets.write', 'wallet.read', 'wallet.topup', 'documents.read', 'cases.read', 'cases.write', 'elections.read', 'elections.vote'],
  consumer: ['tickets.read', 'tickets.write', 'wallet.read', 'wallet.topup', 'documents.read', 'cases.read', 'elections.read', 'elections.vote'],
  representative: ['tickets.read', 'tickets.write', 'documents.read', 'cases.read', 'elections.read', 'elections.vote'],
  investor: ['reports.read'],
  company: ['tickets.read', 'tickets.write', 'wallet.read', 'wallet.topup', 'documents.read', 'cases.read'],
};

/**
 * Court tier hierarchy used by intake flows + pricing. Lives in shared so
 * the per-tier required-field overrides below can be type-checked on both
 * the frontend (intake-flows.ts uses the same union under the
 * `requiredByCourtTier` field flag) and the API (validateFlowPayload).
 */
export const COURT_TIERS = ['lower', 'high', 'special', 'shariat', 'supreme', 'fcc'] as const;
export type CourtTier = (typeof COURT_TIERS)[number];

/**
 * Map a payload's `select_court_type` string to a canonical {@link CourtTier}.
 * Returns null for unknown values so callers default to "no tier override".
 * Kept in shared so the API validator and the frontend wizard agree on the
 * mapping.
 */
export function courtTierFromCourtType(courtType?: string | null): CourtTier | null {
  if (!courtType) return null;
  const t = courtType.toLowerCase();
  if (t.includes('federal constitutional')) return 'fcc';
  if (t.includes('supreme')) return 'supreme';
  if (t.includes('shariat')) return 'shariat';
  if (t.includes('special')) return 'special';
  if (t.includes('high')) return 'high';
  if (t.includes('lower') || t.includes('district') || t.includes('sessions') || t.includes('civil') || t.includes('magisterial') || t.includes('family')) return 'lower';
  return null;
}

/**
 * Centralised payload field aliases — the API normalises incoming intake
 * payloads by treating each key + its aliases as the same field. Lives in
 * shared so frontend and API stay in lock-step.
 */
export const PAYLOAD_FIELD_ALIASES: Record<string, readonly string[]> = {
  province: ['province_capital'],
  district_id: ['select_district', 'district_name'],
  station_id: ['police_station'],
  city: ['select_city', 'select_court_city'],
  case_date: ['fir_date', 'date'],
  case_title: ['title', 'title_party_a'],
  delivery_mode: ['mode_of_delivery'],
  sets: ['no_of_sets'],
  set_type: ['setType'],
  notes: ['note'],
  // Frontend sends case_no / year; API required list uses the legacy names
  case_petition_no: ['case_no'],
  case_year: ['year'],
};

/**
 * Per-flow + per-court-tier required-field overrides.
 *
 * The API's `REQUIRED_FIELDS_BY_FLOW` lists the canonical fields that are
 * required *unconditionally* for a flow. Some flows have per-court-tier
 * exceptions ("red cross" fields in the QA matrix — optional for some tiers,
 * required for others). Those exceptions live here so the wizard's
 * `requiredByCourtTier` flags and the API's `validateFlowPayload` stay in
 * lock-step. Drift between the two manifests as "validation passes on the
 * page but fails at submit" (QA B6 / B7).
 *
 * Each entry lists fields to DROP from the base required list when the
 * payload's court tier matches. Add overrides per-tier as needed.
 */
export const REQUIRED_FIELDS_OPTIONAL_BY_TIER: Record<string, Partial<Record<CourtTier, string[]>>> = {
  judicial_case_files: {
    // QA PDF #23-#27 + B6/B7: per-tier optional fields (red ✗ in the matrix).
    // 2026-05-23 B1: judge_name added to base; drop it for all non-lower tiers.
    // 5-24-26 #22: case_title is optional at High Court (wizard high:false) — it
    // was missing from the high drop list, so high-court submits errored on
    // case_title despite the FE marking it optional. Added here to restore
    // lock-step.
    lower:   ['case_petition_no', 'case_year', 'case_type'],
    high:    ['case_year', 'case_type', 'case_title', 'judge_name'],
    special: ['case_petition_no', 'judge_name'],
    shariat: ['case_year', 'case_type', 'judge_name'],
    supreme: ['case_year', 'case_type', 'case_title', 'judge_name'],
    fcc:     ['case_year', 'case_type', 'case_title', 'judge_name'],
  },
  judicial_case_information: {
    // 5-24-26 #2/#3: Case Information now mirrors Case Files (case type +
    // status + full date set). Keep these per-tier drops identical to
    // judicial_case_files so the FE `requiredByCourtTier` (copied from Case
    // Files) and the API validator stay in lock-step.
    lower:   ['case_petition_no', 'case_year', 'case_type'],
    high:    ['case_year', 'case_type', 'case_title', 'judge_name'],
    special: ['case_petition_no', 'judge_name'],
    shariat: ['case_year', 'case_type', 'judge_name'],
    supreme: ['case_year', 'case_type', 'case_title', 'judge_name'],
    fcc:     ['case_year', 'case_type', 'case_title', 'judge_name'],
  },
  judicial_power_of_attorney: {
    lower:   ['case_petition_no', 'case_year', 'case_type'],
    high:    ['case_year', 'case_type'],
    special: ['case_petition_no'],
    shariat: ['case_year', 'case_type'],
    supreme: ['case_year', 'case_type'],
    fcc:     ['case_year', 'case_type'],
  },
  judicial_case_filing: {
    // 5-24-26 #16: Lower Court never requires case number/year (the case is
    // being filed now, so neither exists yet). Lock-step with the wizard's
    // requiredByCourtTier on the Case Filing year field.
    lower: ['case_petition_no', 'case_year'],
  },
  judicial_case_search: {
    // Search is a lookup — the consumer typically doesn't have the case
    // number or year (that's why they're searching). All but city/method
    // are optional regardless of tier.
    lower:   ['case_petition_no', 'case_year', 'case_type', 'case_title'],
    high:    ['case_petition_no', 'case_year', 'case_type', 'case_title'],
    special: ['case_petition_no', 'case_year', 'case_type', 'case_title'],
    shariat: ['case_petition_no', 'case_year', 'case_type', 'case_title'],
    supreme: ['case_petition_no', 'case_year', 'case_type', 'case_title'],
    fcc:     ['case_petition_no', 'case_year', 'case_type', 'case_title'],
  },
};

/**
 * Resolve the effective required canonical field list for `flow` given the
 * payload's court tier. Subtracts {@link REQUIRED_FIELDS_OPTIONAL_BY_TIER}
 * entries from `base`. Pass `base` from the caller (the API owns the base
 * list; the frontend does not need to mirror it).
 */
export function requiredFieldsFor(
  flow: string,
  baseRequired: readonly string[],
  tier: CourtTier | null,
): string[] {
  if (!tier) return [...baseRequired];
  const drops = REQUIRED_FIELDS_OPTIONAL_BY_TIER[flow]?.[tier];
  if (!drops || drops.length === 0) return [...baseRequired];
  const dropSet = new Set(drops);
  return baseRequired.filter((f) => !dropSet.has(f));
}

// ─────────────────────────────────────────────────────────────────────
// Intake flow keys, recommendations, and slug mapping (cases workflow)
// ─────────────────────────────────────────────────────────────────────

export const INTAKE_FLOW_KEYS = [
  'judicial_case_files',
  'judicial_case_information',
  'judicial_case_search',
  'judicial_case_filing',
  'judicial_power_of_attorney',
  'non_judicial_copy_of_fir',
  'non_judicial_registry_deed',
  'non_judicial_criminal_record_search',
] as const;

export type FlowKey = (typeof INTAKE_FLOW_KEYS)[number];

export function isFlowKey(value: string): value is FlowKey {
  return (INTAKE_FLOW_KEYS as readonly string[]).includes(value);
}

/** All names a single canonical field is known by (canonical first). */
export function aliasesFor(canonical: string): string[] {
  const aliases = PAYLOAD_FIELD_ALIASES[canonical];
  return aliases ? [canonical, ...aliases] : [canonical];
}

/** First defined value across canonical + alias keys, or undefined. */
export function readAliased<T>(
  source: Record<string, T | undefined> | undefined,
  canonical: string,
): T | undefined {
  if (!source) return undefined;
  for (const key of aliasesFor(canonical)) {
    const v = source[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export type RecommendationRule = {
  next: FlowKey;
  priority: 1 | 2 | 3;
  reason?: string;
};

export const RECOMMENDATIONS_BY_FLOW: Record<FlowKey, RecommendationRule[]> = {
  judicial_case_search: [
    { next: 'judicial_case_information', priority: 1, reason: 'Case located — order case information next.' },
    { next: 'judicial_case_files',       priority: 2, reason: 'Order certified file copies.' },
  ],
  judicial_case_information: [
    { next: 'judicial_case_files',        priority: 1, reason: 'Order full file copies.' },
    { next: 'judicial_power_of_attorney', priority: 3, reason: 'Authorize representation if proceeding to filing.' },
  ],
  judicial_case_files: [
    { next: 'judicial_power_of_attorney', priority: 2 },
    { next: 'judicial_case_filing',       priority: 3 },
  ],
  judicial_power_of_attorney: [
    { next: 'judicial_case_filing', priority: 1, reason: 'PoA in place — proceed to filing.' },
  ],
  judicial_case_filing: [],
  non_judicial_copy_of_fir: [],
  non_judicial_registry_deed: [],
  non_judicial_criminal_record_search: [],
};

/**
 * Pure recommendation filter (Option D — see cases workflow design doc).
 */
export function recommendationsForCase(args: {
  triggerFlows: FlowKey[];
  blockingFlows: FlowKey[];
}): RecommendationRule[] {
  const blocked = new Set<FlowKey>(args.blockingFlows);
  const candidates = new Map<FlowKey, RecommendationRule>();

  for (const trigger of args.triggerFlows) {
    for (const rule of RECOMMENDATIONS_BY_FLOW[trigger] ?? []) {
      if (blocked.has(rule.next)) continue;
      const existing = candidates.get(rule.next);
      if (!existing || rule.priority < existing.priority) {
        candidates.set(rule.next, rule);
      }
    }
  }

  return [...candidates.values()].sort((a, b) => a.priority - b.priority);
}

const FLOW_KEY_TO_SLUG: Record<FlowKey, string> = {
  judicial_case_files: 'case-files',
  judicial_case_information: 'case-information',
  judicial_case_search: 'case-search',
  judicial_case_filing: 'case-filing',
  judicial_power_of_attorney: 'power-of-attorney',
  non_judicial_copy_of_fir: 'copy-of-fir',
  non_judicial_registry_deed: 'registry-deed',
  non_judicial_criminal_record_search: 'criminal-record-search',
};

const SLUG_TO_FLOW_KEY: Record<'judicial' | 'non_judicial', Record<string, FlowKey>> = {
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

export function flowKeyToSlug(key: FlowKey): string {
  return FLOW_KEY_TO_SLUG[key];
}

export function slugToFlowKey(
  slug: string,
  category: 'judicial' | 'non_judicial',
): FlowKey | null {
  return SLUG_TO_FLOW_KEY[category][slug] ?? null;
}

/**
 * Human-readable labels for each flow. Use for UI surfaces — suggestion
 * cards, completion toasts, dashboards, audit trails.
 */
export const FLOW_LABELS: Record<FlowKey, string> = {
  judicial_case_files: 'Order Case Files',
  judicial_case_information: 'Order Case Information',
  judicial_case_search: 'Search for a Case',
  judicial_case_filing: 'File a New Case',
  judicial_power_of_attorney: 'Power of Attorney',
  non_judicial_copy_of_fir: 'Copy of FIR',
  non_judicial_registry_deed: 'Registry / Deed',
  non_judicial_criminal_record_search: 'Search Criminal Record by CNIC by Police Station',
};

export const NOTIFICATION_TYPES = {
  TICKET_CREATED: 'ticket.created',
  TICKET_STATUS_CHANGED: 'ticket.status_changed',
  TICKET_COMPLETED: 'ticket.completed',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_REASSIGNED: 'ticket.reassigned',
  TICKET_ASSIGNMENT_ACCEPTED: 'ticket.assignment_accepted',
  TICKET_ASSIGNMENT_REJECTED: 'ticket.assignment_rejected',
  TICKET_CLERK_COSTS_SUBMITTED: 'ticket.clerk_costs_submitted',
  TICKET_CLERK_RECEIPT_SUBMITTED: 'ticket.clerk_receipt_submitted',
  TICKET_CLERK_RECEIPT_VERIFIED: 'ticket.clerk_receipt_verified',
  TICKET_CLERK_RECEIPT_REJECTED: 'ticket.clerk_receipt_rejected',
  TICKET_DOCUMENT_UPLOADED: 'ticket.document_uploaded',
  TICKET_REGENERATED: 'ticket.regenerated',
  PAYMENT_COMPLETED: 'payment.completed',
  WALLET_TOPUP_CREATED: 'wallet.topup_created',
  WALLET_TOPUP_VERIFIED: 'wallet.topup_verified',
  WALLET_TOPUP_REJECTED: 'wallet.topup_rejected',
  WALLET_RECEIPT_UPLOADED: 'wallet.receipt_uploaded',
  PAYMENT_SUBMITTED: 'payment.submitted',
  PAYMENT_APPROVED: 'payment.approved',
  PAYMENT_REJECTED: 'payment.rejected',
  PAYMENT_REMAINDER_DUE: 'payment.remainder_due',
  CASE_CREATED: 'case.created',
  CASE_STATUS_CHANGED: 'case.status_changed',
  CASE_DRIFT_DETECTED: 'case.drift_detected',
  AUTH_PASSWORD_CHANGED: 'auth.password_changed',
  AUTH_IMPERSONATION_STARTED: 'auth.impersonation_started',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

// ── Payment model per intake flow (Spec 2, 2026-05-23) ──────────────
export type PaymentModel = 'SPLIT' | 'ONE_TIME';

// SPLIT = the four PHYSICAL-document services. Each is billed in two parts: an
// initial (base) charge at intake, then a clerk-finalized remainder (printing /
// attestation / delivery) after the work is done — delivery is part of that
// second payment because these services hand the consumer a physical document
// on completion. The four DIGITAL judicial flows (Case Information, Case Search,
// Case Filing, Power of Attorney) are a single one-time payment with no delivery
// leg (owner spec, 2026-06).
export const PAYMENT_MODEL_BY_FLOW: Record<string, PaymentModel> = {
  judicial_case_files: 'SPLIT',
  non_judicial_copy_of_fir: 'SPLIT',
  non_judicial_criminal_record_search: 'SPLIT',
  non_judicial_registry_deed: 'SPLIT',
  judicial_case_information: 'ONE_TIME',
  judicial_case_search: 'ONE_TIME',
  judicial_case_filing: 'ONE_TIME',
  judicial_power_of_attorney: 'ONE_TIME',
};

export function paymentModelFor(flow?: string | null): PaymentModel {
  if (!flow) return 'ONE_TIME';
  return PAYMENT_MODEL_BY_FLOW[flow] ?? 'ONE_TIME';
}

// Which phase-2 charges each flow exposes in the clerk charge window (§4a).
export interface ServiceChargeCapabilities {
  attestation: boolean; // attested / non-attested
  printing: boolean;    // printing / copying
  delivery: boolean;
  pdf: boolean;
}

// Clerk phase-2 charges apply to the four PHYSICAL-document services. Only Case
// Files adds attestation; the three non-judicial copies carry printing /
// delivery / pdf but not attestation. The four DIGITAL judicial flows fall
// through to NO_CHARGES — no clerk-added charges and, crucially, no delivery
// leg (delivery is gated on `delivery` capability in the pricing resolver).
export const SERVICE_CHARGE_CAPABILITIES: Record<string, ServiceChargeCapabilities> = {
  judicial_case_files: { attestation: true, printing: true, delivery: true, pdf: true },
  non_judicial_copy_of_fir: { attestation: false, printing: true, delivery: true, pdf: true },
  non_judicial_registry_deed: { attestation: false, printing: true, delivery: true, pdf: true },
  non_judicial_criminal_record_search: { attestation: false, printing: true, delivery: true, pdf: true },
};

const NO_CHARGES: ServiceChargeCapabilities = { attestation: false, printing: false, delivery: false, pdf: false };

export function chargeCapabilitiesFor(flow?: string | null): ServiceChargeCapabilities {
  if (!flow) return NO_CHARGES;
  return SERVICE_CHARGE_CAPABILITIES[flow] ?? NO_CHARGES;
}

// Canonical render order for ticket case-details (Spec 3). Keys not listed are
// appended after, alphabetically. Resolved through PAYLOAD_FIELD_ALIASES so
// aliased keys land in the right slot.
export const CASE_DETAILS_ORDER: string[] = [
  'select_court_city', 'city', 'serviceCity',
  'select_court', 'select_court_type', 'bench',
  'select_service',
  'case_type', 'case_type_other',
  'case_petition_no',
  'case_year',
  'case_title',
  'judge_designation', 'judge_name',
  'case_date', 'future_date', 'scheduledDate',
];

export function orderCaseDetailKeys(keys: string[]): string[] {
  const rank = new Map(CASE_DETAILS_ORDER.map((k, i) => [k, i]));
  // Resolve aliases (e.g. case_no → case_petition_no) so aliased input keys
  // rank into their canonical slot. Returns the ORIGINAL keys.
  const aliasToCanonical = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(PAYLOAD_FIELD_ALIASES)) {
    for (const a of aliases) aliasToCanonical.set(a, canonical);
  }
  const canon = (k: string) => aliasToCanonical.get(k) ?? k;
  const known = keys
    .filter((k) => rank.has(canon(k)))
    .sort((a, b) => rank.get(canon(a))! - rank.get(canon(b))!);
  const unknown = keys
    .filter((k) => !rank.has(canon(k)))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...unknown];
}

// ─────────────────────────────────────────────
// Pricing input — single source of truth
// ─────────────────────────────────────────────
//
// Maps an intake payload to the pricing resolver's inputs. Consumed by BOTH
// the wizard's live checkout preview (apps/web) and the server's
// createIntakeTicket (apps/api) so the QUOTED price and the PERSISTED charge
// can never drift.
//
// Root cause this fixes (2026-06): createIntakeTicket built its resolve input
// by hand and had silently fallen behind the wizard — it omitted yearBand
// (→ Pending Case Files charged on the `current` band: Rs 3,300 quote vs
// Rs 7,300 charge), caseTitle (State-vs surcharge not charged), cityCount +
// searchMethod (multi-city / both-method Case Search undercharged) and
// deliveryMethod. One builder used by both sides removes the whole class.

/**
 * Canonical pricing year-band keys understood by the resolver. Keep the
 * historical-band breakpoints in sync with the `YEAR_BAND_RANGES` seeded in
 * apps/api/scripts/seed-pricing.ts.
 */
export type YearBand =
  | 'pending'
  | 'current'
  | 'y2025'
  | 'y2024_2023'
  | 'y2022_2020'
  | 'y2019_2017'
  | 'y2016_back';

/** A case is "pending" (no decided year) when its status reads Pending. */
export function isPendingCaseStatus(caseStatus?: string | null): boolean {
  return typeof caseStatus === 'string' && /pending/i.test(caseStatus);
}

/**
 * Derive the pricing {@link YearBand} from case status + year.
 *
 * Pending cases short-circuit to `pending` BEFORE any year logic — they have
 * no decided year, so a stray filing-year must not bucket them into a
 * historical band. The resolver's seed only carries a `pending` rule for Case
 * Files; every other flow falls back to `current`, so returning `pending`
 * here is safe for all flows.
 *
 * This is the ONLY band-derivation implementation. The API resolver and the
 * web wizard both route through it (the wizard's `computeYearBand` delegates
 * here) so the band can't be computed two different ways.
 */
export function deriveYearBand(
  caseStatus: string | undefined,
  caseYear: number | undefined,
  currentYear: number = new Date().getFullYear(),
): YearBand {
  if (isPendingCaseStatus(caseStatus)) return 'pending';
  if (!caseYear || Number.isNaN(caseYear)) return 'current';
  if (caseYear >= currentYear) return 'current';
  if (caseYear === 2025) return 'y2025';
  if (caseYear >= 2023 && caseYear <= 2024) return 'y2024_2023';
  if (caseYear >= 2020 && caseYear <= 2022) return 'y2022_2020';
  if (caseYear >= 2017 && caseYear <= 2019) return 'y2019_2017';
  if (caseYear <= 2016) return 'y2016_back';
  return 'current';
}

/**
 * Parse the `cities` payload value (JSON-array string, real array, or a legacy
 * single id) into a list of GeoCity ids. Used to count cities for the Case
 * Search multi-city multiplier.
 */
export function parsePayloadCities(value: unknown): string[] {
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
        return parsed.filter(
          (v): v is string => typeof v === 'string' && Boolean(v),
        );
      }
    } catch {
      // fall through to single-id fallback
    }
  }
  return [trimmed];
}

/** Resolver input shape produced by {@link buildPricingResolveInput}. */
export interface PricingResolveInput {
  flow: string;
  courtLevel?: string;
  caseStatus?: string;
  caseYear?: number;
  yearBand: YearBand;
  setType?: string;
  attestedQty: number;
  nonAttestedQty: number;
  wantPdf: boolean;
  deliveryMethod?: string;
  province?: string;
  cityId?: string;
  city?: string;
  caseTitle?: string;
  cityCount: number;
  searchMethod?: string;
  docBundle?: string;
}

/**
 * Build the full pricing-resolver input from a raw intake payload. The single
 * source both the wizard preview and createIntakeTicket call, so the quote and
 * the charge are computed from identical inputs.
 */
export function buildPricingResolveInput(
  flow: string,
  payload: Record<string, string | undefined> | undefined | null,
): PricingResolveInput {
  const p = payload ?? {};

  const caseStatus = p.case_status || undefined;
  // Decided cases price on the decided_date year; pending/unknown on
  // case_year/year. Prefer decided_date directly so the live preview is
  // correct even before the wizard syncs payload.year.
  const decidedYear = (() => {
    const m = /^(\d{4})/.exec(p.decided_date ?? '');
    return m && m[1] ? parseInt(m[1], 10) || undefined : undefined;
  })();
  const rawYear = p.case_year ?? p.year;
  const caseYear =
    decidedYear ?? (rawYear ? parseInt(rawYear, 10) || undefined : undefined);

  const setType = p.set_type || undefined;
  let attestedQty = 0;
  let nonAttestedQty = 0;
  if (setType === 'attested') {
    attestedQty = parseInt(p.attested_qty ?? '0', 10) || 0;
  } else if (setType === 'non_attested') {
    nonAttestedQty = parseInt(p.non_attested_qty ?? '0', 10) || 0;
  } else if (setType === 'both') {
    attestedQty = parseInt(p.both_attested_qty ?? '0', 10) || 0;
    nonAttestedQty = parseInt(p.both_non_attested_qty ?? '0', 10) || 0;
  }

  const isCaseSearch = flow === 'judicial_case_search';
  const cityCount = isCaseSearch
    ? Math.max(1, parsePayloadCities(p.cities).length)
    : 1;

  const deliveryMethod =
    (p.delivery_mode || p.delivery_method || '').toLowerCase() || undefined;

  return {
    flow,
    courtLevel: p.select_court_type || undefined,
    caseStatus,
    caseYear,
    yearBand: deriveYearBand(caseStatus, caseYear),
    setType,
    attestedQty,
    nonAttestedQty,
    wantPdf: p.want_pdf_before_dispatch === 'Yes',
    deliveryMethod,
    province: p.province ?? p.province_capital ?? undefined,
    cityId: p.city_id || undefined,
    city: p.select_court_city ?? p.city ?? p.select_city ?? undefined,
    caseTitle: p.case_title || undefined,
    cityCount,
    searchMethod: isCaseSearch ? p.search_method || undefined : undefined,
    docBundle: p.required_documentations || undefined,
  };
}

// ─────────────────────────────────────────────
// Case Information document-bundle add-on (region-keyed)
// ─────────────────────────────────────────────
//
// 2026 owner rate sheet. Case Information prices each document bundle as an
// add-on on top of the seeded regional base fee. Single source shared by the
// API resolver (pricing.service.ts re-exports it) and the wizard's bundle
// picker, so the price shown next to each option and the price charged at
// checkout can't diverge. Keyed by the canonical DocBundle value stored in
// payload.required_documentations.
export const CASE_INFO_BUNDLE_SURCHARGE: Record<
  'Punjab' | 'other',
  Record<string, number>
> = {
  Punjab: {
    doc_only_petition: 500,
    doc_petition_plus_last_order: 700,
    doc_petition_plus_complete_order: 800,
    doc_only_last_order: 750,
    doc_only_complete_order_sheet: 1500,
  },
  other: {
    doc_only_petition: 750,
    doc_petition_plus_last_order: 1500,
    doc_petition_plus_complete_order: 1500,
    doc_only_last_order: 750,
    doc_only_complete_order_sheet: 1200,
  },
};

/** Resolve the Case Information bundle add-on for a region + bundle. */
export function caseInfoBundleSurcharge(
  flow: string,
  region: string | undefined,
  docBundle: string | undefined,
): number {
  if (flow !== 'judicial_case_information' || !docBundle) return 0;
  const table =
    region === 'Punjab'
      ? CASE_INFO_BUNDLE_SURCHARGE.Punjab
      : CASE_INFO_BUNDLE_SURCHARGE.other;
  return table[docBundle] ?? 0;
}

// ─────────────────────────────────────────────
// Ticket document labels
// ─────────────────────────────────────────────
//
// Consumer-facing label for a ticket document's *kind* (the "sort" of
// document). The DB `category` enum is WORK_DOCUMENT | DELIVERABLE_PDF. The
// stored `type` is the file MIME type (not a human label), so UIs must use this
// for the document heading instead of `type`.
export function documentCategoryLabel(category?: string | null): string {
  switch (category) {
    case 'DELIVERABLE_PDF':
      return 'Final document';
    case 'WORK_DOCUMENT':
      return 'Supporting document';
    default:
      return 'Document';
  }
}
