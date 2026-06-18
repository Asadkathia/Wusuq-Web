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
    if (ticket.archivedAt) {
      // Soft-deleted tickets are invisible everywhere money is tracked —
      // taking a payment against one parks real money on a ghost ticket.
      throw new BadRequestException('Ticket is no longer payable');
    }
    if (ticket.status !== 'UNPAID') {
      throw new BadRequestException('Ticket is not awaiting payment');
    }

    // Audit 1.6: charge the REMAINING due, not the full total — a consumer
    // with a partial wallet payment must not pay the covered part again.
    const remainingDue = new Decimal(ticket.totalAmount).minus(
      new Decimal(ticket.amountPaid ?? 0),
    );
    if (remainingDue.lte(0)) {
      throw new BadRequestException('Ticket is already fully paid');
    }

    // Only ONE live payment per ticket: cancel any prior INITIATED rows so a
    // second tab / retry can't produce two completable gateway sessions whose
    // webhooks would BOTH increment amountPaid (double charge).
    await this.prisma.payment.updateMany({
      where: { ticketId: ticket.id, status: 'INITIATED' },
      data: {
        status: 'CANCELLED',
        failureReason: 'superseded by a newer payment initiation',
        completedAt: new Date(),
      },
    });

    const returnUrl = this.config.get<string>('PAYMENT_RETURN_URL')!;
    const notifyUrl = this.config.get<string>('PAYMENT_NOTIFY_URL')!;
    const result = await this.provider.initiate({
      ticketId: ticket.id,
      amount: remainingDue,
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
        amount: remainingDue,
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
        ticket: {
          select: {
            id: true,
            totalAmount: true,
            serviceCost: true,
            status: true,
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    // Idempotency — terminal states no-op.
    if (payment.status !== 'INITIATED') {
      return { ok: true, idempotent: true };
    }

    if (verified.status === 'SUCCESS') {
      // Audit 1.6: the verified amount must match what this payment was
      // initiated for (the remaining due at initiation), not the ticket
      // total — the total may include amounts already covered by wallet.
      if (
        new Decimal(verified.amount).comparedTo(new Decimal(payment.amount)) !==
        0
      ) {
        throw new BadRequestException('Webhook amount mismatch');
      }

      const txOutcome = await this.prisma.$transaction(async (tx) => {
        // Serialize against wallet settlement / finalize on the same ticket.
        await tx.$executeRaw`SELECT id FROM "Ticket" WHERE id = ${payment.ticket.id} FOR UPDATE`;
        // Conditional INITIATED → SUCCESS flip is the idempotency gate: a
        // concurrent duplicate delivery matches 0 rows and must not credit.
        const flipped = await tx.payment.updateMany({
          where: { id: payment.id, status: 'INITIATED' },
          data: {
            status: 'SUCCESS',
            completedAt: new Date(),
            rawCallback: body as Prisma.InputJsonValue,
          },
        });
        if (flipped.count !== 1) {
          return { idempotent: true as const };
        }

        // Never SET amountPaid absolutely — prior wallet debits would vanish.
        const updatedTicket = await tx.ticket.update({
          where: { id: payment.ticket.id },
          data: { amountPaid: { increment: new Decimal(verified.amount) } },
          select: {
            amountPaid: true,
            totalAmount: true,
            serviceCost: true,
            status: true,
          },
        });
        if (
          updatedTicket.status === 'UNPAID' &&
          new Decimal(updatedTicket.amountPaid).gte(
            new Decimal(updatedTicket.serviceCost),
          )
        ) {
          await tx.ticket.updateMany({
            where: { id: payment.ticket.id, status: 'UNPAID' },
            data: { status: 'PAID' as TicketStatus },
          });
        }
        const newPaid = new Decimal(updatedTicket.amountPaid);
        const due = Decimal.max(
          new Decimal(updatedTicket.totalAmount).minus(newPaid),
          new Decimal(0),
        );
        await tx.invoice.upsert({
          where: { ticketId: payment.ticket.id },
          create: {
            ticketId: payment.ticket.id,
            invoiceNo: `INV-${Date.now()}-${payment.ticket.id.slice(-6)}`,
            totalAmount: new Decimal(updatedTicket.totalAmount),
            amountPaid: newPaid,
            dueAmount: due,
            status: due.lte(0)
              ? ('PAID' as const)
              : ('PARTIALLY_PAID' as const),
            paidAt: due.lte(0) ? new Date() : null,
          },
          update: {
            amountPaid: newPaid,
            dueAmount: due,
            status: due.lte(0)
              ? ('PAID' as const)
              : ('PARTIALLY_PAID' as const),
            paidAt: due.lte(0) ? new Date() : null,
          },
        });
        return { idempotent: false as const };
      });

      if (txOutcome.idempotent) {
        return { ok: true, idempotent: true };
      }

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

    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: 'INITIATED' },
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
    // Audit 1.6: never reachable in production (the factory also refuses to
    // construct the mock provider there — this is the belt to its suspenders).
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
    if (this.provider.name !== 'MOCK' || nodeEnv === 'production') {
      throw new ForbiddenException('Mock-resolve disabled');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { providerTxnId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return this.handleWebhook(
      'mock',
      {
        providerTxnId,
        status: outcome,
        // Echo back the initiated amount (the remaining due at initiation).
        amount: Number(payment.amount),
      },
      { 'x-mock-signature': 'mock-signed' },
    );
  }
}
