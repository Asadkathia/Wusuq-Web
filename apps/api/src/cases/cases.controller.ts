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
import { CreateHearingDto } from './dto/create-hearing.dto';
import { UpdateHearingDto } from './dto/update-hearing.dto';
import { CreateCaseTicketDto } from './dto/create-case-ticket.dto';
import { ContinueCaseTicketDto } from './dto/continue-case-ticket.dto';

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
  list(@Query() query: FilterCasesDto) {
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
  @Post(':id/hearings')
  createHearing(
    @Param('id') caseId: string,
    @Body() dto: CreateHearingDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.createHearing(caseId, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('cases.read')
  @Get(':id/hearings')
  listHearings(@Param('id') caseId: string) {
    return this.casesService.listHearings(caseId);
  }

  @RequirePermissions('cases.write')
  @Patch(':id/hearings/:hid')
  updateHearing(
    @Param('id') caseId: string,
    @Param('hid') hid: string,
    @Body() dto: UpdateHearingDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.updateHearing(caseId, hid, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('cases.write')
  @Delete(':id/hearings/:hid')
  deleteHearing(
    @Param('id') caseId: string,
    @Param('hid') hid: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.deleteHearing(caseId, hid, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
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

  @RequirePermissions('cases.write')
  @Post(':id/tickets/continue/:prevId')
  continueCaseTicket(
    @Param('id') caseId: string,
    @Param('prevId') prevId: string,
    @Body() dto: ContinueCaseTicketDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.casesService.continueCaseTicket(caseId, prevId, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('cases.read')
  @Get(':id/tickets')
  listTickets(@Param('id') caseId: string) {
    return this.casesService.listCaseTickets(caseId);
  }
}
