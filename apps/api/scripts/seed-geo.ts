/**
 * Standalone geo seeder — run with:
 *   cd apps/api && npx tsx scripts/seed-geo.ts
 *
 * Uses bulk inserts (createMany) to be fast even over Neon serverless.
 */
import { PrismaClient } from '@prisma/client';
import {
  RAW_POLICE_STATIONS_BY_PROVINCE,
  PAKISTAN_GEO,
} from '../src/geo/pakistan-seed';

const prisma = new PrismaClient();

const COURT_SEED: Record<string, { name: string; level: string }[]> = {
  'Islamabad':  [{ name: 'Supreme Court', level: 'Supreme Court' }],
  'Lahore':     [
    { name: 'Supreme Court', level: 'Supreme Court' },
    { name: 'Lahore High Court', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
    { name: 'Magisterial Court', level: 'Lower Court' },
  ],
  'Karachi':    [
    { name: 'Supreme Court', level: 'Supreme Court' },
    { name: 'Sindh High Court', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
    { name: 'Magisterial Court', level: 'Lower Court' },
  ],
  'Peshawar':   [
    { name: 'Supreme Court', level: 'Supreme Court' },
    { name: 'Peshawar High Court', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
    { name: 'Magisterial Court', level: 'Lower Court' },
  ],
  'Quetta':     [
    { name: 'Supreme Court', level: 'Supreme Court' },
    { name: 'Balochistan High Court', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
    { name: 'Magisterial Court', level: 'Lower Court' },
  ],
  'Rawalpindi': [
    { name: 'Supreme Court', level: 'Supreme Court' },
    { name: 'Islamabad High Court', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
    { name: 'Magisterial Court', level: 'Lower Court' },
  ],
  'Multan':     [
    { name: 'Lahore High Court (Multan Bench)', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
    { name: 'Magisterial Court', level: 'Lower Court' },
  ],
  'Faisalabad': [
    { name: 'Lahore High Court (Faisalabad Bench)', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
    { name: 'Magisterial Court', level: 'Lower Court' },
  ],
  'Muzaffarabad': [
    { name: 'AJK High Court', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
  ],
  'Mirpur':     [
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
  ],
  'Gilgit':     [
    { name: 'Gilgit-Baltistan High Court', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
  ],
  'Skardu':     [
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
  ],
  'Hyderabad':  [
    { name: 'Sindh High Court (Hyderabad Circuit)', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
  ],
  'Sukkur':     [
    { name: 'Sindh High Court (Sukkur Circuit)', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
  ],
  'Abbottabad': [
    { name: 'Peshawar High Court (Abbottabad Circuit)', level: 'High Court' },
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
  ],
  'Mardan':     [
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
  ],
  'Sialkot':    [
    { name: 'Sessions Court', level: 'Lower Court' },
    { name: 'Civil Court', level: 'Lower Court' },
    { name: 'Family Court', level: 'Lower Court' },
    { name: 'Magisterial Court', level: 'Lower Court' },
  ],
};

const POLICE_STATION_SEED: Record<string, string[]> = {
  'Islamabad':    ['Aabpara Police Station', 'Golra Police Station', 'Margalla Police Station', 'Noon Police Station', 'Ramna Police Station', 'Saddar Police Station', 'Secretariat Police Station'],
  'Rawalpindi':   ['Arya Mohalla Police Station', 'Civil Lines Police Station', 'Kotli Sattian Police Station', 'New Town Police Station', 'Potohar Police Station', 'Saddar Police Station', 'Taxila Police Station'],
  'Lahore':       ['Civil Lines Police Station', 'Defence Police Station', 'Garden Town Police Station', 'Gulberg Police Station', 'Model Town Police Station', 'Saddar Police Station', 'Township Police Station'],
  'Karachi':      ['Civil Lines Police Station', 'Defence Police Station', 'Garden Police Station', 'Gulshan-e-Iqbal Police Station', 'Korangi Police Station', 'Saddar Police Station', 'Shah Faisal Police Station'],
  'Peshawar':     ['Cantonment Police Station', 'City Police Station', 'Gulbahar Police Station', 'Hayatabad Police Station', 'Saddar Police Station', 'University Town Police Station'],
  'Quetta':       ['Airport Police Station', 'Bijli Road Police Station', 'Civil Lines Police Station', 'Gulistan Road Police Station', 'Saddar Police Station', 'Sariab Road Police Station'],
  'Multan':       ['Cantt Police Station', 'Civil Lines Police Station', 'Gulgasht Police Station', 'Mumtazabad Police Station', 'New Multan Police Station', 'Saddar Police Station'],
  'Faisalabad':   ['Civil Lines Police Station', 'D-Ground Police Station', 'Dijkot Police Station', 'Gulberg Police Station', 'Madina Town Police Station', 'Saddar Police Station'],
  'Sialkot':      ['Civil Lines Police Station', 'Daska Police Station', 'Pasrur Police Station', 'Saddar Police Station'],
  'Hyderabad':    ['City Police Station', 'Latifabad Police Station', 'Qasimabad Police Station', 'Saddar Police Station'],
  'Sukkur':       ['City Police Station', 'Rohri Police Station', 'Saddar Police Station'],
  'Abbottabad':   ['City Police Station', 'Havelian Police Station', 'Mirpur Police Station', 'Saddar Police Station'],
  'Mardan':       ['City Police Station', 'Gulberg Police Station', 'Saddar Police Station'],
  'Muzaffarabad': ['City Police Station', 'Garhi Dupatta Police Station', 'Saddar Police Station'],
  'Mirpur':       ['City Police Station', 'Dadyal Police Station', 'Saddar Police Station'],
};

async function main() {
  console.log('Starting geo seed (bulk mode) for all Pakistan provinces...\n');

  console.log('Truncating existing geo data...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "GeoPoliceStation",
      "GeoCourt",
      "GeoCity",
      "GeoDistrict",
      "GeoProvince"
    RESTART IDENTITY CASCADE
  `);
  console.log('Truncated.\n');

  const totals = { provinces: 0, districts: 0, cities: 0, courts: 0, policeStations: 0 };

  for (const prov of PAKISTAN_GEO) {
    process.stdout.write(`Seeding ${prov.name}...`);

    // 1. Create province
    const province = await prisma.geoProvince.create({ data: { name: prov.name } });
    totals.provinces++;

    // 2. Bulk-create all districts for this province
    await prisma.geoDistrict.createMany({
      data: prov.districts.map((d) => ({ provinceId: province.id, name: d.name })),
    });
    totals.districts += prov.districts.length;

    // 3. Fetch district IDs in one query
    const dbDistricts = await prisma.geoDistrict.findMany({
      where: { provinceId: province.id },
      select: { id: true, name: true },
    });
    const districtIdByName = new Map(dbDistricts.map((d) => [d.name, d.id]));

    // 4. Bulk-create all cities across all districts
    const cityRows: { districtId: string; name: string }[] = [];
    for (const dist of prov.districts) {
      const districtId = districtIdByName.get(dist.name)!;
      for (const cityName of dist.cities) {
        cityRows.push({ districtId, name: cityName });
      }
    }
    await prisma.geoCity.createMany({ data: cityRows });
    totals.cities += cityRows.length;

    // 5. Fetch city IDs in one query
    const districtIds = dbDistricts.map((d) => d.id);
    const dbCities = await prisma.geoCity.findMany({
      where: { districtId: { in: districtIds } },
      select: { id: true, name: true, districtId: true },
    });
    const cityIdByDistrictAndName = new Map(dbCities.map((c) => [`${c.districtId}:${c.name}`, c.id]));
    const cityIdByName = new Map(dbCities.map((c) => [c.name, c.id]));

    // 6. Bulk-create courts
    const courtRows: { cityId: string; name: string; level: string }[] = [];
    for (const city of dbCities) {
      const courts = COURT_SEED[city.name] ?? [];
      for (const c of courts) {
        courtRows.push({ cityId: city.id, name: c.name, level: c.level });
      }
    }
    if (courtRows.length > 0) {
      await prisma.geoCourt.createMany({ data: courtRows });
      totals.courts += courtRows.length;
    }

    // 7. Bulk-create police stations
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

    console.log(` done (${prov.districts.length} districts, ${cityRows.length} cities, ${courtRows.length} courts, ${stationRows.length} stations)`);
  }

  console.log('\nSeed complete:', totals);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
