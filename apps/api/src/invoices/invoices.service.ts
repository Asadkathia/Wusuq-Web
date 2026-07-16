import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isStaffRole, round2 } from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { buildInvoiceLines, formatInvoiceNo, summariseInvoice } from './invoice-lines';

const TICKET_SELECT = {
  id: true, batchNo: true, consumerId: true, currency: true, archivedAt: true,
  intakeFlow: true, formPayload: true,
  serviceCost: true, additionalServiceCost: true, printingCharges: true,
  attestedCharges: true, nonAttestedCharges: true, deliveryCharges: true,
  additionalCharges: true, discountPrice: true, promoDiscount: true,
  service: { select: { name: true } },
  invoiceItem: { select: { invoiceId: true } },
  // NOTE: clerkCost is deliberately NOT selected. It must never reach an invoice.
} as const;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Issue one invoice covering N tickets of a single consumer.
   *
   * Every money field is SNAPSHOTTED: an issued invoice is a legal document and
   * must not change when the underlying tickets are later edited.
   */
  async generate(ticketIds: string[], actorUserId: string) {
    if (!ticketIds.length) throw new BadRequestException('Select at least one ticket to invoice.');

    return this.prisma.$transaction(async (tx) => {
      const tickets = await tx.ticket.findMany({
        where: { id: { in: ticketIds } },
        select: TICKET_SELECT,
      });

      if (tickets.length !== ticketIds.length) {
        throw new NotFoundException('One or more tickets were not found.');
      }

      const archived = tickets.find((t) => t.archivedAt);
      if (archived) {
        throw new BadRequestException(`Ticket ${archived.batchNo} is archived and cannot be invoiced.`);
      }

      const consumerIds = new Set(tickets.map((t) => t.consumerId));
      if (consumerIds.size > 1) {
        throw new BadRequestException('All tickets on an invoice must belong to one consumer.');
      }

      const currencies = new Set(tickets.map((t) => t.currency ?? 'PKR'));
      if (currencies.size > 1) {
        throw new BadRequestException(
          `Cannot invoice tickets with mixed currency (${[...currencies].join(', ')}) — totals would not sum.`,
        );
      }

      const already = tickets.find((t) => t.invoiceItem);
      if (already) {
        throw new ConflictException(`Ticket ${already.batchNo} is already on another invoice.`);
      }

      const num = (v: unknown) => Number(v ?? 0);
      const lines = buildInvoiceLines(
        tickets.map((t) => ({
          id: t.id, batchNo: t.batchNo, currency: t.currency ?? 'PKR',
          intakeFlow: t.intakeFlow, formPayload: t.formPayload,
          serviceCost: num(t.serviceCost), additionalServiceCost: num(t.additionalServiceCost),
          printingCharges: num(t.printingCharges), attestedCharges: num(t.attestedCharges),
          nonAttestedCharges: num(t.nonAttestedCharges), deliveryCharges: num(t.deliveryCharges),
          additionalCharges: num(t.additionalCharges),
          discountPrice: num(t.discountPrice), promoDiscount: num(t.promoDiscount),
          service: t.service,
        })),
      );

      // Safe: the empty-selection guard above already rejected ticketIds.length
      // === 0, and tickets.length === ticketIds.length was just asserted, so
      // tickets[0] always exists here.
      const firstTicket = tickets[0]!;
      const currency = firstTicket.currency ?? 'PKR';
      // USD is an all-inclusive flat price list — no tax (CLAUDE.md, country pricing).
      const taxRate = currency === 'USD' ? 0 : await this.settings.getTaxRate();
      const discountTotal = round2(
        tickets.reduce((s, t) => s + num(t.discountPrice) + num(t.promoDiscount), 0),
      );
      const totals = summariseInvoice(lines, { taxRate, discountTotal });

      // nextval MUST run inside this transaction so a concurrent generate can't
      // reuse the number.
      const seqRows = await tx.$queryRawUnsafe<Array<{ nextval: bigint }>>(
        `SELECT nextval('invoice_no_seq')`,
      );
      // Safe: `SELECT nextval(...)` always returns exactly one row.
      const invoiceNo = formatInvoiceNo(Number(seqRows[0]!.nextval));

      const created = await tx.invoice.create({
        data: {
          invoiceNo,
          consumerId: firstTicket.consumerId,
          currency,
          subtotal: totals.subtotal,
          taxRate,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,
          items: {
            create: lines.map((l) => ({
              ticketId: l.ticketId, position: l.position, batchNo: l.batchNo,
              description: l.description, courtLine: l.courtLine,
              caseTitle: l.caseTitle, judge: l.judge,
              serviceCost: l.serviceCost, printing: l.printing, attested: l.attested,
              nonAttested: l.nonAttested, delivery: l.delivery, additional: l.additional,
              lineTotal: l.lineTotal,
            })),
          },
        },
        select: { id: true, invoiceNo: true },
      });

      return created;
    });
  }

  /** Staff see all; a consumer sees their own; anyone else (e.g. a clerk) sees none. */
  async list(actor: JwtUser) {
    const staff = isStaffRole(actor.role);
    if (!staff && !actor.sub) return [];
    return this.prisma.invoice.findMany({
      where: staff ? {} : { consumerId: actor.sub },
      orderBy: { issueDate: 'desc' },
      select: {
        id: true, invoiceNo: true, issueDate: true, currency: true,
        grandTotal: true, status: true,
        consumer: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } },
      },
    });
  }

  /**
   * 404 (not 403) for anyone who may not read this invoice, so ids can't be probed.
   *
   * isStaffRole — NOT isConsumerRole. A `representative` is neither staff nor
   * consumer-class, so an isConsumerRole check would be a silent no-op and let
   * any clerk pull any consumer's invoice (the 3.1-class IDOR).
   */
  async findOne(id: string, actor: JwtUser) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: { orderBy: { position: 'asc' } },
        consumer: {
          select: { id: true, name: true, email: true, phone: true, address: true },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!isStaffRole(actor.role) && invoice.consumerId !== actor.sub) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }
}
