import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { toCurrency } from '@wusuq/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { RequirePermissions } from '../roles-permissions/decorators/permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';
import { renderInvoicePdf } from './invoice.pdf';

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Issue an invoice over N tickets. finance.write = super-admin only. */
  @RequirePermissions('finance.write')
  @Post()
  generate(@Body() dto: CreateInvoiceDto, @CurrentUser() actor: JwtUser) {
    return this.invoices.generate(dto.ticketIds, actor.sub);
  }

  /** Staff see all; a consumer sees their own. Scoped in-service by role. */
  @RequirePermissions('tickets.read')
  @Get()
  list(@CurrentUser() actor: JwtUser) {
    return this.invoices.list(actor);
  }

  @RequirePermissions('tickets.read')
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUser,
    @Res() res: Response,
  ) {
    // findOne 404s any caller who may not read this invoice (incl. reps).
    const inv = await this.invoices.findOne(id, actor);
    const [company, payment] = await Promise.all([
      this.settings.getCompanySettings(),
      this.prisma.paymentSettings.findFirst(),
    ]);

    const buf = await renderInvoicePdf({
      invoiceNo: inv.invoiceNo,
      issueDate: inv.issueDate,
      currency: toCurrency(inv.currency),
      company,
      billTo: {
        name: inv.consumer.name ?? 'Customer',
        address: inv.consumer.address,
        phone: inv.consumer.phone,
        email: inv.consumer.email,
      },
      lines: inv.items.map((i) => ({
        position: i.position,
        ticketId: i.ticketId,
        batchNo: i.batchNo,
        description: i.description,
        courtLine: i.courtLine,
        caseTitle: i.caseTitle,
        judge: i.judge,
        serviceCost: Number(i.serviceCost),
        printing: Number(i.printing),
        attested: Number(i.attested),
        nonAttested: Number(i.nonAttested),
        delivery: Number(i.delivery),
        additional: Number(i.additional),
        lineTotal: Number(i.lineTotal),
      })),
      subtotal: Number(inv.subtotal),
      discount: Number(inv.discount),
      taxRate: Number(inv.taxRate),
      taxAmount: Number(inv.taxAmount),
      grandTotal: Number(inv.grandTotal),
      payment,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${inv.invoiceNo}.pdf"`,
    );
    res.send(buf);
  }
}
