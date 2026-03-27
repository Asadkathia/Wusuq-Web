import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  TicketPaymentStatus,
  type Prisma,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
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

  async findAll(query: PaginationQueryDto) {
    const skip = (query.page - 1) * query.limit;

    const where = query.search
      ? {
          OR: [
            {
              batchNo: { contains: query.search, mode: 'insensitive' as const },
            },
            {
              consumer: {
                name: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            },
          ],
        }
      : {};

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
            discountPrice: toNumber(ticket.discountPrice),
            additionalServiceCost: toNumber(ticket.additionalServiceCost),
          },
          totalAmount,
          amountPaid,
          remaining: totalAmount - amountPaid,
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

    const amountPaid = toNumber(ticket.amountPaid);
    if (dto.amount < amountPaid) {
      throw new BadRequestException(
        `New total (${dto.amount}) cannot be less than amount already paid (${amountPaid}).`,
      );
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        totalAmount: dto.amount,
        ...(dto.nonAttestedCharges !== undefined && { nonAttestedCharges: dto.nonAttestedCharges }),
        ...(dto.discountPrice !== undefined && { discountPrice: dto.discountPrice }),
      },
    });

    await this.auditLogsService.create({
      action: 'FINANCE_CHARGE_UPDATED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { previousAmount: toNumber(ticket.totalAmount), newAmount: dto.amount, note: dto.note },
    });

    return {
      ticketId,
      totalAmount: toNumber(updated.totalAmount),
      remaining: toNumber(updated.totalAmount) - amountPaid,
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

  async downloadInvoice(ticketId: string) {
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

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const lines = [
      `Invoice No: ${invoice.invoiceNo}`,
      `Batch No: ${invoice.ticket.batchNo}`,
      `Consumer: ${invoice.ticket.consumer.name}`,
      `Service: ${invoice.ticket.service.name}`,
      `Category: ${invoice.ticket.service.category}`,
      `Total Amount: ${toNumber(invoice.totalAmount)}`,
      `Amount Paid: ${toNumber(invoice.amountPaid)}`,
      `Due Amount: ${toNumber(invoice.dueAmount)}`,
      `Status: ${invoice.status}`,
      `Generated At: ${invoice.createdAt.toISOString()}`,
    ];

    return {
      ticketId,
      invoiceNo: invoice.invoiceNo,
      filename: `${invoice.invoiceNo}.txt`,
      contentType: 'text/plain',
      content: lines.join('\n'),
    };
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
