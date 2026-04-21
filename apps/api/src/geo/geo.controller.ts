import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { GeoService } from './geo.service';

@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Public()
  @Get('provinces')
  provinces() {
    return this.geoService.provinces();
  }

  @Public()
  @Get('tree')
  fullTree() {
    return this.geoService.fullTree();
  }

  @Public()
  @Get('provinces/:id/districts')
  districts(@Param('id') id: string) {
    return this.geoService.districts(id);
  }

  @Public()
  @Get('cities')
  allCities() {
    return this.geoService.allCities();
  }

  @Public()
  @Get('districts/:id/cities')
  cities(@Param('id') id: string) {
    return this.geoService.cities(id);
  }

  @Public()
  @Get('cities/:id/courts')
  courts(@Param('id') id: string) {
    return this.geoService.courts(id);
  }

  @Public()
  @Get('cities/:id/police-stations')
  policeStations(@Param('id') id: string) {
    return this.geoService.policeStations(id);
  }

  @Public()
  @Get('districts/:id/police-stations')
  districtPoliceStations(@Param('id') id: string) {
    return this.geoService.districtPoliceStations(id);
  }

  // --- Admin ---

  @RequirePermissions('costs.write')
  @Post('seed')
  seed() {
    return this.geoService.seed();
  }

  @RequirePermissions('costs.write')
  @Post('reset-seed')
  resetAndSeed() {
    return this.geoService.resetAndSeed();
  }

  // --- CRUD (admin only) ---

  @RequirePermissions('costs.write')
  @Post('provinces')
  createProvince(@Body('name') name: string) {
    return this.geoService.createProvince(name);
  }

  @RequirePermissions('costs.write')
  @Delete('provinces/:id')
  deleteProvince(@Param('id') id: string) {
    return this.geoService.deleteProvince(id);
  }

  @RequirePermissions('costs.write')
  @Post('provinces/:id/districts')
  createDistrict(@Param('id') provinceId: string, @Body('name') name: string) {
    return this.geoService.createDistrict(provinceId, name);
  }

  @RequirePermissions('costs.write')
  @Delete('districts/:id')
  deleteDistrict(@Param('id') id: string) {
    return this.geoService.deleteDistrict(id);
  }

  @RequirePermissions('costs.write')
  @Post('districts/:id/cities')
  createCity(@Param('id') districtId: string, @Body('name') name: string) {
    return this.geoService.createCity(districtId, name);
  }

  @RequirePermissions('costs.write')
  @Delete('cities/:id')
  deleteCity(@Param('id') id: string) {
    return this.geoService.deleteCity(id);
  }
}
