/**
 * Expansion maps for court types whose JSON entry is a single generic label
 * but which historically operate as multiple sub-courts ("services" in the UX
 * terminology: the user picks a Court tier, then a Service within it).
 *
 * The seeder walks pakistan-courts.json and, for each (type, city) pair,
 * looks up the expansion to decide which concrete sub-court rows to create.
 */

export type SubCourt = { name: string };

/**
 * Canonical, complete special-court catalogue (single source of truth).
 *
 * This is the full set of special-court *names*. Every district that has
 * special courts exposes this exact list. 2026-05-25: special courts are seated
 * at the DISTRICT level — one seat city per district in SPECIAL_COURT_DISTRICTS
 * (court-alias.ts) — not on every city. This catalogue replaced the old
 * per-city SPECIAL_COURT_SUBCOURTS subset map and the 5-court
 * BASELINE_SPECIAL_COURTS fallback. Naming is singular to match court-alias.ts.
 * Both the geo seeder and the services catalogue import this.
 */
export const SPECIAL_COURTS: string[] = [
  'Accountability Court',
  'Anti-Corruption Court',
  'Anti-Terrorism Court',
  'Anti-Dumping Appellate Tribunal',
  'Appellate Tribunal Inland Revenue',
  'Banking Court',
  'Banking Muhtasib',
  'Board of Revenue',
  'Child Protection Court',
  'Commercial Court',
  'Competition Appellate Tribunal',
  'Consumer Court',
  'Customs Appellate Tribunal',
  'Drug Court',
  'Environmental Protection Tribunal',
  'Election Tribunal',
  'Federal Insurance Tribunal',
  'Federal Ombudsman',
  'Federal Service Tribunal',
  'Federal Tax Ombudsman',
  'Foreign Exchange Regulation Appellate Board',
  'Income Tax Appellate Tribunal',
  'Insurance Appellate Tribunal',
  'Intellectual Property Tribunal',
  'Labour Appellate Tribunal',
  'Labour Court',
  'Lahore Development Authority Tribunal',
  'National Industrial Relations Commission (NIRC)',
  'Pakistan Maritime Carriage Appellate Tribunal',
  'Provincial Ombudsman',
  'Provincial Service Tribunal',
  'Special Court (Central)',
  'Special Court (Control of Narcotic Substances)',
  'Special Court (Customs, Taxation & Anti-Smuggling)',
  'Special Court (Offences in Banks)',
  'Special Court (Removal of Encroachment)',
];

/**
 * Every Lower Court city in the JSON gets these four standard sub-courts.
 * This mirrors Pakistan's District Judiciary structure.
 */
export const LOWER_COURT_SUBCOURTS: SubCourt[] = [
  { name: 'Sessions Court' },
  { name: 'Civil Court' },
  { name: 'Magisterial Court' },
  { name: 'Family Court' },
];
