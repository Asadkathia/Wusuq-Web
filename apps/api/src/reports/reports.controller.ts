import { Controller, Get, Param, Query } from '@nestjs/common';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @RequirePermissions('reports.read')
  @Get()
  list() {
    return this.reportsService.listAvailable();
  }

  @RequirePermissions('reports.read')
  @Get(':type')
  run(
    @Param('type') type: string,
    @Query('dateRange') dateRange?: string,
    @Query('status') status?: string,
  ) {
    return this.reportsService.run(type, { dateRange, status });
  }
}
