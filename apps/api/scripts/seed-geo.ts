/**
 * Standalone geo seeder — run with:
 *   cd apps/api && npx tsx scripts/seed-geo.ts
 *
 * Uses bulk inserts (createMany) to be fast even over Neon serverless.
 * Courts + seats come from src/geo/pakistan-courts.json.
 */
import { PrismaClient } from '@prisma/client';
import {
  RAW_POLICE_STATIONS_BY_PROVINCE,
  PAKISTAN_GEO,
} from '../src/geo/pakistan-seed';
import courtsJson from '../src/geo/pakistan-courts.json';
import { LOWER_COURT_SUBCOURTS, SPECIAL_COURT_SUBCOURTS } from '../src/geo/court-expansion';

const prisma = new PrismaClient();

type CourtCityEntry = { city: string; is_principal_seat: boolean };
type CourtsByProvince = Record<string, CourtCityEntry[]>;
type CourtsNested = Record<string, Record<string, CourtsByProvince>>;

const COURTS_NESTED = (courtsJson as { nested: CourtsNested }).nested;

// Some city names in pakistan-courts.json don't match pakistan-seed.ts verbatim
// (district vs. city split, spelling variants). Map the JSON name → the
// existing city it should be attached to.
const CITY_ALIAS: Record<string, string> = {
  Karachi: 'Karachi',
  'Karachi Centeral': 'Karachi',
  'Karachi South': 'Karachi',
  'Karachi East': 'Karachi',
  'Karachi West': 'Karachi',
  'Lahore Cantt': 'Lahore',
  'Lahore Model Town': 'Lahore',
  'Shaheed Benazir Abad': 'Shaheed Benazirabad',
  'Tando Muhammad Khan': 'Tando Mohammad Khan',
  'Qambar-Shahdadkot': 'Kambar',
  Swat: 'Mingora',
  'Babuzai (Swat)': 'Mingora',
  Buner: 'Daggar',
  Malakand: 'Batkhela',
  'Lower Dir': 'Timergara',
  'Upper Dir': 'Dir',
  'Daulatpur (Qazi Ahmed)': 'Daulatpur',
  'garhi dopatta (Garhi Dopatta)': 'Garhi Dupatta',
  Tharparkar: 'Mithi',
  Lasbela: 'Uthal',
  Jafarabad: 'Dera Allah Yar',
  Kachi: 'Dhadar',
  Kech: 'Turbat',
  Diamir: 'Chilas',
  Ghanche: 'Khaplu',
  Ghizer: 'Gahkuch',
  Hunza: 'Karimabad',
  Khushab: 'Jauharabad',
};

const PROVINCE_ALIAS: Record<string, string> = {
  AJK: 'Azad Jammu & Kashmir',
  Balochistan: 'Balochistan',
  Federal: 'Islamabad Capital Territory',
  'Gilgit-Baltistan': 'Gilgit-Baltistan',
  KPK: 'Khyber Pakhtunkhwa',
  Punjab: 'Punjab',
  Sindh: 'Sindh',
};

const POLICE_STATION_SEED: Record<string, string[]> = {
  Islamabad: ['Aabpara Police Station', 'Golra Police Station', 'Margalla Police Station', 'Noon Police Station', 'Ramna Police Station', 'Saddar Police Station', 'Secretariat Police Station'],
  Rawalpindi: ['Arya Mohalla Police Station', 'Civil Lines Police Station', 'Kotli Sattian Police Station', 'New Town Police Station', 'Potohar Police Station', 'Saddar Police Station', 'Taxila Police Station'],
  Lahore: ['Civil Lines Police Station', 'Defence Police Station', 'Garden Town Police Station', 'Gulberg Police Station', 'Model Town Police Station', 'Saddar Police Station', 'Township Police Station'],
  Karachi: ['Civil Lines Police Station', 'Defence Police Station', 'Garden Police Station', 'Gulshan-e-Iqbal Police Station', 'Korangi Police Station', 'Saddar Police Station', 'Shah Faisal Police Station'],
  Peshawar: ['Cantonment Police Station', 'City Police Station', 'Gulbahar Police Station', 'Hayatabad Police Station', 'Saddar Police Station', 'University Town Police Station'],
  Quetta: ['Airport Police Station', 'Bijli Road Police Station', 'Civil Lines Police Station', 'Gulistan Road Police Station', 'Saddar Police Station', 'Sariab Road Police Station'],
  Multan: ['Cantt Police Station', 'Civil Lines Police Station', 'Gulgasht Police Station', 'Mumtazabad Police Station', 'New Multan Police Station', 'Saddar Police Station'],
  Faisalabad: ['Civil Lines Police Station', 'D-Ground Police Station', 'Dijkot Police Station', 'Gulberg Police Station', 'Madina Town Police Station', 'Saddar Police Station'],
  Sialkot: ['Civil Lines Police Station', 'Daska Police Station', 'Pasrur Police Station', 'Saddar Police Station'],
  Hyderabad: ['City Police Station', 'Latifabad Police Station', 'Qasimabad Police Station', 'Saddar Police Station'],
  Sukkur: ['City Police Station', 'Rohri Police Station', 'Saddar Police Station'],
  Abbottabad: ['City Police Station', 'Havelian Police Station', 'Mirpur Police Station', 'Saddar Police Station'],
  Mardan: ['City Police Station', 'Gulberg Police Station', 'Saddar Police Station'],
  Muzaffarabad: ['City Police Station', 'Garhi Dupatta Police Station', 'Saddar Police Station'],
  Mirpur: ['City Police Station', 'Dadyal Police Station', 'Saddar Police Station'],
};

async function main() {
  console.log('Starting geo seed (bulk mode) for all Pakistan provinces...\n');

  console.log('Truncating existing geo data...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "CourtSeat",
      "Court",
      "GeoPoliceStation",
      "GeoCity",
      "GeoDistrict",
      "GeoProvince"
    RESTART IDENTITY CASCADE
  `);
  console.log('Truncated.\n');

  const totals = { provinces: 0, districts: 0, cities: 0, courts: 0, courtSeats: 0, policeStations: 0 };

  // 1. Provinces / districts / cities / stations.
  for (const prov of PAKISTAN_GEO) {
    process.stdout.write(`Seeding ${prov.name}...`);

    const province = await prisma.geoProvince.create({ data: { name: prov.name } });
    totals.provinces++;

    await prisma.geoDistrict.createMany({
      data: prov.districts.map((d) => ({ provinceId: province.id, name: d.name })),
    });
    totals.districts += prov.districts.length;

    const dbDistricts = await prisma.geoDistrict.findMany({
      where: { provinceId: province.id },
      select: { id: true, name: true },
    });
    const districtIdByName = new Map(dbDistricts.map((d) => [d.name, d.id]));

    const cityRows: { districtId: string; name: string }[] = [];
    for (const dist of prov.districts) {
      const districtId = districtIdByName.get(dist.name)!;
      for (const cityName of dist.cities) {
        cityRows.push({ districtId, name: cityName });
      }
    }
    await prisma.geoCity.createMany({ data: cityRows });
    totals.cities += cityRows.length;

    const dbCities = await prisma.geoCity.findMany({
      where: { districtId: { in: dbDistricts.map((d) => d.id) } },
      select: { id: true, name: true, districtId: true },
    });
    const cityIdByDistrictAndName = new Map(dbCities.map((c) => [`${c.districtId}:${c.name}`, c.id]));

    const stationRows: { cityId: string; name: string }[] = [];
    const provinceStations = RAW_POLICE_STATIONS_BY_PROVINCE[prov.name as keyof typeof RAW_POLICE_STATIONS_BY_PROVINCE] as Record<string, string[]> | undefined;

    for (const dist of prov.districts) {
      const districtId = districtIdByName.get(dist.name)!;
      const districtStations = provinceStations?.[dist.name] ?? [];

      for (const cityName of dist.cities) {
        const cityId = cityIdByDistrictAndName.get(`${districtId}:${cityName}`);
        if (!cityId) continue;
        const stations = districtStations.length > 0
          ? districtStations
          : (POLICE_STATION_SEED[cityName] ?? []);
        for (const stationName of stations) {
          stationRows.push({ cityId, name: stationName });
        }
      }
    }
    if (stationRows.length > 0) {
      await prisma.geoPoliceStation.createMany({ data: stationRows });
      totals.policeStations += stationRows.length;
    }

    console.log(` done (${prov.districts.length} districts, ${cityRows.length} cities, ${stationRows.length} stations)`);
  }

  // 2. Courts + seats from pakistan-courts.json.
  console.log('\nSeeding courts from pakistan-courts.json...');
  const cityByProvince = new Map<string, Map<string, string>>();
  const provinces = await prisma.geoProvince.findMany({
    include: { districts: { include: { cities: { select: { id: true, name: true } } } } },
  });
  for (const prov of provinces) {
    const map = new Map<string, string>();
    for (const dist of prov.districts) {
      for (const city of dist.cities) map.set(city.name.toLowerCase(), city.id);
    }
    cityByProvince.set(prov.name, map);
  }
  const globalCityByName = new Map<string, string>();
  for (const m of cityByProvince.values()) {
    for (const [k, v] of m.entries()) if (!globalCityByName.has(k)) globalCityByName.set(k, v);
  }

  const unresolved = new Map<string, Set<string>>();
  const seatRows: { courtId: string; cityId: string; isPrincipalSeat: boolean }[] = [];

  const courtIdByKey = new Map<string, string>();
  const getOrCreateCourt = async (type: string, name: string) => {
    const k = `${type}||${name}`;
    const existing = courtIdByKey.get(k);
    if (existing) return existing;
    const court = await prisma.court.create({ data: { type, name } });
    totals.courts++;
    courtIdByKey.set(k, court.id);
    return court.id;
  };

  for (const [courtType, subCourts] of Object.entries(COURTS_NESTED)) {
    for (const [jsonSubCourtName, provinceMap] of Object.entries(subCourts)) {
      for (const [jsonProvince, cityEntries] of Object.entries(provinceMap)) {
        const canonical = PROVINCE_ALIAS[jsonProvince] ?? jsonProvince;
        const provinceCities = cityByProvince.get(canonical);
        for (const entry of cityEntries) {
          const aliased = CITY_ALIAS[entry.city] ?? entry.city;
          const key = aliased.toLowerCase();
          const cityId = provinceCities?.get(key) ?? globalCityByName.get(key);
          if (!cityId) {
            const set = unresolved.get(canonical) ?? new Set<string>();
            set.add(entry.city);
            unresolved.set(canonical, set);
            continue;
          }

          if (courtType === 'Lower Court') {
            for (const sc of LOWER_COURT_SUBCOURTS) {
              const courtId = await getOrCreateCourt(courtType, sc.name);
              seatRows.push({ courtId, cityId, isPrincipalSeat: false });
            }
          } else if (courtType === 'Special Court') {
            for (const [subName, cities] of Object.entries(SPECIAL_COURT_SUBCOURTS)) {
              if (!cities.some((c) => c.toLowerCase() === entry.city.toLowerCase())) continue;
              const courtId = await getOrCreateCourt(courtType, subName);
              seatRows.push({ courtId, cityId, isPrincipalSeat: false });
            }
          } else {
            const courtId = await getOrCreateCourt(courtType, jsonSubCourtName);
            seatRows.push({ courtId, cityId, isPrincipalSeat: entry.is_principal_seat });
          }
        }
      }
    }
  }

  if (seatRows.length > 0) {
    // Deduplicate by (courtId, cityId) — a court can only sit once per city.
    const seen = new Set<string>();
    const deduped = seatRows.filter((r) => {
      const k = `${r.courtId}:${r.cityId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    await prisma.courtSeat.createMany({ data: deduped });
    totals.courtSeats = deduped.length;
  }

  console.log('\nSeed complete:', totals);
  if (unresolved.size > 0) {
    console.log('\nUnresolved cities (not in geo tree — courts skipped):');
    for (const [province, cities] of unresolved.entries()) {
      console.log(`  ${province}: ${Array.from(cities).sort().join(', ')}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
