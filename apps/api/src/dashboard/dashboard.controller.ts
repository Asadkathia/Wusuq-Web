import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermissions('reports.read')
  async getSummary(@Query('range') range?: string) {
    return this.dashboardService.getSummary(range || '7d');
  }
}
