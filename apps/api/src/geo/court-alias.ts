/**
 * Single source of truth for the JSON-to-geo-tree alias maps used when
 * seeding courts from `pakistan-courts.json`.
 *
 * Both the standalone `scripts/seed-geo.ts` (full re-seed) and the runtime
 * `GeoService.seedCourtsFromJson` (admin /geo/seed and /geo/reset-seed
 * endpoints) MUST import these maps so every seeding path produces the
 * same set of CourtSeat rows.
 *
 * If you add a new alias here, no other file needs touching.
 */

// JSON province labels -> canonical names used by pakistan-seed.ts.
export const PROVINCE_ALIAS: Record<string, string> = {
  AJK: 'Azad Jammu & Kashmir',
  Balochistan: 'Balochistan',
  Federal: 'Islamabad Capital Territory',
  'Gilgit-Baltistan': 'Gilgit-Baltistan',
  KPK: 'Khyber Pakhtunkhwa',
  Punjab: 'Punjab',
  Sindh: 'Sindh',
};

// JSON city names -> the city name as it actually exists in pakistan-seed.ts.
// Keep this list flat (one entry per JSON city) and de-duplicated; duplicate
// keys silently shadow each other and break TS in strict mode.
export const CITY_ALIAS: Record<string, string> = {
  'Shaheed Benazir Abad': 'Nawabshah',
  'Tando Muhammad Khan': 'Tando Mohammad Khan',
  'Qambar-Shahdadkot': 'Kambar',
  Swat: 'Mingora',
  // 5-24-26 #21: Babuzai and Mingora are SEPARATE tehsils in the Swat geo tree
  // (both exist as GeoCities), and each has its own Lower Court row in the
  // courts JSON. This alias previously redirected Babuzai's Lower Court to
  // Mingora, leaving the Babuzai GeoCity with no lower court — so it surfaced
  // as "special courts only". Map it to its own bare geo name instead. (`Swat`
  // above stays → Mingora: that alias only seats the district's special courts
  // at the Swat HQ, Mingora.)
  'Babuzai (Swat)': 'Babuzai',
  Buner: 'Daggar',
  'Daggar (Buner)': 'Daggar',
  Batagram: 'Batagram',
  'Batagram (Banna)': 'Batagram',
  Malakand: 'Sam Ranizai',
  'Samarbagh (Barwa)': 'Samarbagh',
  'Lower Dir': 'Temergara',
  'Upper Dir': 'Dir',
  'Daulatpur (Qazi Ahmed)': 'Daulatpur',
  'Khangarh (Khanpur)': 'Khangarh',
  'garhi dopatta (Garhi Dopatta)': 'garhi dopatta',
  Tharparkar: 'Mithi',
  Lasbela: 'Uthal',
  Jafarabad: 'Dera Murad Jamali',
  Nasirabad: 'Dera Murad Jamali',
  'Sonmiani (Winder)': 'Sonmiani',
  Kachi: 'Dhadar',
  Kech: 'Turbat',
  Diamir: 'Chilas',
  Ghanche: 'Khaplu',
  Ghizer: 'Punial',
  Hunza: 'Aliabad',
  Khushab: 'Khushab/Joharabad',
  'Jhelum Valley': 'Hattian Bala',
  Neelum: 'Sharda',
  Poonch: 'Rawalakot',
  Sudhnoti: 'Pallandari',
  'Fateh Pur Thakiala (Nakial)': 'Fateh Pur Thakiala',
  'Patehka (Nasirabad)': 'Patehka',
  'Gupis-Yasin': 'Gupis',
  'Lower Kohistan': 'Pattan',
  Shangla: 'Alpuri',
  Torghar: 'Tor Ghar',
  'Upper Kohistan': 'Dassu',
  // Punjab tehsils — court JSON appends "Town"/"Sharif"; sheet uses bare names.
  'Jaranwala Town': 'Jaranwala',
  'Sammundri Town': 'Sammundri',
  'Tandlianwala Town': 'Tandlianwala',
  'Sharaqpur Sharif': 'Sharaqpur',
};

// One-to-many fan-out: a single JSON city name should seat courts across
// multiple geo cities. Use for metros where the court JSON treats the whole
// city as a single seat but the geo tree splits it into multiple
// administrative sub-cities the consumer needs to pick between.
//
// When a JSON city matches a CITY_FANOUT key, seeders create one CourtSeat
// row per target sub-city (instead of consulting CITY_ALIAS).
//
// Currently empty — 5-19-26 CF#2 reverted the Karachi / Lahore fan-outs.
// The metro hub city (e.g. "Karachi", "Lahore") receives all courts via
// direct JSON entry; sub-tehsils receive only Lower Court via
// LOWER_COURT_ONLY_TEHSILS below.
export const CITY_FANOUT: Record<string, string[]> = {};

// Per 5-19-26 CF#2: tehsils of metro hubs ("Lahore Cantt" / "Lahore Model
// Town" under Lahore; "Karachi South" / "East" / "West" / "North" /
// "Central" under Karachi) should expose Lower Court only. The metro hub
// itself (Lahore / Karachi) keeps the full court set via its direct JSON
// entries.
//
// Seeders post-process this map: for each tehsil listed, seat the canonical
// Lower Court sub-courts (from LOWER_COURT_SUBCOURTS) on that GeoCity row.
// Sub-cities that already have a Lower Court entry in pakistan-courts.json
// (e.g. Lahore Cantt) are seated either way — this map covers the rest.
export const LOWER_COURT_ONLY_TEHSILS: Record<string, string[]> = {
  Lahore: ['Lahore Cantt', 'Lahore Model Town'],
  Karachi: [
    'Karachi South',
    'Karachi East',
    'Karachi West',
    'Karachi North',
    'Karachi Central',
  ],
};

// 2026-05-25: special courts sit at the DISTRICT level, not in every tehsil
// (see "Pakistan Court Wise" workbook). This is the canonical list of the
// districts where special courts are seated. Seeders attach the full
// SPECIAL_COURTS catalogue (court-expansion.ts) to one seat city per district
// — the tehsil matching the district name, falling back to CITY_ALIAS for the
// districts whose HQ tehsil has a different name (e.g. Swat → Mingora,
// Tharparkar → Mithi). This replaces the prior "seat on every GeoCity"
// behaviour. Names are kept exactly as they appear in the workbook and are
// resolved through resolveSpecialCourtSeatCityIds below.
//
// The workbook lists 149 special-court districts but omits Islamabad (it only
// appears in the High/Supreme/Constitutional columns). Islamabad is added here
// as a deliberate correction — the federal capital hosts the full set of
// special courts/tribunals — bringing the total to 150 seats.
export const SPECIAL_COURT_DISTRICTS: string[] = [
  // Punjab (42)
  'Bahawalnagar',
  'Bahawalpur',
  'Rahim Yar Khan',
  'Dera Ghazi Khan',
  'Layyah',
  'Taunsa Sharif',
  'Muzaffargarh',
  'Kot Addu',
  'Rajanpur',
  'Jampur',
  'Chiniot',
  'Faisalabad',
  'Jhang',
  'Toba Tek Singh',
  'Gujranwala',
  'Wazirabad',
  'Gujrat',
  'Hafizabad',
  'Mandi Bahauddin',
  'Narowal',
  'Sialkot',
  'Kasur',
  'Lahore',
  'Nankana Sahib',
  'Sheikhupura',
  'Khanewal',
  'Lodhran',
  'Multan',
  'Vehari',
  'Attock',
  'Chakwal',
  'Talagang',
  'Jhelum',
  'Rawalpindi',
  'Murree',
  'Okara',
  'Pakpattan',
  'Sahiwal',
  'Bhakkar',
  'Khushab',
  'Mianwali',
  'Sargodha',
  // Sindh (25)
  'Badin',
  'Sujawal',
  'Thatta',
  'Dadu',
  'Hyderabad',
  'Jamshoro',
  'Matiari',
  'Tando Allahyar',
  'Tando Muhammad Khan',
  'Karachi',
  'Malir',
  'Jacobabad',
  'Kashmore',
  'Larkana',
  'Qambar-Shahdadkot',
  'Shikarpur',
  'Mirpur Khas',
  'Sanghar',
  'Tharparkar',
  'Umerkot',
  'Ghotki',
  'Khairpur',
  'Sukkur',
  'Naushahro Feroze',
  'Shaheed Benazir Abad',
  // KPK (27) — note: the workbook tags Awaran (a Balochistan district) as KPK;
  // resolution is by name regardless of the province label.
  'Bannu',
  'Lakki Marwat',
  'Dera Ismail Khan',
  'Tank',
  'Abbottabad',
  'Batagram',
  'Haripur',
  'Lower Kohistan',
  'Mansehra',
  'Torghar',
  'Upper Kohistan',
  'Hangu',
  'Karak',
  'Kohat',
  'Buner',
  'Chitral',
  'Lower Dir',
  'Malakand',
  'Shangla',
  'Swat',
  'Upper Dir',
  'Mardan',
  'Swabi',
  'Charsadda',
  'Nowshera',
  'Peshawar',
  'Awaran',
  // Balochistan (31)
  'Kalat',
  'Kharan',
  'Khuzdar',
  'Lasbela',
  'Mastung',
  'Washuk',
  'Gwadar',
  'Kech',
  'Panjgur',
  'Jafarabad',
  'Jhal Magsi',
  'Kachi',
  'Lehri',
  'Nasirabad',
  'Sohbatpur',
  'Chagai',
  'Killa Abdullah',
  'Nushki',
  'Pishin',
  'Quetta',
  'Dera Bugti',
  'Harnai',
  'Kohlu',
  'Sibi',
  'Ziarat',
  'Barkhan',
  'Killa Saifullah',
  'Loralai',
  'Musakhel',
  'Sherani',
  'Zhob',
  // Azad Kashmir (10)
  'Kotli',
  'Mirpur',
  'Bhimber',
  'Jhelum Valley',
  'Muzaffarabad',
  'Neelum',
  'Bagh',
  'Haveli',
  'Poonch',
  'Sudhnoti',
  // Gilgit-Baltistan (14)
  'Ghanche',
  'Rondu',
  'Shigar',
  'Skardu',
  'Kharmang',
  'Astore',
  'Darel',
  'Diamir',
  'Tangir',
  'Ghizer',
  'Gilgit',
  'Gupis-Yasin',
  'Hunza',
  'Nagar',
  // Islamabad Capital Territory (1) — not in the workbook's Special Court
  // column; added as a correction (see note above).
  'Islamabad',
];

/**
 * Resolve the SPECIAL_COURT_DISTRICTS list to GeoCity ids, given a
 * lowercased-name → cityId lookup (the `globalCityByName` map both seeders
 * already build). Each district resolves to its same-named tehsil, falling
 * back to CITY_ALIAS for districts whose HQ tehsil differs. Returns the
 * resolved city ids plus any districts that failed to resolve so callers can
 * surface a warning instead of silently dropping a district.
 */
export function resolveSpecialCourtSeatCityIds(
  globalCityByName: Map<string, string>,
): { cityIds: string[]; unresolved: string[] } {
  const cityIds: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  for (const district of SPECIAL_COURT_DISTRICTS) {
    const alias = CITY_ALIAS[district];
    const id =
      globalCityByName.get(district.toLowerCase()) ??
      (alias ? globalCityByName.get(alias.toLowerCase()) : undefined);
    if (!id) {
      unresolved.push(district);
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      cityIds.push(id);
    }
  }
  return { cityIds, unresolved };
}
