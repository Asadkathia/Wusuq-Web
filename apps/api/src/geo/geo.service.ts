import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PAKISTAN_GEO, RAW_POLICE_STATIONS_BY_PROVINCE } from './pakistan-seed';
import courtsJson from './pakistan-courts.json';
import {
  LOWER_COURT_SUBCOURTS,
  SPECIAL_COURT_SUBCOURTS,
} from './court-expansion';
import { CITY_ALIAS, PROVINCE_ALIAS } from './court-alias';

type CourtCityEntry = { city: string; is_principal_seat: boolean };
type CourtsByProvince = Record<string, CourtCityEntry[]>;
type CourtsNested = Record<string, Record<string, CourtsByProvince>>;

const COURTS_NESTED = (courtsJson as { nested: CourtsNested }).nested;

@Injectable()
export class GeoService {
  private geoSeedQueue: Promise<void> = Promise.resolve();
  private geoTreeCache: { data: unknown; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  provinces() {
    return this.prisma.geoProvince.findMany({ orderBy: { name: 'asc' } });
  }

  districts(provinceId: string) {
    return this.prisma.geoDistrict.findMany({
      where: { provinceId },
      orderBy: { name: 'asc' },
    });
  }

  cities(districtId: string) {
    return this.prisma.geoCity.findMany({
      where: { districtId },
      orderBy: { name: 'asc' },
    });
  }

  async allCities() {
    const rows = await this.prisma.geoCity.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        district: {
          select: {
            name: true,
            province: { select: { name: true } },
          },
        },
      },
    });
    // Deduplicate by (normalized-name, district, province). Keeps the first row
    // whenever the seed has accidentally created multiple GeoCity entries for
    // the same physical place (a known issue with the historical seed expansion
    // where district fallbacks could re-insert names already allocated). When a
    // name legitimately recurs across districts/provinces it is preserved.
    const seen = new Map<
      string,
      { id: string; name: string; district: string; province: string }
    >();
    for (const c of rows) {
      const province = c.district.province.name;
      const district = c.district.name;
      const normName = c.name.replace(/\s+/g, ' ').trim().toLowerCase();
      const key = `${province}|${district}|${normName}`;
      if (!seen.has(key)) {
        seen.set(key, {
          id: c.id,
          name: c.name,
          district,
          province,
        });
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Courts available in a city, grouped by court type. Each group lists the
   * individual sub-courts (e.g. High Court → [Lahore High Court, Islamabad
   * High Court]) so the UI can render a second dropdown only when a type has
   * more than one sub-court.
   */
  async courts(cityId: string) {
    const seats = await this.prisma.courtSeat.findMany({
      where: { cityId },
      include: { court: true },
      orderBy: [{ court: { type: 'asc' } }, { court: { name: 'asc' } }],
    });

    const groups = new Map<
      string,
      {
        type: string;
        courts: { id: string; name: string; isPrincipalSeat: boolean }[];
      }
    >();
    for (const seat of seats) {
      const group = groups.get(seat.court.type) ?? {
        type: seat.court.type,
        courts: [],
      };
      group.courts.push({
        id: seat.court.id,
        name: seat.court.name,
        isPrincipalSeat: seat.isPrincipalSeat,
      });
      groups.set(seat.court.type, group);
    }

    // Lower Court sub-courts have a canonical priority order (Sessions, Civil,
    // Magisterial, Family) declared in court-expansion.ts. The database query
    // returns them alphabetically; re-order them here to match the canonical
    // sequence so the wizard preserves that priority order.
    const lowerCourtGroup = groups.get('Lower Court');
    if (lowerCourtGroup) {
      const orderIndex = new Map(
        LOWER_COURT_SUBCOURTS.map((sc, idx) => [sc.name, idx]),
      );
      lowerCourtGroup.courts.sort((a, b) => {
        const ra = orderIndex.get(a.name) ?? Number.MAX_SAFE_INTEGER;
        const rb = orderIndex.get(b.name) ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
    }

    return Array.from(groups.values());
  }

  policeStations(cityId: string) {
    return this.prisma.geoPoliceStation.findMany({
      where: { cityId },
      orderBy: { name: 'asc' },
    });
  }

  async districtPoliceStations(districtId: string) {
    const cities = await this.prisma.geoCity.findMany({
      where: { districtId },
      select: { id: true },
    });

    if (!cities.length) {
      return [];
    }

    const stations = await this.prisma.geoPoliceStation.findMany({
      where: {
        cityId: { in: cities.map((city) => city.id) },
      },
      orderBy: { name: 'asc' },
      distinct: ['name'],
    });

    return stations;
  }

  // --- CRUD ---

  createProvince(name: string) {
    this.geoTreeCache = null;
    return this.prisma.geoProvince.create({ data: { name } });
  }

  async deleteProvince(id: string) {
    await this.prisma.geoProvince.findUniqueOrThrow({ where: { id } });
    this.geoTreeCache = null;
    return this.prisma.geoProvince.delete({ where: { id } });
  }

  createDistrict(provinceId: string, name: string) {
    this.geoTreeCache = null;
    return this.prisma.geoDistrict.create({ data: { provinceId, name } });
  }

  async deleteDistrict(id: string) {
    await this.prisma.geoDistrict.findUniqueOrThrow({ where: { id } });
    this.geoTreeCache = null;
    return this.prisma.geoDistrict.delete({ where: { id } });
  }

  createCity(districtId: string, name: string) {
    this.geoTreeCache = null;
    return this.prisma.geoCity.create({ data: { districtId, name } });
  }

  async deleteCity(id: string) {
    await this.prisma.geoCity.findUniqueOrThrow({ where: { id } });
    this.geoTreeCache = null;
    return this.prisma.geoCity.delete({ where: { id } });
  }

  /**
   * Given a city name (from intake payload), resolve the province name.
   */
  async resolveProvinceByCity(cityName: string): Promise<string | undefined> {
    if (!cityName) return undefined;
    const city = await this.prisma.geoCity.findFirst({
      where: { name: { equals: cityName, mode: 'insensitive' } },
      include: { district: { include: { province: true } } },
    });
    return city?.district.province.name;
  }

  private async runGeoSeedJob<T>(job: () => Promise<T>): Promise<T> {
    const run = this.geoSeedQueue.then(job, job);
    this.geoSeedQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Major cities and the police stations they have (fallback list — the legacy
   * source only provides stations district-wise, seeded district-wide below).
   */
  private static readonly POLICE_STATION_SEED: Record<string, string[]> = {
    Lahore: [
      'Cantt Police Station',
      'Civil Lines Police Station',
      'Defence Police Station',
      'Garden Town Police Station',
      'Gulberg Police Station',
      'Model Town Police Station',
      'Raiwind Police Station',
      'Sadar Police Station',
      'Shadman Police Station',
    ],
    Karachi: [
      'Clifton Police Station',
      'Defence Police Station',
      'Gulshan-e-Iqbal Police Station',
      'Korangi Police Station',
      'Landhi Police Station',
      'Malir Police Station',
      'North Nazimabad Police Station',
      'Sadar Police Station',
      'SITE Police Station',
    ],
    Rawalpindi: [
      'Cantt Police Station',
      'Chaklala Police Station',
      'Civil Lines Police Station',
      'Saddar Police Station',
      'Wah Cantt Police Station',
    ],
    Faisalabad: [
      'Civil Lines Police Station',
      'Gulberg Police Station',
      'Madina Town Police Station',
      'Sadar Police Station',
    ],
    Multan: [
      'City Police Station',
      'Civil Lines Police Station',
      'Gulgasht Police Station',
      'Sadar Police Station',
    ],
    Peshawar: [
      'Cantt Police Station',
      'City Police Station',
      'Hayatabad Police Station',
      'Kohat Road Police Station',
      'Saddar Police Station',
    ],
    Quetta: [
      'Airport Police Station',
      'City Police Station',
      'Civil Lines Police Station',
      'Saddar Police Station',
      'Sariab Police Station',
    ],
    Islamabad: [
      'Aabpara Police Station',
      'Bhara Kahu Police Station',
      'Golra Police Station',
      'Karachi Company Police Station',
      'Margalla Police Station',
      'Noon Police Station',
      'Ramna Police Station',
      'Secretariat Police Station',
      'Tarnol Police Station',
    ],
    Gujranwala: [
      'City Police Station',
      'Gondlanwala Police Station',
      'Qila Didar Singh Police Station',
      'Saddar Police Station',
    ],
    Sialkot: [
      'Civil Lines Police Station',
      'Daska Police Station',
      'Pasrur Police Station',
      'Saddar Police Station',
    ],
    Hyderabad: [
      'City Police Station',
      'Latifabad Police Station',
      'Qasimabad Police Station',
      'Saddar Police Station',
    ],
    Sukkur: [
      'City Police Station',
      'Rohri Police Station',
      'Saddar Police Station',
    ],
    Abbottabad: [
      'City Police Station',
      'Havelian Police Station',
      'Mirpur Police Station',
      'Saddar Police Station',
    ],
    Mardan: [
      'City Police Station',
      'Gulberg Police Station',
      'Saddar Police Station',
    ],
    Muzaffarabad: [
      'City Police Station',
      'Garhi Dupatta Police Station',
      'Saddar Police Station',
    ],
    Mirpur: [
      'City Police Station',
      'Dadyal Police Station',
      'Saddar Police Station',
    ],
  };

  private async seedUnsafe() {
    const created = {
      provinces: 0,
      districts: 0,
      cities: 0,
      courts: 0,
      courtSeats: 0,
      policeStations: 0,
    };
    const warnings: string[] = [];

    // 1. Provinces / districts / cities / police-stations (existing pakistan-seed tree).
    for (const prov of PAKISTAN_GEO) {
      let province = await this.prisma.geoProvince.findFirst({
        where: { name: prov.name },
      });
      if (!province) {
        province = await this.prisma.geoProvince.create({
          data: { name: prov.name },
        });
        created.provinces++;
      }
      for (const dist of prov.districts) {
        let district = await this.prisma.geoDistrict.findFirst({
          where: { provinceId: province.id, name: dist.name },
        });
        if (!district) {
          district = await this.prisma.geoDistrict.create({
            data: { provinceId: province.id, name: dist.name },
          });
          created.districts++;
        }
        const districtCities: { id: string; name: string }[] = [];
        for (const cityName of dist.cities) {
          let city = await this.prisma.geoCity.findFirst({
            where: { districtId: district.id, name: cityName },
          });
          if (!city) {
            city = await this.prisma.geoCity.create({
              data: { districtId: district.id, name: cityName },
            });
            created.cities++;
          }
          districtCities.push(city);
        }

        const districtStations =
          (
            RAW_POLICE_STATIONS_BY_PROVINCE[
              prov.name as keyof typeof RAW_POLICE_STATIONS_BY_PROVINCE
            ] as Record<string, string[]>
          )?.[dist.name] ?? [];
        for (const city of districtCities) {
          const stationsForCity = districtStations.length
            ? districtStations
            : (GeoService.POLICE_STATION_SEED[city.name] ?? []);
          for (const stationName of stationsForCity) {
            const exists = await this.prisma.geoPoliceStation.findFirst({
              where: { cityId: city.id, name: stationName },
            });
            if (!exists) {
              await this.prisma.geoPoliceStation.create({
                data: { cityId: city.id, name: stationName },
              });
              created.policeStations++;
            }
          }
        }
      }
    }

    // 2. Courts + seats from pakistan-courts.json.
    const courtSeatResult = await this.seedCourtsFromJson();
    created.courts += courtSeatResult.courts;
    created.courtSeats += courtSeatResult.courtSeats;
    warnings.push(...courtSeatResult.warnings);

    return { message: 'Seed complete', created, warnings };
  }

  /**
   * Idempotently seeds the Court + CourtSeat tables from pakistan-courts.json.
   * Matches JSON cities to existing GeoCity rows by (province alias, city name)
   * with a fallback to a global name lookup. Cities that cannot be resolved
   * are returned in `warnings` so the operator can extend the geo seed.
   */
  private async seedCourtsFromJson() {
    const result = { courts: 0, courtSeats: 0, warnings: [] as string[] };
    const unresolved = new Map<string, Set<string>>(); // province → city set

    // Build a lookup: provinceName → Map<cityName_lowercase, cityId>
    const cityByProvince = new Map<string, Map<string, string>>();
    const provinces = await this.prisma.geoProvince.findMany({
      include: {
        districts: {
          include: { cities: { select: { id: true, name: true } } },
        },
      },
    });
    for (const prov of provinces) {
      const map = new Map<string, string>();
      for (const dist of prov.districts) {
        for (const city of dist.cities) {
          map.set(city.name.toLowerCase(), city.id);
        }
      }
      cityByProvince.set(prov.name, map);
    }
    const globalCityByName = new Map<string, string>();
    for (const map of cityByProvince.values()) {
      for (const [k, v] of map.entries()) {
        if (!globalCityByName.has(k)) globalCityByName.set(k, v);
      }
    }

    // Cache Court rows by (type, name) so we reuse them across cities.
    const courtCache = new Map<string, { id: string }>();
    const getOrCreateCourt = async (type: string, name: string) => {
      const key = `${type}||${name}`;
      const cached = courtCache.get(key);
      if (cached) return cached;
      let court = await this.prisma.court.findFirst({ where: { type, name } });
      if (!court) {
        court = await this.prisma.court.create({ data: { type, name } });
        result.courts++;
      }
      courtCache.set(key, { id: court.id });
      return court;
    };

    const upsertSeat = async (
      courtId: string,
      cityId: string,
      isPrincipal: boolean,
    ) => {
      const existing = await this.prisma.courtSeat.findUnique({
        where: { courtId_cityId: { courtId, cityId } },
      });
      if (!existing) {
        await this.prisma.courtSeat.create({
          data: { courtId, cityId, isPrincipalSeat: isPrincipal },
        });
        result.courtSeats++;
      } else if (existing.isPrincipalSeat !== isPrincipal) {
        await this.prisma.courtSeat.update({
          where: { id: existing.id },
          data: { isPrincipalSeat: isPrincipal },
        });
      }
    };

    for (const [courtType, subCourts] of Object.entries(COURTS_NESTED)) {
      for (const [jsonSubCourtName, provinceMap] of Object.entries(subCourts)) {
        for (const [jsonProvince, cityEntries] of Object.entries(provinceMap)) {
          const canonicalProvince =
            PROVINCE_ALIAS[jsonProvince] ?? jsonProvince;
          const provinceCities = cityByProvince.get(canonicalProvince);

          for (const entry of cityEntries) {
            const aliased = CITY_ALIAS[entry.city] ?? entry.city;
            const key = aliased.toLowerCase();
            const cityId =
              provinceCities?.get(key) ?? globalCityByName.get(key);
            if (!cityId) {
              const set =
                unresolved.get(canonicalProvince) ?? new Set<string>();
              set.add(entry.city);
              unresolved.set(canonicalProvince, set);
              continue;
            }

            // Expansion rules:
            //   • Lower Court  → 4 standard sub-courts per city.
            //   • Special Court → legacy specialized list, but only those
            //     whose legacy city-presence table matches this city.
            //   • All other types → use the JSON sub-court name as-is.
            if (courtType === 'Lower Court') {
              for (const sc of LOWER_COURT_SUBCOURTS) {
                const court = await getOrCreateCourt(courtType, sc.name);
                await upsertSeat(court.id, cityId, false);
              }
            } else if (courtType === 'Special Court') {
              for (const [subName, cities] of Object.entries(
                SPECIAL_COURT_SUBCOURTS,
              )) {
                if (
                  !cities.some(
                    (c) => c.toLowerCase() === entry.city.toLowerCase(),
                  )
                )
                  continue;
                const court = await getOrCreateCourt(courtType, subName);
                await upsertSeat(court.id, cityId, false);
              }
            } else {
              const court = await getOrCreateCourt(courtType, jsonSubCourtName);
              await upsertSeat(court.id, cityId, entry.is_principal_seat);
            }
          }
        }
      }
    }

    for (const [province, cities] of unresolved.entries()) {
      result.warnings.push(
        `Unresolved cities in ${province}: ${Array.from(cities).sort().join(', ')}`,
      );
    }
    return result;
  }

  async seed() {
    this.geoTreeCache = null;
    return this.runGeoSeedJob(() => this.seedUnsafe());
  }

  async resetAndSeed() {
    this.geoTreeCache = null;
    return this.runGeoSeedJob(async () => {
      await this.prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
          "CourtSeat",
          "Court",
          "GeoPoliceStation",
          "GeoCity",
          "GeoDistrict",
          "GeoProvince"
        RESTART IDENTITY CASCADE
      `);

      const result = await this.seedUnsafe();
      return {
        message: 'Geo data reset and reseeded',
        created: result.created,
        warnings: result.warnings,
      };
    });
  }

  async fullTree() {
    if (this.geoTreeCache && Date.now() < this.geoTreeCache.expiresAt) {
      return this.geoTreeCache.data;
    }

    const data = await this.buildTree();
    this.geoTreeCache = { data, expiresAt: Date.now() + 300_000 };
    return data;
  }

  private async buildTree() {
    return this.prisma.geoProvince.findMany({
      orderBy: { name: 'asc' },
      include: {
        districts: {
          orderBy: { name: 'asc' },
          include: {
            cities: { orderBy: { name: 'asc' } },
          },
        },
      },
    });
  }
}
