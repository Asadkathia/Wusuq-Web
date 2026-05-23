import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from './providers/payment-provider.interface';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  async initiate(ticketId: string, consumerId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.consumerId !== consumerId) {
      throw new ForbiddenException('Forbidden: ticket not owned by consumer');
    }
    if (ticket.status !== 'UNPAID') {
      throw new BadRequestException('Ticket is not awaiting payment');
    }

    const returnUrl = this.config.get<string>('PAYMENT_RETURN_URL')!;
    const notifyUrl = this.config.get<string>('PAYMENT_NOTIFY_URL')!;
    const result = await this.provider.initiate({
      ticketId: ticket.id,
      amount: new Decimal(ticket.totalAmount),
      currency: 'PKR',
      consumerId,
      returnUrl,
      notifyUrl,
    });

    const payment = await this.prisma.payment.create({
      data: {
        ticketId: ticket.id,
        provider: this.provider.name,
        providerTxnId: result.providerTxnId,
        status: 'INITIATED',
        amount: new Decimal(ticket.totalAmount),
        rawRequest: result.rawRequest as Prisma.InputJsonValue,
      },
    });

    return {
      paymentId: payment.id,
      providerTxnId: result.providerTxnId,
      redirectUrl: result.redirectUrl,
    };
  }

  async getById(paymentId: string, consumerId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        ticket: { select: { consumerId: true, status: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.ticket.consumerId !== consumerId) {
      throw new ForbiddenException('Forbidden');
    }
    return {
      id: payment.id,
      status: payment.status,
      ticketStatus: payment.ticket.status,
    };
  }

  async getByProviderTxnId(providerTxnId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerTxnId },
      include: { ticket: { select: { id: true, status: true } } },
    });
    if (!payment) return null;
    return {
      id: payment.id,
      status: payment.status,
      ticketId: payment.ticket.id,
      ticketStatus: payment.ticket.status,
    };
  }

  async handleWebhook(
    providerName: string,
    body: unknown,
    headers: Record<string, string>,
  ) {
    if (providerName.toUpperCase() !== this.provider.name) {
      throw new BadRequestException('Provider mismatch');
    }
    const verified = this.provider.verifyCallback(body, headers);
    if (!verified.signatureValid) {
      throw new ForbiddenException('Invalid signature');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { providerTxnId: verified.providerTxnId },
      include: {
        ticket: { select: { id: true, totalAmount: true, serviceCost: true, status: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    // Idempotency — terminal states no-op.
    if (payment.status !== 'INITIATED') {
      return { ok: true, idempotent: true };
    }

    if (verified.status === 'SUCCESS') {
      if (
        new Decimal(verified.amount).comparedTo(
          new Decimal(payment.ticket.totalAmount),
        ) !== 0
      ) {
        throw new BadRequestException('Webhook amount mismatch');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCESS',
            completedAt: new Date(),
            rawCallback: body as Prisma.InputJsonValue,
          },
        });
        const newAmountPaid = new Decimal(payment.ticket.totalAmount);
        const ticketData: { amountPaid: Decimal; status?: TicketStatus } = {
          amountPaid: newAmountPaid,
        };
        if (
          payment.ticket.status === 'UNPAID' &&
          newAmountPaid.gte(new Decimal(payment.ticket.serviceCost))
        ) {
          ticketData.status = 'PAID';
        }
        await tx.ticket.update({
          where: { id: payment.ticket.id },
          data: ticketData,
        });
        await tx.invoice.upsert({
          where: { ticketId: payment.ticket.id },
          create: {
            ticketId: payment.ticket.id,
            invoiceNo: `INV-${Date.now()}-${payment.ticket.id.slice(-6)}`,
            totalAmount: new Decimal(payment.ticket.totalAmount),
            amountPaid: new Decimal(payment.ticket.totalAmount),
            dueAmount: new Decimal(0),
            status: 'PAID',
            paidAt: new Date(),
          },
          update: {
            amountPaid: new Decimal(payment.ticket.totalAmount),
            dueAmount: new Decimal(0),
            status: 'PAID',
            paidAt: new Date(),
          },
        });
      });

      await this.auditLogs.create({
        action: 'PAYMENT_COMPLETED',
        entity: 'TICKET',
        entityId: payment.ticket.id,
        metadata: {
          paymentId: payment.id,
          providerTxnId: verified.providerTxnId,
        },
      });
      await this.dispatcher
        .paymentCompleted(payment.ticket.id)
        .catch(() => undefined);
      return { ok: true };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: verified.status,
        completedAt: new Date(),
        rawCallback: body as Prisma.InputJsonValue,
        failureReason: verified.status,
      },
    });
    return { ok: true, status: verified.status };
  }

  // Mock-only helper called by the dev mock-checkout page. Synthesises a webhook
  // body + signed header and routes through handleWebhook so the integration is
  // exercised identically in dev and prod.
  async devResolveMock(
    providerTxnId: string,
    outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED',
  ) {
    if (this.provider.name !== 'MOCK') {
      throw new ForbiddenException('Mock-resolve disabled');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { providerTxnId },
      include: { ticket: { select: { totalAmount: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return this.handleWebhook(
      'mock',
      {
        providerTxnId,
        status: outcome,
        amount: Number(payment.ticket.totalAmount),
      },
      { 'x-mock-signature': 'mock-signed' },
    );
  }
}
