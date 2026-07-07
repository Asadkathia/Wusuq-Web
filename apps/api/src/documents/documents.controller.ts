import { Controller, Get, Query, Res } from '@nestjs/common';
import { isConsumerRole } from '@wusuq/shared';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @RequirePermissions('documents.read')
  @Get()
  list(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: JwtUser | undefined,
  ) {
    const forConsumer = Boolean(user && isConsumerRole(user.role));
    // `representative` is NOT consumer-class — without this branch a rep's
    // request fell through unfiltered and a client `?consumerId=<anyone>`
    // was honoured verbatim (H1 IDOR). Reps are scoped server-side to their
    // assigned tickets; any client-supplied consumerId is ignored.
    const forRepresentative = user?.role === 'representative';
    if (forConsumer) {
      query.consumerId = user!.sub;
    }
    return this.documentsService.list(query, {
      forConsumer,
      forRepresentative,
      representativeId: user?.sub,
    });
  }

  @RequirePermissions('documents.read')
  @Get('export')
  async export(
    @Query('format') format: string,
    @CurrentUser() user: JwtUser | undefined,
    @Res() res: Response,
  ) {
    // Same consumer scoping as `list` — without it the export dumped every
    // consumer's documents to any documents.read holder (audit 3.3a).
    // `forConsumer` additionally filters to only downloadable deliverables
    // (visibleToConsumer + COMPLETED/DELIVERED) — B1/B2, otherwise the
    // export listed internal WORK_DOCUMENTs / in-flight-ticket docs whose
    // Download button then 403'd.
    const forConsumer = Boolean(user && isConsumerRole(user.role));
    // Same H1 IDOR guard as `list` — a rep is scoped to their assigned
    // tickets server-side, never to a client-supplied consumerId.
    const forRepresentative = user?.role === 'representative';
    const data = await this.documentsService.list(
      {
        page: 1,
        limit: 5000,
        ...(forConsumer ? { consumerId: user!.sub } : {}),
      } as PaginationQueryDto,
      { forConsumer, forRepresentative, representativeId: user?.sub },
    );
    const rows = data.items;

    if (format === 'csv') {
      const header = 'Name,Type,Batch No,Consumer,Date Logged,File URL';
      const lines = rows.map((r) =>
        [
          r.name ?? '',
          r.type ?? '',
          r.ticket?.batchNo ?? '',
          r.ticket?.consumer?.name ?? '',
          r.createdAt instanceof Date ? r.createdAt.toISOString() : '',
          r.fileUrl ?? '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
      const csv = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="documents-export.csv"',
      );
      return res.send(csv);
    }

    res.json(data);
  }
}
