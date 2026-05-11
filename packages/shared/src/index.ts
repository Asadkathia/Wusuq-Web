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
  'PENDING',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_APPROVAL',
  'COMPLETED',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

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
  non_judicial_criminal_record_search: 'Search Criminal Record',
};
