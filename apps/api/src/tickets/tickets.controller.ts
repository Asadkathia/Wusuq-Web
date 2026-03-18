import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { BulkTicketActionDto } from './dto/bulk-ticket-action.dto';
import { CreateTicketIntakeDto } from './dto/create-ticket-intake.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';
import { SaveTicketIntakeDraftDto } from './dto/save-ticket-intake-draft.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @RequirePermissions('tickets.read')
  @Get()
  findAll(@Query() query: FilterTicketsDto) {
    return this.ticketsService.findAll(query);
  }

  @RequirePermissions('tickets.read')
  @Get('representatives')
  representativeCandidates(
    @Query('city') city?: string,
    @Query('district') district?: string,
  ) {
    return this.ticketsService.representativeCandidates({ city, district });
  }

  @RequirePermissions('tickets.write')
  @Post('intake')
  createIntake(
    @Body() dto: CreateTicketIntakeDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.createIntakeTicket(dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Post('intake/judicial/case-files')
  createJudicialCaseFiles(
    @Body() dto: Omit<CreateTicketIntakeDto, 'flow'>,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.createIntakeTicketFromFlow(
      'judicial_case_files',
      dto,
      {
        actorUserId: actor?.sub,
        actorEmail: actor?.email,
      },
    );
  }

  @RequirePermissions('tickets.write')
  @Post('intake/judicial/case-information')
  createJudicialCaseInformation(
    @Body() dto: Omit<CreateTicketIntakeDto, 'flow'>,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.createIntakeTicketFromFlow(
      'judicial_case_information',
      dto,
      {
        actorUserId: actor?.sub,
        actorEmail: actor?.email,
      },
    );
  }

  @RequirePermissions('tickets.write')
  @Post('intake/judicial/case-search')
  createJudicialCaseSearch(
    @Body() dto: Omit<CreateTicketIntakeDto, 'flow'>,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.createIntakeTicketFromFlow(
      'judicial_case_search',
      dto,
      {
        actorUserId: actor?.sub,
        actorEmail: actor?.email,
      },
    );
  }

  @RequirePermissions('tickets.write')
  @Post('intake/judicial/case-filing')
  createJudicialCaseFiling(
    @Body() dto: Omit<CreateTicketIntakeDto, 'flow'>,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.createIntakeTicketFromFlow(
      'judicial_case_filing',
      dto,
      {
        actorUserId: actor?.sub,
        actorEmail: actor?.email,
      },
    );
  }

  @RequirePermissions('tickets.write')
  @Post('intake/judicial/power-of-attorney')
  createJudicialPowerOfAttorney(
    @Body() dto: Omit<CreateTicketIntakeDto, 'flow'>,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.createIntakeTicketFromFlow(
      'judicial_power_of_attorney',
      dto,
      {
        actorUserId: actor?.sub,
        actorEmail: actor?.email,
      },
    );
  }

  @RequirePermissions('tickets.write')
  @Post('intake/non-judicial/copy-of-fir')
  createNonJudicialCopyOfFir(
    @Body() dto: Omit<CreateTicketIntakeDto, 'flow'>,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.createIntakeTicketFromFlow(
      'non_judicial_copy_of_fir',
      dto,
      {
        actorUserId: actor?.sub,
        actorEmail: actor?.email,
      },
    );
  }

  @RequirePermissions('tickets.write')
  @Post('intake/non-judicial/registry-deed')
  createNonJudicialRegistryDeed(
    @Body() dto: Omit<CreateTicketIntakeDto, 'flow'>,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.createIntakeTicketFromFlow(
      'non_judicial_registry_deed',
      dto,
      {
        actorUserId: actor?.sub,
        actorEmail: actor?.email,
      },
    );
  }

  @RequirePermissions('tickets.write')
  @Post('intake-drafts')
  saveDraft(
    @Body() dto: SaveTicketIntakeDraftDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.saveIntakeDraft(dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.read')
  @Get('intake-drafts/:id')
  getDraft(@Param('id') id: string) {
    return this.ticketsService.getIntakeDraft(id);
  }

  @RequirePermissions('tickets.read')
  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.ticketsService.timeline(id);
  }

  @RequirePermissions('tickets.write')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.updateStatus(id, dto.status, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Post(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.assign(id, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Post('bulk-actions')
  bulkActions(
    @Body() body: BulkTicketActionDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.bulkAction(body, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Throttle({ upload: { limit: 10, ttl: 60_000 } })
  @Post(':id/documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/ticket-documents',
        filename: (_req, file, callback) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          callback(null, `${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile()
    file: { filename: string; mimetype: string; path: string },
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.uploadDocument(id, file, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Post(':id/regenerate')
  regenerate(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.regenerate(id, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }
}
