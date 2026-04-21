import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PAKISTAN_GEO, RAW_POLICE_STATIONS_BY_PROVINCE } from './pakistan-seed';

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

  allCities() {
    return this.prisma.geoCity.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  courts(cityId: string) {
    return this.prisma.geoCourt.findMany({
      where: { cityId },
      orderBy: { name: 'asc' },
    });
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
   * Used by createIntakeTicket to pass province to cost rule lookup.
   * Returns undefined if the city is not in the geo table.
   */
  async resolveProvinceByCity(cityName: string): Promise<string | undefined> {
    if (!cityName) return undefined;
    const city = await this.prisma.geoCity.findFirst({
      where: { name: { equals: cityName, mode: 'insensitive' } },
      include: { district: { include: { province: true } } },
    });
    return city?.district.province.name;
  }

  /**
   * Idempotent seed: inserts Pakistan provinces/districts/cities/courts/police-stations,
   * skipping existing ones.
   */
  private async runGeoSeedJob<T>(job: () => Promise<T>): Promise<T> {
    const run = this.geoSeedQueue.then(job, job);
    this.geoSeedQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async seedUnsafe() {
    let created = { provinces: 0, districts: 0, cities: 0, courts: 0, policeStations: 0 };

    // court name → array of cities it serves (mirrors COURT_CITIES in services.service.ts)
    const COURT_SEED: Record<string, { name: string; level: string }[]> = {
      // Supreme Court cities
      'Islamabad':        [{ name: 'Supreme Court', level: 'Supreme Court' }],
      'Lahore':           [
        { name: 'Supreme Court', level: 'Supreme Court' },
        { name: 'Lahore High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
        { name: 'Magisterial Court', level: 'Lower Court' },
      ],
      'Karachi':          [
        { name: 'Supreme Court', level: 'Supreme Court' },
        { name: 'Sindh High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
        { name: 'Magisterial Court', level: 'Lower Court' },
      ],
      'Peshawar':         [
        { name: 'Supreme Court', level: 'Supreme Court' },
        { name: 'Peshawar High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
        { name: 'Magisterial Court', level: 'Lower Court' },
      ],
      'Quetta':           [
        { name: 'Supreme Court', level: 'Supreme Court' },
        { name: 'Balochistan High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
        { name: 'Magisterial Court', level: 'Lower Court' },
      ],
      'Muzaffarabad':     [
        { name: 'Azad Kashmir High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Mirpur':           [
        { name: 'Azad Kashmir High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Rawalpindi':       [
        { name: 'Lahore High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
        { name: 'Magisterial Court', level: 'Lower Court' },
      ],
      'Multan':           [
        { name: 'Lahore High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Bahawalpur':       [
        { name: 'Lahore High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Sukkur':           [
        { name: 'Sindh High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Hyderabad':        [
        { name: 'Sindh High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Larkana':          [
        { name: 'Sindh High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Abbottabad':       [
        { name: 'Peshawar High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Mingora':          [
        { name: 'Peshawar High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
      ],
      'Dera Ismail Khan': [
        { name: 'Peshawar High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Bannu':            [
        { name: 'Peshawar High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
      ],
      'Sibi':             [
        { name: 'Balochistan High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
      ],
      'Turbat':           [
        { name: 'Balochistan High Court', level: 'High Court' },
        { name: 'Sessions Court', level: 'Lower Court' },
      ],
      'Faisalabad':       [
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
        { name: 'Magisterial Court', level: 'Lower Court' },
      ],
      'Gujranwala':       [
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Sialkot':          [
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Sargodha':         [
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
      'Mardan':           [
        { name: 'Sessions Court', level: 'Lower Court' },
        { name: 'Civil Court', level: 'Lower Court' },
        { name: 'Family Court', level: 'Lower Court' },
      ],
    };

    // Major cities and the police stations they have (representative list)
    const POLICE_STATION_SEED: Record<string, string[]> = {
      'Lahore':       ['Cantt Police Station', 'Civil Lines Police Station', 'Defence Police Station', 'Garden Town Police Station', 'Gulberg Police Station', 'Model Town Police Station', 'Raiwind Police Station', 'Sadar Police Station', 'Shadman Police Station'],
      'Karachi':      ['Clifton Police Station', 'Defence Police Station', 'Gulshan-e-Iqbal Police Station', 'Korangi Police Station', 'Landhi Police Station', 'Malir Police Station', 'North Nazimabad Police Station', 'Sadar Police Station', 'SITE Police Station'],
      'Rawalpindi':   ['Cantt Police Station', 'Chaklala Police Station', 'Civil Lines Police Station', 'Saddar Police Station', 'Wah Cantt Police Station'],
      'Faisalabad':   ['Civil Lines Police Station', 'Gulberg Police Station', 'Madina Town Police Station', 'Sadar Police Station'],
      'Multan':       ['City Police Station', 'Civil Lines Police Station', 'Gulgasht Police Station', 'Sadar Police Station'],
      'Peshawar':     ['Cantt Police Station', 'City Police Station', 'Hayatabad Police Station', 'Kohat Road Police Station', 'Saddar Police Station'],
      'Quetta':       ['Airport Police Station', 'City Police Station', 'Civil Lines Police Station', 'Saddar Police Station', 'Sariab Police Station'],
      'Islamabad':    ['Aabpara Police Station', 'Bhara Kahu Police Station', 'Golra Police Station', 'Karachi Company Police Station', 'Margalla Police Station', 'Noon Police Station', 'Ramna Police Station', 'Secretariat Police Station', 'Tarnol Police Station'],
      'Gujranwala':   ['City Police Station', 'Gondlanwala Police Station', 'Qila Didar Singh Police Station', 'Saddar Police Station'],
      'Sialkot':      ['Civil Lines Police Station', 'Daska Police Station', 'Pasrur Police Station', 'Saddar Police Station'],
      'Hyderabad':    ['City Police Station', 'Latifabad Police Station', 'Qasimabad Police Station', 'Saddar Police Station'],
      'Sukkur':       ['City Police Station', 'Rohri Police Station', 'Saddar Police Station'],
      'Abbottabad':   ['City Police Station', 'Havelian Police Station', 'Mirpur Police Station', 'Saddar Police Station'],
      'Mardan':       ['City Police Station', 'Gulberg Police Station', 'Saddar Police Station'],
      'Muzaffarabad': ['City Police Station', 'Garhi Dupatta Police Station', 'Saddar Police Station'],
      'Mirpur':       ['City Police Station', 'Dadyal Police Station', 'Saddar Police Station'],
    };

    for (const prov of PAKISTAN_GEO) {
      let province = await this.prisma.geoProvince.findFirst({ where: { name: prov.name } });
      if (!province) {
        province = await this.prisma.geoProvince.create({ data: { name: prov.name } });
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
            city = await this.prisma.geoCity.create({ data: { districtId: district.id, name: cityName } });
            created.cities++;
          }
          districtCities.push(city);

          // Seed courts for this city
          const courtsForCity = COURT_SEED[cityName] ?? [];
          for (const courtData of courtsForCity) {
            const exists = await this.prisma.geoCourt.findFirst({
              where: { cityId: city.id, name: courtData.name },
            });
            if (!exists) {
              await this.prisma.geoCourt.create({
                data: { cityId: city.id, name: courtData.name, level: courtData.level },
              });
              created.courts++;
            }
          }

        }

        // The legacy source only provides police stations district-wise.
        // Seed the district's station list into every city in that district so the city-based API
        // can still serve the full dropdown for the selected district.
        const districtStations =
          (
            RAW_POLICE_STATIONS_BY_PROVINCE[
              prov.name as keyof typeof RAW_POLICE_STATIONS_BY_PROVINCE
            ] as Record<string, string[]>
          )?.[dist.name] ?? [];
        for (const city of districtCities) {
          const stationsForCity = districtStations.length
            ? districtStations
            : (POLICE_STATION_SEED[city.name] ?? []);
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
    return { message: 'Seed complete', created };
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
          "GeoPoliceStation",
          "GeoCourt",
          "GeoCity",
          "GeoDistrict",
          "GeoProvince"
        RESTART IDENTITY CASCADE
      `);

      const result = await this.seedUnsafe();
      return {
        message: 'Geo data reset and reseeded',
        created: result.created,
      };
    });
  }

  /**
   * Full tree: provinces with their districts and cities — used by the admin UI.
   */
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
