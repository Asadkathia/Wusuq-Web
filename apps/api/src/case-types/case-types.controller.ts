import { Controller, Get, Query } from '@nestjs/common';
import { CaseTypesService } from './case-types.service';

@Controller('case-types')
export class CaseTypesController {
  constructor(private readonly svc: CaseTypesService) {}

  @Get()
  list(
    @Query('courtLevel') courtLevel: string,
    @Query('subCourt') subCourt?: string,
    @Query('district') district?: string,
    @Query('region') region?: string,
    @Query('highCourtCode') highCourtCode?: string,
  ) {
    return this.svc.findCaseTypes({
      courtLevel,
      subCourt,
      district,
      region,
      highCourtCode,
    });
  }
}
