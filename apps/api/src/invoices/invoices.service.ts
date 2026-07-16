import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isStaffRole, round2 } from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { JwtUser } from '../auth/types/jwt-user.type';
import {
  buildInvoiceLines,
  formatInvoiceNo,
  summariseInvoice,
} from './invoice-lines';

const TICKET_SELECT = {
  id: true,
  batchNo: true,
  consumerId: true,
  currency: true,
  archivedAt: true,
  intakeFlow: true,
  formPayload: true,
  serviceCost: true,
  additionalServiceCost: true,
  printingCharges: true,
  attestedCharges: true,
  nonAttestedCharges: true,
  deliveryCharges: true,
  additionalCharges: true,
  discountPrice: true,
  promoDiscount: true,
  service: { select: { name: true } },
  invoiceItem: { select: { invoiceId: true } },
  // NOTE: clerkCost is deliberately NOT selected. It must never reach an invoice.
} as const;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    // Required, not optional — issuing an invoice is a financial act and
    // CLAUDE.md's convention ("Every sensitive auth action is written to
    // AuditLog") must not be satisfiable by a wiring accident. Unlike
    // `settingsService?`/`promosService?` on TicketsService (made optional
    // solely to keep ~30 pre-existing 6-arg test instantiations compiling),
    // there is no such legacy call-site pressure here — every construction
    // site (this service's own spec + the future controller/module) is
    // updated in the same change that introduces this parameter, so making
    // it required costs nothing and guarantees the audit write can never be
    // silently absent in production.
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Issue one invoice covering N tickets of a single consumer.
   *
   * Every money field is SNAPSHOTTED: an issued invoice is a legal document and
   * must not change when the underlying tickets are later edited.
   */
  async generate(ticketIds: string[], actorUserId: string) {
    if (!ticketIds.length)
      throw new BadRequestException('Select at least one ticket to invoice.');

    // Populated inside the transaction below and read only after it commits,
    // so the audit write always reflects a real, durable invoice.
    let issued: {
      id: string;
      invoiceNo: string;
      consumerId: string;
      currency: string;
      grandTotal: number;
    };

    try {
      issued = await this.prisma.$transaction(async (tx) => {
        const tickets = await tx.ticket.findMany({
          where: { id: { in: ticketIds } },
          select: TICKET_SELECT,
        });

        if (tickets.length !== ticketIds.length) {
          throw new NotFoundException('One or more tickets were not found.');
        }

        const archived = tickets.find((t) => t.archivedAt);
        if (archived) {
          throw new BadRequestException(
            `Ticket ${archived.batchNo} is archived and cannot be invoiced.`,
          );
        }

        const consumerIds = new Set(tickets.map((t) => t.consumerId));
        if (consumerIds.size > 1) {
          throw new BadRequestException(
            'All tickets on an invoice must belong to one consumer.',
          );
        }

        const currencies = new Set(tickets.map((t) => t.currency ?? 'PKR'));
        if (currencies.size > 1) {
          throw new BadRequestException(
            `Cannot invoice tickets with mixed currency (${[...currencies].join(', ')}) — totals would not sum.`,
          );
        }

        const already = tickets.find((t) => t.invoiceItem);
        if (already) {
          throw new ConflictException(
            `Ticket ${already.batchNo} is already on another invoice.`,
          );
        }

        const num = (v: unknown) => Number(v ?? 0);
        const lines = buildInvoiceLines(
          tickets.map((t) => ({
            id: t.id,
            batchNo: t.batchNo,
            currency: t.currency ?? 'PKR',
            intakeFlow: t.intakeFlow,
            formPayload: t.formPayload,
            serviceCost: num(t.serviceCost),
            additionalServiceCost: num(t.additionalServiceCost),
            printingCharges: num(t.printingCharges),
            attestedCharges: num(t.attestedCharges),
            nonAttestedCharges: num(t.nonAttestedCharges),
            deliveryCharges: num(t.deliveryCharges),
            additionalCharges: num(t.additionalCharges),
            discountPrice: num(t.discountPrice),
            promoDiscount: num(t.promoDiscount),
            service: t.service,
          })),
        );

        // Safe: the empty-selection guard above already rejected ticketIds.length
        // === 0, and tickets.length === ticketIds.length was just asserted, so
        // tickets[0] always exists here.
        const firstTicket = tickets[0]!;
        const currency = firstTicket.currency ?? 'PKR';
        // USD is an all-inclusive flat price list — no tax (CLAUDE.md, country pricing).
        const taxRate =
          currency === 'USD' ? 0 : await this.settings.getTaxRate();
        const discountTotal = round2(
          tickets.reduce(
            (s, t) => s + num(t.discountPrice) + num(t.promoDiscount),
            0,
          ),
        );
        const totals = summariseInvoice(lines, { taxRate, discountTotal });

        // nextval MUST run inside this transaction so a concurrent generate can't
        // reuse the number.
        const seqRows = await tx.$queryRawUnsafe<Array<{ nextval: bigint }>>(
          `SELECT nextval('invoice_no_seq')`,
        );
        // Safe: `SELECT nextval(...)` always returns exactly one row.
        const invoiceNo = formatInvoiceNo(Number(seqRows[0]!.nextval));

        // This create can still race a concurrent generate() that passed the
        // up-front `already` guard above at the same instant (both read
        // invoiceItem: null under READ COMMITTED before either commits). The
        // `InvoiceItem.ticketId @unique` constraint is the real guard; a
        // collision here throws P2002, caught below and converted to the same
        // ConflictException the up-front guard throws.
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
                ticketId: l.ticketId,
                position: l.position,
                batchNo: l.batchNo,
                description: l.description,
                courtLine: l.courtLine,
                caseTitle: l.caseTitle,
                judge: l.judge,
                serviceCost: l.serviceCost,
                printing: l.printing,
                attested: l.attested,
                nonAttested: l.nonAttested,
                delivery: l.delivery,
                additional: l.additional,
                lineTotal: l.lineTotal,
              })),
            },
          },
          select: { id: true, invoiceNo: true },
        });

        return {
          id: created.id,
          invoiceNo: created.invoiceNo,
          consumerId: firstTicket.consumerId,
          currency,
          grandTotal: totals.grandTotal,
        };
      });
    } catch (error) {
      // Concurrent double-generate: two racing calls both pass the up-front
      // `already` guard (READ COMMITTED lets both see invoiceItem: null),
      // then the second `tx.invoice.create` hits the `InvoiceItem.ticketId`
      // unique constraint and throws P2002. Convert that into the same
      // ConflictException the up-front guard throws instead of letting it
      // surface as a raw 500. Any OTHER P2002 (a real bug) still rethrows.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | string | undefined)
          ?.toString()
          .includes('ticketId')
      ) {
        const conflicting = await this.prisma.ticket.findFirst({
          where: { id: { in: ticketIds }, invoiceItem: { isNot: null } },
          select: { batchNo: true },
        });
        throw new ConflictException(
          conflicting
            ? `Ticket ${conflicting.batchNo} is already on another invoice.`
            : 'One of the selected tickets is already on another invoice.',
        );
      }
      throw error;
    }

    // Written AFTER the transaction commits, never inside it — an audit row
    // for an invoice that rolled back would be a lie (same reasoning as
    // reviewAndComplete's post-commit wallet settlement, CLAUDE.md). This is
    // a financial act: an auditor must be able to see who billed whom, for
    // what tickets, and how much, so the metadata carries the invoice
    // number, the billed ticket ids, the consumer, currency, and total.
    await this.auditLogsService.create({
      action: 'INVOICE_GENERATED',
      entity: 'INVOICE',
      entityId: issued.id,
      actorUserId,
      metadata: {
        invoiceNo: issued.invoiceNo,
        ticketIds,
        consumerId: issued.consumerId,
        currency: issued.currency,
        grandTotal: issued.grandTotal,
      },
    });

    return { id: issued.id, invoiceNo: issued.invoiceNo };
  }

  /** Staff see all; a consumer sees their own; anyone else (e.g. a clerk) sees none. */
  async list(actor: JwtUser) {
    const staff = isStaffRole(actor.role);
    if (!staff && !actor.sub) return [];
    return this.prisma.invoice.findMany({
      where: staff ? {} : { consumerId: actor.sub },
      orderBy: { issueDate: 'desc' },
      select: {
        id: true,
        invoiceNo: true,
        issueDate: true,
        currency: true,
        grandTotal: true,
        status: true,
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
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
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
