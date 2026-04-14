import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  TicketPaymentStatus,
  type Prisma,
} from '@prisma/client';
import PDFDocument from 'pdfkit';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceQueryDto } from './dto/finance-query.dto';
import { ReconcilePaymentDto } from './dto/reconcile-payment.dto';
import { UpdateChargeDto } from './dto/update-charge.dto';

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  return Number(value ?? 0);
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(query: FinanceQueryDto) {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.TicketWhereInput = {};

    if (query.search) {
      where.OR = [
        { batchNo: { contains: query.search, mode: 'insensitive' } },
        { consumer: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus as any;
    if (query.ticketStatus) where.status = query.ticketStatus as any;
    if (query.serviceId) where.serviceId = query.serviceId;
    if (query.consumerId) where.consumerId = query.consumerId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          consumer: { select: { id: true, name: true } },
          service: {
            select: { id: true, name: true, category: true, type: true },
          },
          invoice: true,
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    const summary = items.reduce(
      (acc, ticket) => {
        acc.totalAmount += toNumber(ticket.totalAmount);
        acc.paidAmount += toNumber(ticket.amountPaid);
        return acc;
      },
      { totalAmount: 0, paidAmount: 0 },
    );

    return {
      items: items.map((ticket) => {
        const totalAmount = toNumber(ticket.totalAmount);
        const amountPaid = toNumber(ticket.amountPaid);
        return {
          id: ticket.id,
          batchNo: ticket.batchNo,
          consumer: ticket.consumer,
          service: ticket.service,
          serviceCity: ticket.serviceCity,
          caseType: ticket.caseType,
          charges: {
            serviceCost: toNumber(ticket.serviceCost),
            deliveryCharges: toNumber(ticket.deliveryCharges),
            printingCharges: toNumber(ticket.printingCharges),
            attestedCharges: toNumber(ticket.attestedCharges),
            nonAttestedCharges: toNumber(ticket.nonAttestedCharges),
            additionalCharges: toNumber(ticket.additionalCharges),
            additionalServiceCost: toNumber(ticket.additionalServiceCost),
            discountPrice: toNumber(ticket.discountPrice),
          },
          totalAmount,
          amountPaid,
          remaining: totalAmount - amountPaid,
          clerkPayout:
            toNumber(ticket.clerkCost) +
            toNumber(ticket.deliveryCharges) +
            toNumber(ticket.printingCharges) +
            toNumber(ticket.additionalCharges) +
            toNumber(ticket.attestedCharges) +
            toNumber(ticket.nonAttestedCharges),
          paymentStatus: ticket.paymentStatus,
          invoice: ticket.invoice,
        };
      }),
      page: query.page,
      limit: query.limit,
      total,
      summary: {
        totalAmount: summary.totalAmount,
        paidAmount: summary.paidAmount,
        remainingAmount: summary.totalAmount - summary.paidAmount,
      },
    };
  }

  async reconcilePayment(
    ticketId: string,
    dto: ReconcilePaymentDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { invoice: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const total = toNumber(ticket.totalAmount);
    const paidBefore = toNumber(ticket.amountPaid);
    const remainingBefore = Math.max(total - paidBefore, 0);
    if (dto.amount > remainingBefore) {
      throw new BadRequestException(
        `Payment exceeds remaining balance (${remainingBefore}).`,
      );
    }
    const paidAfter = paidBefore + dto.amount;
    const dueAfter = Math.max(total - paidAfter, 0);

    const paymentStatus: TicketPaymentStatus =
      dueAfter <= 0
        ? TicketPaymentStatus.PAID
        : TicketPaymentStatus.PARTIALLY_PAID;

    const updatedTicket = await this.prisma.$transaction(async (tx) => {
      const nextTicket = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          amountPaid: paidAfter,
          paymentStatus,
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId: ticket.consumerId,
          ticketId,
          amount: dto.amount,
          paymentMode: dto.paymentMode,
          currency: dto.currency ?? 'PKR',
          status: 'VERIFIED',
          verifiedAt: new Date(),
          reviewedByUserId: actor?.actorUserId,
          note: dto.note,
        },
      });

      await this.upsertInvoice(ticketId, total, paidAfter, tx);
      return nextTicket;
    });

    await this.auditLogsService.create({
      action: 'FINANCE_PAYMENT_RECONCILED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        amount: dto.amount,
        paymentMode: dto.paymentMode,
      },
    });

    return {
      ticketId,
      amountPaid: toNumber(updatedTicket.amountPaid),
      remaining: dueAfter,
      paymentStatus,
    };
  }

  async updateCharge(
    ticketId: string,
    dto: UpdateChargeDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Merge incoming charge fields with existing values
    const serviceCost = dto.serviceCost ?? toNumber(ticket.serviceCost);
    const deliveryCharges = dto.deliveryCharges ?? toNumber(ticket.deliveryCharges);
    const printingCharges = dto.printingCharges ?? toNumber(ticket.printingCharges);
    const attestedCharges = dto.attestedCharges ?? toNumber(ticket.attestedCharges);
    const nonAttestedCharges = dto.nonAttestedCharges ?? toNumber(ticket.nonAttestedCharges);
    const additionalCharges = dto.additionalCharges ?? toNumber(ticket.additionalCharges);
    const additionalServiceCost = dto.additionalServiceCost ?? toNumber(ticket.additionalServiceCost);
    const discountPrice = dto.discountPrice ?? toNumber(ticket.discountPrice);

    // Auto-compute totalAmount from formula; explicit `amount` overrides formula
    const computedTotal =
      serviceCost + deliveryCharges + printingCharges + attestedCharges +
      nonAttestedCharges + additionalCharges + additionalServiceCost - discountPrice;
    const totalAmount = dto.amount ?? Math.max(computedTotal, 0);
    if (totalAmount < Number(serviceCost ?? 0)) {
      throw new BadRequestException(
        'Total charges cannot be less than the service cost',
      );
    }

    const amountPaid = toNumber(ticket.amountPaid);
    if (totalAmount < amountPaid) {
      throw new BadRequestException(
        `New total (${totalAmount}) cannot be less than amount already paid (${amountPaid}).`,
      );
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        serviceCost,
        deliveryCharges,
        printingCharges,
        attestedCharges,
        nonAttestedCharges,
        additionalCharges,
        additionalServiceCost,
        discountPrice,
        totalAmount,
      },
    });

    await this.auditLogsService.create({
      action: 'FINANCE_CHARGE_UPDATE',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { changes: dto as Prisma.InputJsonValue },
    });

    return {
      ticketId,
      totalAmount: toNumber(updated.totalAmount),
      charges: {
        serviceCost: toNumber(updated.serviceCost),
        deliveryCharges: toNumber(updated.deliveryCharges),
        printingCharges: toNumber(updated.printingCharges),
        attestedCharges: toNumber(updated.attestedCharges),
        nonAttestedCharges: toNumber(updated.nonAttestedCharges),
        additionalCharges: toNumber(updated.additionalCharges),
        additionalServiceCost: toNumber(updated.additionalServiceCost),
        discountPrice: toNumber(updated.discountPrice),
      },
      remaining: toNumber(updated.totalAmount) - amountPaid,
      clerkPayout:
        toNumber(updated.clerkCost) +
        toNumber(updated.deliveryCharges) +
        toNumber(updated.printingCharges) +
        toNumber(updated.additionalCharges) +
        toNumber(updated.attestedCharges) +
        toNumber(updated.nonAttestedCharges),
    };
  }

  async generateInvoice(
    ticketId: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const total = toNumber(ticket.totalAmount);
    const paid = toNumber(ticket.amountPaid);
    const invoice = await this.upsertInvoice(ticketId, total, paid);

    await this.auditLogsService.create({
      action: 'INVOICE_GENERATED',
      entity: 'INVOICE',
      entityId: invoice.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { ticketId },
    });

    return invoice;
  }

  async downloadInvoice(ticketId: string): Promise<{
    ticketId: string;
    invoiceNo: string;
    filename: string;
    contentType: string;
    content: string;
  }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { ticketId },
      include: {
        ticket: {
          include: {
            consumer: { select: { name: true, email: true } },
            service: { select: { name: true, category: true } },
          },
        },
      },
    });

    // Fetch charge breakdown from ticket separately
    const ticketCharges = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        serviceCost: true,
        deliveryCharges: true,
        printingCharges: true,
        attestedCharges: true,
        nonAttestedCharges: true,
        additionalCharges: true,
        additionalServiceCost: true,
        discountPrice: true,
        clerkCost: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const pdfBase64 = await this.buildInvoicePdf(invoice, ticketCharges ?? undefined);

    return {
      ticketId,
      invoiceNo: invoice.invoiceNo,
      filename: `${invoice.invoiceNo}.pdf`,
      contentType: 'application/pdf',
      content: pdfBase64,
    };
  }

  private buildInvoicePdf(
    invoice: {
      invoiceNo: string;
      totalAmount: Prisma.Decimal | number;
      amountPaid: Prisma.Decimal | number;
      dueAmount: Prisma.Decimal | number;
      status: string;
      createdAt: Date;
      ticket: {
        batchNo: string;
        consumer: { name: string; email: string };
        service: { name: string; category: string };
      };
    },
    charges?: {
      serviceCost: Prisma.Decimal | number;
      deliveryCharges: Prisma.Decimal | number;
      printingCharges: Prisma.Decimal | number;
      attestedCharges: Prisma.Decimal | number;
      nonAttestedCharges: Prisma.Decimal | number;
      additionalCharges: Prisma.Decimal | number;
      additionalServiceCost: Prisma.Decimal | number;
      discountPrice: Prisma.Decimal | number;
      clerkCost: Prisma.Decimal | number;
    },
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('WUSUQ', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text('Paralegal Services Portal', { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      // Invoice title
      doc.fontSize(16).font('Helvetica-Bold').text(`INVOICE`, { align: 'center' });
      doc.moveDown(0.5);

      // Info grid
      const row = (label: string, value: string) => {
        doc.fontSize(10).font('Helvetica-Bold').text(label, { continued: true });
        doc.font('Helvetica').text(`  ${value}`);
      };

      row('Invoice No:', invoice.invoiceNo);
      row('Batch No:', invoice.ticket.batchNo);
      row('Date:', invoice.createdAt.toLocaleDateString('en-PK'));
      row('Status:', invoice.status);
      doc.moveDown(0.5);

      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      // Consumer & service
      doc.fontSize(11).font('Helvetica-Bold').text('Bill To:');
      doc.fontSize(10).font('Helvetica').text(invoice.ticket.consumer.name);
      doc.text(invoice.ticket.consumer.email);
      doc.moveDown(0.5);

      doc.fontSize(11).font('Helvetica-Bold').text('Service:');
      doc.fontSize(10).font('Helvetica').text(`${invoice.ticket.service.name} (${invoice.ticket.service.category})`);
      doc.moveDown(1);

      // Charges breakdown table
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      const amtRow = (label: string, value: number, bold = false, color = 'black') => {
        const font = bold ? 'Helvetica-Bold' : 'Helvetica';
        doc.fontSize(10).font(font).fillColor(color).text(label, 50, doc.y, { width: 400, continued: true });
        doc.font(font).fillColor(color).text(`PKR ${value.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`, { align: 'right' });
        doc.fillColor('black');
      };

      // Itemized charge lines (skip zero values)
      if (charges) {
        doc.fontSize(10).font('Helvetica-Bold').text('Charges Breakdown:');
        doc.moveDown(0.25);
        const lines: [string, number][] = [
          ['Service Cost', toNumber(charges.serviceCost)],
          ['Delivery Charges', toNumber(charges.deliveryCharges)],
          ['Printing Charges', toNumber(charges.printingCharges)],
          ['Attested Charges', toNumber(charges.attestedCharges)],
          ['Non-Attested Charges', toNumber(charges.nonAttestedCharges)],
          ['Additional Charges', toNumber(charges.additionalCharges)],
          ['Additional Service Cost', toNumber(charges.additionalServiceCost)],
          ['Clerk Cost', toNumber(charges.clerkCost)],
        ];
        for (const [label, value] of lines) {
          if (value > 0) amtRow(label, value);
        }
        const discount = toNumber(charges.discountPrice);
        if (discount > 0) amtRow('Discount', -discount, false, 'green');
        doc.moveDown(0.25);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
        doc.moveDown(0.25);
      }

      amtRow('Total Amount', toNumber(invoice.totalAmount), true);
      amtRow('Amount Paid', toNumber(invoice.amountPaid));
      doc.moveDown(0.25);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.25);
      amtRow('Due Amount', toNumber(invoice.dueAmount), true, toNumber(invoice.dueAmount) > 0 ? 'red' : 'green');

      doc.moveDown(2);
      doc.fontSize(9).font('Helvetica').fillColor('grey').text('This is a computer-generated invoice. No signature required.', { align: 'center' });

      doc.end();
    });
  }

  async sendInvoice(
    ticketId: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { ticketId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const sent = await this.prisma.invoice.update({
      where: { ticketId },
      data: {
        sentAt: new Date(),
        status:
          toNumber(invoice.dueAmount) <= 0
            ? InvoiceStatus.PAID
            : toNumber(invoice.amountPaid) > 0
              ? InvoiceStatus.PARTIALLY_PAID
              : InvoiceStatus.SENT,
      },
    });

    await this.auditLogsService.create({
      action: 'INVOICE_SENT',
      entity: 'INVOICE',
      entityId: sent.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { ticketId },
    });

    return { success: true, invoice: sent };
  }

  private async upsertInvoice(
    ticketId: string,
    totalAmount: number,
    amountPaid: number,
    prismaClient: Pick<PrismaService, 'invoice'> = this.prisma,
  ) {
    const dueAmount = Math.max(totalAmount - amountPaid, 0);

    const status: InvoiceStatus =
      dueAmount <= 0
        ? InvoiceStatus.PAID
        : amountPaid > 0
          ? InvoiceStatus.PARTIALLY_PAID
          : InvoiceStatus.GENERATED;

    return prismaClient.invoice.upsert({
      where: { ticketId },
      update: {
        totalAmount,
        amountPaid,
        dueAmount,
        status,
        ...(status === InvoiceStatus.PAID ? { paidAt: new Date() } : {}),
      },
      create: {
        ticketId,
        invoiceNo: this.generateInvoiceNo(),
        totalAmount,
        amountPaid,
        dueAmount,
        status,
        ...(status === InvoiceStatus.PAID ? { paidAt: new Date() } : {}),
      },
    });
  }

  private generateInvoiceNo() {
    const stamp = Date.now().toString().slice(-8);
    const rand = Math.floor(Math.random() * 9000 + 1000);
    return `INV-${stamp}-${rand}`;
  }
}
