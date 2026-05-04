import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { FilterCasesDto } from './dto/filter-cases.dto';
import { UpdateCaseStatusDto } from './dto/update-case-status.dto';
import { CreateCaseTicketDto } from './dto/create-case-ticket.dto';

@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @RequirePermissions('cases.write')
  @Post()
  create(
    @Body() dto: CreateCaseDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.createCase(dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('cases.read')
  @Get()
  list(
    @Query() query: FilterCasesDto,
    @CurrentUser() user: JwtUser | undefined,
  ) {
    const consumerRoles = ['consumer', 'lawyer', 'company'];
    if (user && consumerRoles.includes(user.role)) {
      query.consumerId = user.sub;
    }
    return this.casesService.findAll(query);
  }

  @RequirePermissions('cases.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.casesService.findOne(id);
  }

  @RequirePermissions('cases.write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCaseDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.updateCase(id, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('cases.write')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCaseStatusDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.updateStatus(id, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('cases.write')
  @Delete(':id')
  delete(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.deleteCase(id, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('cases.read')
  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.casesService.getCaseTimeline(id);
  }

  @RequirePermissions('cases.read')
  @Get(':id/summary')
  summary(@Param('id') id: string) {
    return this.casesService.getCaseSummary(id);
  }

  @RequirePermissions('cases.write')
  @Post(':id/tickets')
  createCaseTicket(
    @Param('id') caseId: string,
    @Body() dto: CreateCaseTicketDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.createCaseTicket(caseId, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('cases.read')
  @Get(':id/tickets')
  listTickets(@Param('id') caseId: string) {
    return this.casesService.listCaseTickets(caseId);
  }

  @RequirePermissions('cases.read')
  @Get(':id/recommendations')
  recommendations(@Param('id') caseId: string) {
    return this.casesService.getRecommendations(caseId);
  }

  @RequirePermissions('cases.read')
  @Post(':id/recommendations/track-click')
  trackRecommendationClick(
    @Param('id') caseId: string,
    @Body() body: { flowKey: string; surface?: string },
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.trackRecommendationClick(caseId, body, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('cases.read')
  @Get(':id/drifts')
  drifts(@Param('id') caseId: string) {
    return this.casesService.getUnresolvedDrifts(caseId);
  }

  @RequirePermissions('cases.write')
  @Post(':id/drifts/:eventId/resolve')
  resolveDrift(
    @Param('id') caseId: string,
    @Param('eventId') eventId: string,
    @Body() body: { source: 'CASE' | 'TICKET' },
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.resolveDrift(caseId, eventId, body.source, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }
}
