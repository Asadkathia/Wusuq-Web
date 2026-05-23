import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UPLOADS_BUCKETS, getUploadsBucketDir } from '../config/uploads';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { AssignBulkDto } from './dto/assign-bulk.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { BulkTicketActionDto } from './dto/bulk-ticket-action.dto';
import { CreateTicketIntakeDto } from './dto/create-ticket-intake.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';
import { PatchDocumentDto } from './dto/patch-document.dto';
import { SaveTicketIntakeDraftDto } from './dto/save-ticket-intake-draft.dto';
import { SubmitClerkCostsDto } from './dto/submit-clerk-costs.dto';
import { FinalizeRemainderDto } from './dto/finalize-remainder.dto';
import { RecordNextHearingDto } from './dto/record-next-hearing.dto';
import { RejectAssignmentDto } from './dto/reject-assignment.dto';
import { StatusOverrideDto } from './dto/status-override.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsService } from './tickets.service';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.doc',
  '.docx',
]);

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @RequirePermissions('tickets.read')
  @Get()
  findAll(
    @Query() query: FilterTicketsDto,
    @CurrentUser() user: JwtUser | undefined,
  ) {
    const consumerRoles = ['consumer', 'lawyer', 'company'];
    if (user && consumerRoles.includes(user.role)) {
      query.consumerId = user.sub;
    }
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
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.update(id, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
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
  @Post('intake/non-judicial/criminal-record-search')
  createNonJudicialCriminalRecordSearch(
    @Body() dto: Omit<CreateTicketIntakeDto, 'flow'>,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.createIntakeTicketFromFlow(
      'non_judicial_criminal_record_search',
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
  @Get('intake-drafts')
  listIntakeDrafts(@CurrentUser() actor: JwtUser | undefined) {
    if (!actor?.sub) {
      throw new BadRequestException('Authenticated user required');
    }
    return this.ticketsService.listConsumerDrafts(actor.sub);
  }

  @RequirePermissions('tickets.read')
  @Get('intake-drafts/active')
  getActiveDraft(
    @Query('flow') flow: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!flow) {
      throw new BadRequestException('flow query parameter is required');
    }
    if (!actor?.sub) {
      throw new BadRequestException('Authenticated user required');
    }
    return this.ticketsService.getActiveDraft({
      consumerId: actor.sub,
      flow,
    });
  }

  @RequirePermissions('tickets.read')
  @Get('intake-drafts/:id')
  getDraft(@Param('id') id: string) {
    return this.ticketsService.getIntakeDraft(id);
  }

  @RequirePermissions('tickets.write')
  @Delete('intake-drafts/active')
  deleteActiveDraft(
    @Query('flow') flow: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!flow) {
      throw new BadRequestException('flow query parameter is required');
    }
    if (!actor?.sub) {
      throw new BadRequestException('Authenticated user required');
    }
    return this.ticketsService.deleteActiveDraft({
      consumerId: actor.sub,
      flow,
      actorUserId: actor.sub,
      actorEmail: actor.email,
    });
  }

  @RequirePermissions('tickets.read')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser | undefined) {
    return this.ticketsService.findOne(
      id,
      user ? { role: user.role, userId: user.sub } : undefined,
    );
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
    return this.ticketsService.updateStatus(id, dto.status, dto.note, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Patch(':id/status-override')
  overrideStatus(
    @Param('id') id: string,
    @Body() dto: StatusOverrideDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.overrideStatus(id, dto.status, {
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
  @Post(':id/clerk-charges')
  saveClerkCharges(
    @Param('id') id: string,
    @Body() dto: FinalizeRemainderDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.saveClerkCharges(id, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('finance.write')
  @Post(':id/finalize-remainder')
  finalizeRemainder(
    @Param('id') id: string,
    @Body() dto: FinalizeRemainderDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.finalizeRemainder(id, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Post(':id/clerk-costs')
  submitClerkCosts(
    @Param('id') id: string,
    @Body() dto: SubmitClerkCostsDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.submitClerkCosts(id, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Post(':id/accept-assignment')
  acceptAssignment(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.acceptAssignment(id, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Post(':id/reject-assignment')
  rejectAssignment(
    @Param('id') id: string,
    @Body() dto: RejectAssignmentDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.rejectAssignment(id, dto.reason, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Post('assign-bulk')
  assignBulk(
    @Body() dto: AssignBulkDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.assignBulk(dto, {
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
        destination: (_req, _file, cb) =>
          cb(null, getUploadsBucketDir(UPLOADS_BUCKETS.ticketDocuments)),
        filename: (_req, file, callback) => {
          const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          const ext = extname(sanitized);
          callback(
            null,
            `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`,
          );
        },
      }),
      limits: {
        fileSize: MAX_UPLOAD_SIZE_BYTES,
      },
      fileFilter: (_req, file, callback) => {
        const extension = extname(file.originalname).toLowerCase();
        const isAllowedMime = ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype);
        const isAllowedExtension = ALLOWED_UPLOAD_EXTENSIONS.has(extension);
        if (!isAllowedMime || !isAllowedExtension) {
          callback(
            new BadRequestException(
              'Unsupported file type. Allowed: pdf, jpg, jpeg, png, doc, docx',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile()
    file: { filename: string; mimetype: string; path: string },
    @Body('caption') caption: string | undefined,
    @Body('visibleToConsumer') visibleToConsumer: string | undefined,
    @Body('category') category: 'WORK_DOCUMENT' | 'DELIVERABLE_PDF' | undefined,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.ticketsService.uploadDocument(
      id,
      file,
      {
        actorUserId: actor?.sub,
        actorEmail: actor?.email,
      },
      typeof caption === 'string' ? caption.slice(0, 200) : undefined,
      visibleToConsumer === 'true',
      category === 'DELIVERABLE_PDF' ? 'DELIVERABLE_PDF' : 'WORK_DOCUMENT',
    );
  }

  @RequirePermissions('tickets.read')
  @Get(':id/documents/:docId/download')
  async downloadDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @CurrentUser() user: JwtUser | undefined,
    @Res() res: Response,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('Authenticated user required');
    }
    const { filePath, name, type } =
      await this.ticketsService.resolveDocumentDownload(id, docId, {
        userId: user.sub,
        role: user.role,
        consumerId: user.sub,
      });
    res.setHeader('Content-Type', type);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(name)}"`,
    );
    return createReadStream(filePath).pipe(res);
  }

  @RequirePermissions('tickets.write')
  @Patch(':id/documents/:docId')
  patchDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: PatchDocumentDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.patchDocument(id, docId, dto, {
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

  @RequirePermissions('tickets.write')
  @Throttle({ upload: { limit: 10, ttl: 60_000 } })
  @Post(':id/clerk-receipt')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) =>
          cb(null, getUploadsBucketDir(UPLOADS_BUCKETS.clerkReceipts)),
        filename: (_req, file, callback) => {
          const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          const ext = extname(sanitized);
          callback(
            null,
            `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`,
          );
        },
      }),
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        const allowed = new Set(['.jpg', '.jpeg', '.png', '.pdf']);
        const allowedMime = new Set([
          'image/jpeg',
          'image/png',
          'application/pdf',
        ]);
        const ext = extname(file.originalname).toLowerCase();
        if (!allowedMime.has(file.mimetype) || !allowed.has(ext)) {
          callback(
            new BadRequestException('Allowed formats: JPG, PNG, PDF'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  submitClerkReceipt(
    @Param('id') id: string,
    @UploadedFile()
    file: { filename: string; mimetype: string; path: string } | undefined,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    if (!file) throw new BadRequestException('Receipt image is required');
    return this.ticketsService.submitClerkReceipt(id, file.path, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Post(':id/clerk-receipt/verify')
  verifyClerkReceipt(
    @Param('id') id: string,
    @Body('decision') decision: 'VERIFIED' | 'REJECTED',
    @CurrentUser() actor: JwtUser | undefined,
    @Body('reason') reason?: string,
  ) {
    return this.ticketsService.verifyClerkReceipt(id, decision, reason, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('tickets.write')
  @Post(':id/next-hearing')
  recordNextHearing(
    @Param('id') id: string,
    @Body() dto: RecordNextHearingDto,
  ) {
    return this.ticketsService.recordNextHearing(id, dto);
  }

  @RequirePermissions('tickets.write')
  @Post(':id/generate-next-hearing')
  generateNextHearing(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.ticketsService.generateNextHearing(id, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }
}
