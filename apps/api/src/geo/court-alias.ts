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
  Karachi: 'Karachi',
  'Karachi Centeral': 'Karachi',
  'Karachi South': 'Karachi',
  'Karachi East': 'Karachi',
  'Karachi West': 'Karachi',
  'Lahore Cantt': 'Lahore',
  'Lahore Model Town': 'Lahore',
  'Shaheed Benazir Abad': 'Nawabshah',
  'Tando Muhammad Khan': 'Tando Mohammad Khan',
  'Qambar-Shahdadkot': 'Kambar',
  Swat: 'Mingora',
  'Babuzai (Swat)': 'Mingora',
  Buner: 'Daggar (Buner)',
  Malakand: 'Sam Ranizai',
  'Lower Dir': 'Temergara',
  'Upper Dir': 'Dir',
  'Daulatpur (Qazi Ahmed)': 'Daulatpur',
  'garhi dopatta (Garhi Dopatta)': 'Garhi Dupatta',
  Tharparkar: 'Mithi',
  Lasbela: 'Uthal',
  Jafarabad: 'Dera Murad Jamali',
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
  'Gupis-Yasin': 'Gupis',
  Batagram: 'Batagram (Banna)',
  'Lower Kohistan': 'Pattan',
  Shangla: 'Alpuri',
  Torghar: 'Tor Ghar',
  'Upper Kohistan': 'Dassu',
};
