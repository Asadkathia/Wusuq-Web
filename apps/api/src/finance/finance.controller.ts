import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { FinanceService } from './finance.service';
import { ReconcilePaymentDto } from './dto/reconcile-payment.dto';

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @RequirePermissions('finance.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.financeService.findAll(query);
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
}
