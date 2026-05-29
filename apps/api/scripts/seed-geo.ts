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
import {
  LOWER_COURT_SUBCOURTS,
  SPECIAL_COURTS,
} from '../src/geo/court-expansion';
import {
  CITY_ALIAS,
  CITY_FANOUT,
  LOWER_COURT_ONLY_TEHSILS,
  PROVINCE_ALIAS,
  resolveSpecialCourtSeatCityIds,
} from '../src/geo/court-alias';

const prisma = new PrismaClient();

type CourtCityEntry = { city: string; is_principal_seat: boolean };
type CourtsByProvince = Record<string, CourtCityEntry[]>;
type CourtsNested = Record<string, Record<string, CourtsByProvince>>;

const COURTS_NESTED = (courtsJson as { nested: CourtsNested }).nested;

// Alias maps are imported from src/geo/court-alias.ts so this script and
// GeoService.seedCourtsFromJson stay in lock-step.

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
          // Fan-out: a metro JSON name like "Karachi" maps to multiple geo
          // sub-cities. When fan-out applies, every resolved sub-city gets
          // its own seat row.
          const fanoutNames = CITY_FANOUT[entry.city];
          const cityIds: string[] = [];
          if (fanoutNames) {
            for (const name of fanoutNames) {
              const id =
                provinceCities?.get(name.toLowerCase()) ??
                globalCityByName.get(name.toLowerCase());
              if (id) cityIds.push(id);
            }
          } else {
            const literalKey = entry.city.toLowerCase();
            const aliased = CITY_ALIAS[entry.city] ?? entry.city;
            const aliasedKey = aliased.toLowerCase();
            const id =
              provinceCities?.get(literalKey) ??
              provinceCities?.get(aliasedKey) ??
              globalCityByName.get(aliasedKey);
            if (id) cityIds.push(id);
          }
          if (cityIds.length === 0) {
            const set = unresolved.get(canonical) ?? new Set<string>();
            set.add(entry.city);
            unresolved.set(canonical, set);
            continue;
          }

          for (const cityId of cityIds) {
            if (courtType === 'Lower Court') {
              for (const sc of LOWER_COURT_SUBCOURTS) {
                const courtId = await getOrCreateCourt(courtType, sc.name);
                seatRows.push({ courtId, cityId, isPrincipalSeat: false });
              }
            } else if (courtType === 'Special Court') {
              // Special courts are seated at the district level after this JSON
              // walk (see SPECIAL_COURT_DISTRICTS resolution below), not per
              // JSON entry.
              continue;
            } else {
              const courtId = await getOrCreateCourt(courtType, jsonSubCourtName);
              seatRows.push({ courtId, cityId, isPrincipalSeat: entry.is_principal_seat });
            }
          }
        }
      }
    }
  }

  // Tehsil Lower-Court-only fan-out. Metro tehsils (Lahore Cantt/Model Town;
  // Karachi South/East/West/North/Central) get the 4 canonical Lower Court
  // sub-courts seated on them so consumers picking those tehsils see Lower
  // Court only — the metro hub city retains the full court set.
  for (const [parentCity, tehsils] of Object.entries(LOWER_COURT_ONLY_TEHSILS)) {
    void parentCity;
    for (const tehsil of tehsils) {
      const cityId = globalCityByName.get(tehsil.toLowerCase());
      if (!cityId) continue;
      for (const sc of LOWER_COURT_SUBCOURTS) {
        const courtId = await getOrCreateCourt('Lower Court', sc.name);
        seatRows.push({ courtId, cityId, isPrincipalSeat: false });
      }
    }
  }

  // 2026-05-25 district-level special courts: special courts sit at the
  // district seat only (one city per district), not in every tehsil. Resolve
  // the canonical SPECIAL_COURT_DISTRICTS list to seat-city ids and seat the
  // full SPECIAL_COURTS catalogue on each; these rows join seatRows and are
  // deduped + bulk-inserted below.
  const { cityIds: specialSeatCityIds, unresolved: unresolvedSpecial } =
    resolveSpecialCourtSeatCityIds(globalCityByName);
  for (const subName of SPECIAL_COURTS) {
    const courtId = await getOrCreateCourt('Special Court', subName);
    for (const cityId of specialSeatCityIds) {
      seatRows.push({ courtId, cityId, isPrincipalSeat: false });
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
  console.log(
    `Special courts seated on ${specialSeatCityIds.length} district seats.`,
  );
  if (unresolved.size > 0) {
    console.log('\nUnresolved cities (not in geo tree — courts skipped):');
    for (const [province, cities] of unresolved.entries()) {
      console.log(`  ${province}: ${Array.from(cities).sort().join(', ')}`);
    }
  }
  if (unresolvedSpecial.length > 0) {
    console.log(
      `\nUnresolved special-court districts (no seat city — skipped): ${unresolvedSpecial.join(', ')}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
