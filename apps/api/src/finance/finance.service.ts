import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import {
  computeClerkEarnings,
  computeTicketTotal,
  isBaseCovered,
} from '@wusuq/shared';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceQueryDto } from './dto/finance-query.dto';
import { ReconcilePaymentDto } from './dto/reconcile-payment.dto';
import { UpdateChargeDto } from './dto/update-charge.dto';

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  return Number(value ?? 0);
}

// The clerk's cut of the PDF surcharge only applies when the ticket actually
// purchased a PDF; that signal lives in the intake formPayload, not a column.
function wantPdfFromFormPayload(
  formPayload: Prisma.JsonValue | null | undefined,
) {
  return (
    ((formPayload ?? {}) as Record<string, unknown>)
      .want_pdf_before_dispatch === 'Yes'
  );
}

// Single call site for the finance payout figure: coerces Prisma's Decimal
// columns to numbers and delegates to the shared, capped definition — never
// hand-roll this sum (that drift is exactly what Task 6 closes).
function clerkPayoutFor(ticket: {
  clerkCost: Prisma.Decimal | number | string | null;
  attestedCharges: Prisma.Decimal | number | string | null;
  nonAttestedCharges: Prisma.Decimal | number | string | null;
  printingCharges: Prisma.Decimal | number | string | null;
  deliveryCharges: Prisma.Decimal | number | string | null;
  clerkAttestedCharges: Prisma.Decimal | number | string | null;
  clerkNonAttestedCharges: Prisma.Decimal | number | string | null;
  clerkPrintingCharges: Prisma.Decimal | number | string | null;
  clerkDeliveryCharges: Prisma.Decimal | number | string | null;
  formPayload: Prisma.JsonValue | null | undefined;
}) {
  return computeClerkEarnings({
    clerkCost: toNumber(ticket.clerkCost),
    attestedCharges: toNumber(ticket.attestedCharges),
    nonAttestedCharges: toNumber(ticket.nonAttestedCharges),
    printingCharges: toNumber(ticket.printingCharges),
    deliveryCharges: toNumber(ticket.deliveryCharges),
    clerkAttestedCharges:
      ticket.clerkAttestedCharges == null
        ? null
        : toNumber(ticket.clerkAttestedCharges),
    clerkNonAttestedCharges:
      ticket.clerkNonAttestedCharges == null
        ? null
        : toNumber(ticket.clerkNonAttestedCharges),
    clerkPrintingCharges:
      ticket.clerkPrintingCharges == null
        ? null
        : toNumber(ticket.clerkPrintingCharges),
    clerkDeliveryCharges:
      ticket.clerkDeliveryCharges == null
        ? null
        : toNumber(ticket.clerkDeliveryCharges),
    wantPdf: wantPdfFromFormPayload(ticket.formPayload),
  });
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
    if (query.ticketStatus)
      where.status = query.ticketStatus as Prisma.TicketWhereInput['status'];
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
          status: ticket.status,
          consumer: ticket.consumer,
          service: ticket.service,
          serviceCity: ticket.serviceCity,
          caseType: ticket.caseType,
          // Finance is a staff-only surface (no consumer/rep caller class
          // reaches this endpoint), so currency + fxRateToPkr need no
          // redaction gate here — the board uses them to render a USD
          // ticket's PKR equivalent via formatStaffMoney.
          currency: ticket.currency,
          fxRateToPkr: ticket.fxRateToPkr,
          charges: {
            serviceCost: toNumber(ticket.serviceCost),
            deliveryCharges: toNumber(ticket.deliveryCharges),
            printingCharges: toNumber(ticket.printingCharges),
            attestedCharges: toNumber(ticket.attestedCharges),
            nonAttestedCharges: toNumber(ticket.nonAttestedCharges),
            additionalCharges: toNumber(ticket.additionalCharges),
            additionalServiceCost: toNumber(ticket.additionalServiceCost),
            discountPrice: toNumber(ticket.discountPrice),
            taxRate: toNumber(ticket.taxRate),
            taxAmount: toNumber(ticket.taxAmount),
            promoDiscount: toNumber(ticket.promoDiscount),
          },
          totalAmount,
          amountPaid,
          remaining: totalAmount - amountPaid,
          clerkPayout: clerkPayoutFor(ticket),
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
    const { updatedTicket, dueAfter } = await this.prisma.$transaction(
      async (tx) => {
        // Acquire row-level lock to serialize concurrent reconciliations.
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;

        const ticket = await tx.ticket.findUnique({
          where: { id: ticketId },
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

        const ticketUpdateData: { amountPaid: number; status?: TicketStatus } =
          {
            amountPaid: paidAfter,
          };
        if (
          ticket.status === 'UNPAID' &&
          isBaseCovered({
            amountPaid: paidAfter,
            serviceCost: ticket.serviceCost,
          })
        ) {
          ticketUpdateData.status = 'PAID';
        }

        const nextTicket = await tx.ticket.update({
          where: { id: ticketId },
          data: ticketUpdateData,
        });

        await tx.walletTransaction.create({
          data: {
            userId: ticket.consumerId,
            ticketId,
            amount: dto.amount,
            paymentMode: dto.paymentMode,
            currency: dto.currency ?? 'PKR',
            status: 'VERIFIED',
            // Audit 1.11: this row pays a ticket — without the explicit type
            // it defaulted to TOPUP and the dashboard counted the money twice
            // (once as a top-up, once as the ticket debit).
            type: 'TICKET_DEBIT',
            verifiedAt: new Date(),
            reviewedByUserId: actor?.actorUserId,
            note: dto.note,
            receiptUrl: dto.receiptUrl ?? null,
          },
        });

        return { updatedTicket: nextTicket, dueAfter };
      },
    );

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
    };
  }

  async updateCharge(
    ticketId: string,
    dto: UpdateChargeDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Merge incoming charge fields with existing values
    const serviceCost = dto.serviceCost ?? toNumber(ticket.serviceCost);
    const deliveryCharges =
      dto.deliveryCharges ?? toNumber(ticket.deliveryCharges);
    const printingCharges =
      dto.printingCharges ?? toNumber(ticket.printingCharges);
    const attestedCharges =
      dto.attestedCharges ?? toNumber(ticket.attestedCharges);
    const nonAttestedCharges =
      dto.nonAttestedCharges ?? toNumber(ticket.nonAttestedCharges);
    const additionalCharges =
      dto.additionalCharges ?? toNumber(ticket.additionalCharges);
    const additionalServiceCost =
      dto.additionalServiceCost ?? toNumber(ticket.additionalServiceCost);
    const discountPrice = dto.discountPrice ?? toNumber(ticket.discountPrice);

    const promoDiscount = dto.promoDiscount ?? toNumber(ticket.promoDiscount);
    const taxRate = toNumber(ticket.taxRate);

    const money = computeTicketTotal({
      charges: {
        serviceCost,
        deliveryCharges,
        printingCharges,
        attestedCharges,
        nonAttestedCharges,
        additionalCharges,
        additionalServiceCost,
      },
      discountPrice,
      promoDiscount,
      taxRate,
    });

    // A staff discount or promo may legitimately push the total below
    // serviceCost, so the old `total >= serviceCost` gate is gone. The discount
    // may not exceed the charges subtotal, and the total may never drop below
    // what the consumer has already paid (the surplus-credit path on finalize
    // handles intentional downward corrections after a settlement).
    if (money.discountTotal > money.chargesSubtotal) {
      throw new BadRequestException(
        'Discount cannot exceed the charges subtotal',
      );
    }
    const totalAmount = dto.amount ?? money.totalAmount;

    const amountPaid = toNumber(ticket.amountPaid);
    if (totalAmount < amountPaid) {
      throw new BadRequestException(
        `New total (${totalAmount}) cannot be less than amount already paid (${amountPaid}).`,
      );
    }

    // C10: snapshot the applied breakdown for invoice/audit provenance, same
    // top-level shape (resolver/applied/taxRate) as repriceTicket's
    // priceBreakdown. There is no pricing re-resolve here (this is a manual
    // admin override, not a re-price from case fields), so `resolver` is the
    // overridden charge components rather than a PricingService.resolve()
    // result. `applied` mirrors the computed money, with totalAmount aligned
    // to whatever was actually persisted (dto.amount may override it).
    const priceBreakdown = {
      resolver: {
        serviceCost,
        deliveryCharges,
        printingCharges,
        attestedCharges,
        nonAttestedCharges,
        additionalCharges,
        additionalServiceCost,
      },
      applied: { ...money, totalAmount },
      taxRate,
    };

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
        promoDiscount,
        taxAmount: money.taxAmount,
        totalAmount,
        priceBreakdown: priceBreakdown as Prisma.InputJsonValue,
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
        taxRate: toNumber(updated.taxRate),
        taxAmount: toNumber(updated.taxAmount),
        promoDiscount: toNumber(updated.promoDiscount),
      },
      remaining: toNumber(updated.totalAmount) - amountPaid,
      clerkPayout: clerkPayoutFor(updated),
    };
  }
}
