import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PAKISTAN_GEO } from './pakistan-seed';

@Injectable()
export class GeoService {
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

  // --- CRUD ---

  createProvince(name: string) {
    return this.prisma.geoProvince.create({ data: { name } });
  }

  async deleteProvince(id: string) {
    await this.prisma.geoProvince.findUniqueOrThrow({ where: { id } });
    return this.prisma.geoProvince.delete({ where: { id } });
  }

  createDistrict(provinceId: string, name: string) {
    return this.prisma.geoDistrict.create({ data: { provinceId, name } });
  }

  async deleteDistrict(id: string) {
    await this.prisma.geoDistrict.findUniqueOrThrow({ where: { id } });
    return this.prisma.geoDistrict.delete({ where: { id } });
  }

  createCity(districtId: string, name: string) {
    return this.prisma.geoCity.create({ data: { districtId, name } });
  }

  async deleteCity(id: string) {
    await this.prisma.geoCity.findUniqueOrThrow({ where: { id } });
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
   * Idempotent seed: inserts Pakistan provinces/districts/cities, skipping existing ones.
   */
  async seed() {
    let created = { provinces: 0, districts: 0, cities: 0 };
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
        for (const cityName of dist.cities) {
          const exists = await this.prisma.geoCity.findFirst({
            where: { districtId: district.id, name: cityName },
          });
          if (!exists) {
            await this.prisma.geoCity.create({ data: { districtId: district.id, name: cityName } });
            created.cities++;
          }
        }
      }
    }
    return { message: 'Seed complete', created };
  }

  /**
   * Full tree: provinces with their districts and cities — used by the admin UI.
   */
  async fullTree() {
    const provinces = await this.prisma.geoProvince.findMany({
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
    return provinces;
  }
}
