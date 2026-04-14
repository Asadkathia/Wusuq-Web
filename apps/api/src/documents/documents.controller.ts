import { Controller, Get, Query, Res } from '@nestjs/common';
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
    const consumerRoles = ['consumer', 'lawyer', 'company'];
    if (user && consumerRoles.includes(user.role)) {
      query.consumerId = user.sub;
    }
    return this.documentsService.list(query);
  }

  @RequirePermissions('documents.read')
  @Get('export')
  async export(@Query('format') format: string, @Res() res: Response) {
    const data = await this.documentsService.list({ page: 1, limit: 5000 } as any);
    const rows = data.items as any[];

    if (format === 'csv') {
      const header = 'Name,Type,Batch No,Consumer,Date Logged,File URL';
      const lines = rows.map((r: any) =>
        [
          r.name ?? '',
          r.type ?? '',
          r.ticket?.batchNo ?? '',
          r.ticket?.consumer?.name ?? '',
          r.createdAt ?? '',
          r.fileUrl ?? '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
      const csv = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="documents-export.csv"');
      return res.send(csv);
    }

    res.json(data);
  }
}
