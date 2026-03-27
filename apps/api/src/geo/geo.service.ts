import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
}
