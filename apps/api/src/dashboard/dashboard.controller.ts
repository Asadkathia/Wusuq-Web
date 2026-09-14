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

  // Batch-7 3.4 — registration analytics. Staff-only via reports.read.
  @Get('registrations')
  @RequirePermissions('reports.read')
  async getRegistrationStats() {
    return this.dashboardService.getRegistrationStats();
  }

  // Batch-8 item 3 — "if I click here I just get all the representatives; how
  // will I know WHO the money went to?" Decomposes the Representative Profit
  // KPI by person. Staff-only (reports.read) because it exposes every
  // representative's payable.
  @Get('representative-earnings')
  @RequirePermissions('reports.read')
  async getRepresentativeEarnings() {
    return this.dashboardService.getRepresentativeEarnings();
  }

  // Clerk (representative) dashboard — self-scoped by actor.sub. Gated on
  // `tickets.read` (representatives hold it); a non-clerk caller just gets an
  // empty summary since they have no assignments.
  @Get('clerk-summary')
  @RequirePermissions('tickets.read')
  async getClerkSummary(@CurrentUser() user: JwtUser) {
    return this.dashboardService.getClerkSummary(user.sub);
  }
}
