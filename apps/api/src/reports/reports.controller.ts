import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
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
  @Get('export/csv')
  async exportCsv(
    @Query('type') type: string,
    @Query('dateRange') dateRange: string | undefined,
    @Query('status') status: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.run(type ?? 'logs', {
      dateRange,
      status,
    });
    const payload: unknown = result.data;
    const rows: Record<string, unknown>[] = Array.isArray(payload)
      ? (payload as Record<string, unknown>[])
      : [];

    if (rows.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="report-${type ?? 'export'}.csv"`,
      );
      return res.send('No data');
    }

    const headers = Object.keys(rows[0] ?? {});
    const stringify = (v: unknown): string => {
      if (v == null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      return '';
    };
    const csvRow = (obj: Record<string, unknown>) =>
      headers
        .map((h) => `"${stringify(obj[h]).replace(/"/g, '""')}"`)
        .join(',');
    const csv = [headers.join(','), ...rows.map(csvRow)].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-${type ?? 'export'}.csv"`,
    );
    return res.send(csv);
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
