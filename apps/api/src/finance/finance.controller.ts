import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { FinanceService } from './finance.service';
import { ReconcilePaymentDto } from './dto/reconcile-payment.dto';
import { UpdateChargeDto } from './dto/update-charge.dto';

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @RequirePermissions('finance.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.financeService.findAll(query);
  }

  @RequirePermissions('finance.write')
  @Patch(':ticketId/charge')
  updateCharge(
    @Param('ticketId') ticketId: string,
    @Body() dto: UpdateChargeDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.financeService.updateCharge(ticketId, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('finance.write')
  @Post(':ticketId/reconcile')
  reconcile(
    @Param('ticketId') ticketId: string,
    @Body() dto: ReconcilePaymentDto,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.financeService.reconcilePayment(ticketId, dto, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('finance.write')
  @Post(':ticketId/invoice/generate')
  generateInvoice(
    @Param('ticketId') ticketId: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.financeService.generateInvoice(ticketId, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('finance.read')
  @Get(':ticketId/invoice/download')
  downloadInvoice(@Param('ticketId') ticketId: string) {
    return this.financeService.downloadInvoice(ticketId);
  }

  @RequirePermissions('finance.write')
  @Post(':ticketId/invoice/send')
  sendInvoice(
    @Param('ticketId') ticketId: string,
    @CurrentUser() actor: JwtUser | undefined,
  ) {
    return this.financeService.sendInvoice(ticketId, {
      actorUserId: actor?.sub,
      actorEmail: actor?.email,
    });
  }

  @RequirePermissions('finance.read')
  @Get('export')
  async export(@Query('format') format: string, @Res() res: Response) {
    const data = await this.financeService.findAll({ page: 1, limit: 5000 } as any);
    const rows = data.items as any[];

    if (format === 'csv') {
      const header = 'Batch No,Consumer,Service,Service City,Case Type,Total,Paid,Remaining,Status';
      const lines = rows.map((r: any) =>
        [
          r.batchNo ?? '',
          r.consumer?.name ?? '',
          r.service?.name ?? '',
          r.serviceCity ?? '',
          r.caseType ?? '',
          r.totalAmount ?? 0,
          r.amountPaid ?? 0,
          r.remaining ?? 0,
          r.paymentStatus ?? '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
      const csv = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="finance-export.csv"');
      return res.send(csv);
    }

    res.json(data);
  }
}
