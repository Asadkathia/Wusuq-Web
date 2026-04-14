import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('my-summary')
  @RequirePermissions('tickets.read')
  async getMyDashboard(@CurrentUser() user: JwtUser) {
    return this.dashboardService.getConsumerSummary(user.sub);
  }

  @Get('summary')
  @RequirePermissions('reports.read')
  async getSummary(@Query('range') range?: string) {
    return this.dashboardService.getSummary(range || '7d');
  }
}
