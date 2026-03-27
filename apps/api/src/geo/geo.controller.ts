import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
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
  @Get('provinces/:id/districts')
  districts(@Param('id') id: string) {
    return this.geoService.districts(id);
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
}
