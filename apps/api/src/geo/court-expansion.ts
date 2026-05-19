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
 * Every Lower Court city in the JSON gets these four standard sub-courts.
 * This mirrors Pakistan's District Judiciary structure.
 */
export const LOWER_COURT_SUBCOURTS: SubCourt[] = [
  { name: 'Sessions Court' },
  { name: 'Civil Court' },
  { name: 'Magisterial Court' },
  { name: 'Family Court' },
];

/**
 * Baseline specialized special courts that operate in every divisional /
 * district HQ in Pakistan. Applied to every city that pakistan-courts.json
 * lists under "Special Court" — even if the city-specific list in
 * SPECIAL_COURT_SUBCOURTS doesn't cover it.
 *
 * 5-19-26 CF#1a: before this, cities like Abbottabad / Sialkot / Hyderabad /
 * Sukkur / Mardan / Muzaffarabad only saw the generic "Special Court"
 * placeholder. These five tribunals are district-level by statute and exist
 * across the country — Accountability Court (NAB), Anti-Terrorism Court (ATC,
 * 1997 Act), Labour Court (Industrial Relations Acts), Drug Court (Drugs
 * Act), Consumer Court (Consumer Protection Acts).
 *
 * Cities that already get specialized SPECIAL_COURT_SUBCOURTS coverage
 * (Lahore, Karachi, etc.) will get these via that map too — the seeder
 * de-dupes on (courtId, cityId).
 */
export const BASELINE_SPECIAL_COURTS: string[] = [
  'Accountability Court',
  'Anti-Terrorism Court',
  'Labour Court',
  'Drug Court',
  'Consumer Court',
];

/**
 * Special Courts and tribunals do NOT exist in every city the way Lower Courts
 * do. This map lists the cities where each specialized court/tribunal is
 * seated. We seed a CourtSeat only when the JSON also has "Special Court"
 * coverage for that city, so the JSON remains authoritative on overall
 * presence while this map adds granularity.
 */
export const SPECIAL_COURT_SUBCOURTS: Record<string, string[]> = {
  'Accountability Court': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Peshawar',
    'Quetta',
    'Rawalpindi',
  ],
  'Anti-Corruption Court': [
    'Lahore',
    'Karachi',
    'Peshawar',
    'Quetta',
    'Rawalpindi',
  ],
  'Anti-Terrorism Court': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Peshawar',
    'Quetta',
    'Rawalpindi',
    'Faisalabad',
  ],
  'Anti-Dumping Appellate Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Appellate Tribunal Inland Revenue': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Peshawar',
    'Quetta',
  ],
  'Banking Court': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Rawalpindi',
    'Faisalabad',
    'Multan',
  ],
  'Banking Muhtasib': ['Karachi', 'Lahore', 'Islamabad'],
  'Board of Revenue': ['Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Child Protection Court': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi'],
  'Commercial Court': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Rawalpindi',
    'Faisalabad',
  ],
  'Competition Appellate Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Consumer Court': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Peshawar',
    'Quetta',
    'Rawalpindi',
    'Faisalabad',
  ],
  'Customs Appellate Tribunal': [
    'Karachi',
    'Lahore',
    'Islamabad',
    'Peshawar',
    'Quetta',
  ],
  'Drug Court': ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Peshawar'],
  'Environmental Protection Tribunal': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Peshawar',
    'Quetta',
  ],
  'Election Tribunal': ['Lahore', 'Karachi', 'Islamabad', 'Peshawar', 'Quetta'],
  'Federal Insurance Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Federal Ombudsman': ['Islamabad', 'Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Federal Service Tribunal': ['Islamabad'],
  'Federal Tax Ombudsman': ['Islamabad', 'Lahore', 'Karachi'],
  'Foreign Exchange Regulation Appellate Board': [
    'Islamabad',
    'Karachi',
    'Lahore',
  ],
  'Income Tax Appellate Tribunal': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Rawalpindi',
    'Faisalabad',
    'Multan',
    'Peshawar',
  ],
  'Insurance Appellate Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Intellectual Property Tribunal': ['Islamabad', 'Karachi', 'Lahore'],
  'Labour Appellate Tribunal': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Rawalpindi',
    'Faisalabad',
    'Peshawar',
  ],
  'Labour Court': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Rawalpindi',
    'Faisalabad',
    'Multan',
    'Peshawar',
    'Quetta',
  ],
  'Lahore Development Authority Tribunal': ['Lahore'],
  'National Industrial Relations Commission (NIRC)': [
    'Islamabad',
    'Karachi',
    'Lahore',
  ],
  'Pakistan Maritime Carriage Appellate Tribunal': ['Karachi'],
  'Provincial Ombudsman': ['Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Provincial Service Tribunal': ['Lahore', 'Karachi', 'Peshawar', 'Quetta'],
  'Special Court (Central)': ['Islamabad', 'Karachi', 'Lahore'],
  'Special Court (Control of Narcotic Substances)': [
    'Lahore',
    'Karachi',
    'Islamabad',
    'Peshawar',
    'Quetta',
    'Rawalpindi',
  ],
  'Special Court (Customs, Taxation & Anti-Smuggling)': [
    'Karachi',
    'Lahore',
    'Islamabad',
  ],
  'Special Court (Offences in Banks)': [
    'Karachi',
    'Lahore',
    'Islamabad',
    'Rawalpindi',
  ],
  'Special Court (Removal of Encroachment)': ['Lahore', 'Karachi', 'Islamabad'],
};
