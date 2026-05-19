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
  'Babuzai (Swat)': 'Mingora',
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
