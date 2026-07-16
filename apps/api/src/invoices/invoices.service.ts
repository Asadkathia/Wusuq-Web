import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isStaffRole, round2 } from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
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
  status: true,
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
  // Stamped at pricing/reprice/finalize time (CLAUDE.md money model) — the
  // invoice MUST bill the rate the ticket actually charged, never the live
  // settings rate (blocker 2: a rate change after pricing must not change
  // what an already-priced ticket bills).
  taxRate: true,
  // Gates the five phase-2 clerk charge columns below (blocker 1): between
  // submitClerkCosts and the admin's reviewAndComplete those columns hold the
  // clerk's unapproved PROPOSAL, not a billable amount — same invariant the
  // consumer/staff boards already enforce (CLAUDE.md B4).
  remainderFinalizedAt: true,
  service: { select: { name: true } },
  invoiceItem: { select: { invoiceId: true } },
  // NOTE: clerkCost is deliberately NOT selected. It must never reach an invoice.
} as const;

/** 6dp is ample precision for a tax-rate fraction (e.g. 0.175 = 17.5%) while
 * absorbing any binary floating-point noise from the Decimal->Number cast —
 * using round2 (money's 2dp) here would misround a 17.5% rate to 18%. */
function roundRate(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
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

        // A ticket lands on at most ONE invoice (InvoiceItem.ticketId is
        // unique) — so invoicing a ticket while its clerk-submitted phase-2
        // charges are still mid-review permanently forfeits ever invoicing
        // those charges: once the admin later reviews & finalizes, the
        // remainder is added to Ticket.totalAmount but this ticket can never
        // be attached to another invoice to capture it. That's an
        // unrecoverable data gap, not just a display nit, so it's rejected
        // outright rather than merely gated (which the phase-2 zeroing below
        // still also does, belt-and-braces, for any ticket that reaches
        // WAITING_APPROVAL via a path this guard doesn't anticipate).
        const midReview = tickets.find((t) => t.status === 'WAITING_APPROVAL');
        if (midReview) {
          throw new BadRequestException(
            `Ticket ${midReview.batchNo} is awaiting admin review (WAITING_APPROVAL) — its phase-2 charges are not final yet. Invoice it after Review & Complete.`,
          );
        }

        const already = tickets.find((t) => t.invoiceItem);
        if (already) {
          throw new ConflictException(
            `Ticket ${already.batchNo} is already on another invoice.`,
          );
        }

        const num = (v: unknown) => Number(v ?? 0);
        // Blocker 1: printing/attested/nonAttested/delivery/additional are
        // the clerk's phase-2 PROPOSAL until the admin's reviewAndComplete
        // stamps remainderFinalizedAt (CLAUDE.md B4) — bill 0 for any of them
        // until then, exactly like the consumer/staff charge breakdowns do.
        const phase2 = (t: (typeof tickets)[number], v: unknown) =>
          t.remainderFinalizedAt ? num(v) : 0;
        const lines = buildInvoiceLines(
          tickets.map((t) => ({
            id: t.id,
            batchNo: t.batchNo,
            currency: t.currency ?? 'PKR',
            intakeFlow: t.intakeFlow,
            formPayload: t.formPayload,
            serviceCost: num(t.serviceCost),
            additionalServiceCost: num(t.additionalServiceCost),
            printingCharges: phase2(t, t.printingCharges),
            attestedCharges: phase2(t, t.attestedCharges),
            nonAttestedCharges: phase2(t, t.nonAttestedCharges),
            deliveryCharges: phase2(t, t.deliveryCharges),
            additionalCharges: phase2(t, t.additionalCharges),
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
        // Blocker 2: bill the ticket's OWN stamped Ticket.taxRate (snapshotted
        // at pricing/reprice/finalize time), never the live settings rate —
        // otherwise a later rate change silently re-bills or under-bills
        // historical tickets. USD is an all-inclusive flat price list with no
        // tax regardless of what's stamped (CLAUDE.md, country pricing).
        let taxRate: number;
        if (currency === 'USD') {
          taxRate = 0;
        } else {
          const rates = new Set(tickets.map((t) => roundRate(num(t.taxRate))));
          if (rates.size > 1) {
            throw new BadRequestException(
              `Cannot invoice tickets with mixed tax rates (${[...rates]
                .map((r) => `${roundRate(r * 100)}%`)
                .join(
                  ', ',
                )}) — an invoice can only state one rate. Split into separate invoices.`,
            );
          }
          // Safe: `rates` always has >= 1 entry — tickets.length >= 1 is
          // guaranteed by the guards above.
          taxRate = [...rates][0]!;
        }

        // Blocker 3: clamp EACH ticket's discount to that ticket's own
        // lineTotal BEFORE summing, so one ticket's excess discount (e.g. an
        // admin reprice discount larger than that ticket's remaining charges)
        // can never erode another ticket's contribution to subtotal/
        // grandTotal — summariseInvoice only sees the (already-safe)
        // aggregate.
        const discountTotal = round2(
          tickets.reduce((s, t, i) => {
            const raw = num(t.discountPrice) + num(t.promoDiscount);
            // lines[i] corresponds 1:1 with tickets[i] — buildInvoiceLines
            // maps in the same order it was given.
            const clamped = Math.min(
              Math.max(0, raw),
              Math.max(0, lines[i]!.lineTotal),
            );
            return s + clamped;
          }, 0),
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
            discount: totals.discount,
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
