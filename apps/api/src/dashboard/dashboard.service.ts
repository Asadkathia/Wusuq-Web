import { Injectable, BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';
import {
  recommendationsForCase,
  isFlowKey,
  CONSUMER_CLASS_ROLES,
  computeClerkEarningsBreakdown,
  convertToPkr,
  sumMixedCurrencyToPkr,
  round2,
  type FlowKey,
} from '@wusuq/shared';

@Injectable()
export class DashboardService {
  private statsCache = new Map<string, { data: unknown; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Batch-7 3.8: "also add Graph just like super admin on Consumer and
   * Representative side." Same 30-day daily series the staff Ticket Volume
   * Trend uses, scoped to one person's own tickets.
   */
  private async ownTicketTrend(
    where: Prisma.TicketWhereInput,
    days = 30,
  ): Promise<Array<{ date: string; count: number }>> {
    const since = startOfDay(subDays(new Date(), days - 1));
    const rows = await this.prisma.ticket.findMany({
      where: { ...where, createdAt: { gte: since }, archivedAt: null },
      select: { createdAt: true },
    });
    const buckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      buckets.set(format(subDays(new Date(), i), 'MMM dd'), 0);
    }
    for (const r of rows) {
      const day = format(r.createdAt, 'MMM dd');
      if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([date, count]) => ({
      date,
      count,
    }));
  }

  async getConsumerSummary(userId: string) {
    const now = new Date();

    const [
      totalTickets,
      pendingTickets,
      inProgressTickets,
      activeTickets,
      completedTickets,
      walletUser,
      outstandingAgg,
      myActiveCases,
      myRecentTickets,
      myNextHearing,
    ] = await this.prisma.$transaction([
      this.prisma.ticket.count({
        where: {
          consumerId: userId,
          archivedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: {
          consumerId: userId,
          status: 'UNPAID',
          archivedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: {
          consumerId: userId,
          status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
          archivedAt: null,
        },
      }),
      // Batch-6 A: THE definition of "active" for a consumer — anything not
      // finished. It must match the My Tickets "Active" tab
      // (consumer-ticket-board.tsx: NOT COMPLETED and NOT DELIVERED) because
      // the consumer reads both screens side by side.
      //
      // The dashboard KPI used to be computed on the FE as
      // `pending + inProgress` = UNPAID + ASSIGNED + IN_PROGRESS, which
      // silently dropped PAID and WAITING_APPROVAL. The client's own account
      // (1 UNPAID + 2 PAID + 1 COMPLETED) showed "Active 1" on the dashboard
      // and "Active 3" on My Tickets. Derive it here, once, so a FE sum can't
      // drift from the tab again.
      this.prisma.ticket.count({
        where: {
          consumerId: userId,
          status: { notIn: ['COMPLETED', 'DELIVERED'] },
          archivedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: {
          consumerId: userId,
          status: 'COMPLETED',
          archivedAt: null,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true },
      }),
      this.prisma.ticket.aggregate({
        where: {
          consumerId: userId,
          status: { notIn: ['DELIVERED'] },
          archivedAt: null,
        },
        _sum: {
          totalAmount: true,
          amountPaid: true,
        },
      }),
      this.prisma.case.count({
        where: {
          consumerId: userId,
          status: 'OPEN',
        },
      }),
      this.prisma.ticket.findMany({
        where: { consumerId: userId, archivedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          batchNo: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          service: { select: { name: true } },
        },
      }),
      this.prisma.ticket.findFirst({
        where: {
          scheduledDate: { gte: now },
          consumerId: userId,
          archivedAt: null,
        },
        orderBy: { scheduledDate: 'asc' },
        select: {
          // Batch-6 B: the widget used to render only a service NAME, which is
          // not an identifier — the client had four "Lower Court Paralegal
          // Service" tickets and asked "we don't know which case has the next
          // hearing… it should be clickable". id + batchNo make it both
          // identifiable and linkable.
          id: true,
          batchNo: true,
          scheduledDate: true,
          hearingType: true,
          case: { select: { title: true } },
          service: { select: { name: true } },
        },
      }),
    ]);

    const myTickets = {
      total: totalTickets,
      pending: pendingTickets,
      inProgress: inProgressTickets,
      // Batch-6 A: server-derived; the FE must render this directly and never
      // re-sum the component counts (see the count query above).
      active: activeTickets,
      completed: completedTickets,
    };

    const myOutstanding =
      Number(outstandingAgg._sum.totalAmount || 0) -
      Number(outstandingAgg._sum.amountPaid || 0);

    const ticketTrend = await this.ownTicketTrend({ consumerId: userId });

    return {
      ticketTrend,
      myTickets,
      myWalletBalance: Number(walletUser?.walletBalance || 0),
      myOutstanding: myOutstanding > 0 ? myOutstanding : 0,
      myActiveCases,
      myRecentTickets: myRecentTickets.map((ticket) => ({
        ...ticket,
        totalAmount: Number(ticket.totalAmount || 0),
      })),
      // `caseId` may be null (no linked Case row yet) even though the clerk
      // has set a scheduledDate on the ticket itself — fall back to the
      // ticket's service name so the FE's `myNextHearing.case.title` render
      // never sees a null case object.
      myNextHearing: myNextHearing
        ? {
            ticketId: myNextHearing.id,
            batchNo: myNextHearing.batchNo,
            scheduledDate: myNextHearing.scheduledDate,
            hearingType: myNextHearing.hearingType,
            case: {
              title:
                myNextHearing.case?.title ??
                myNextHearing.service?.name ??
                'Upcoming hearing',
            },
          }
        : null,
    };
  }

  /**
   * Clerk (representative) dashboard. Self-scoped to `repId` — earnings split
   * into realized (work done: COMPLETED + DELIVERED) vs pending (in flight:
   * IN_PROGRESS + WAITING_APPROVAL), plus this-month realized, status counts,
   * recent assignments and upcoming hearings. Earnings use the shared
   * computeClerkEarningsBreakdown, capped per-line at what the clerk actually
   * submitted (internal payout; never exposed to consumers).
   */
  async getClerkSummary(repId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const toNum = (v: unknown): number | null => (v == null ? null : Number(v));

    const tickets = await this.prisma.ticket.findMany({
      where: {
        assignments: { some: { representativeId: repId } },
        archivedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        batchNo: true,
        status: true,
        updatedAt: true,
        scheduledDate: true,
        hearingType: true,
        formPayload: true,
        clerkCost: true,
        defaultClerkCost: true,
        attestedCharges: true,
        nonAttestedCharges: true,
        printingCharges: true,
        deliveryCharges: true,
        clerkAttestedCharges: true,
        clerkNonAttestedCharges: true,
        clerkPrintingCharges: true,
        clerkDeliveryCharges: true,
        service: { select: { name: true } },
        case: { select: { caseNo: true, title: true } },
      },
    });

    const REALIZED = new Set(['COMPLETED', 'DELIVERED']);
    const PENDING = new Set(['IN_PROGRESS', 'WAITING_APPROVAL']);

    let realized = 0;
    let pending = 0;
    let thisMonth = 0;
    const breakdown = {
      base: 0,
      attested: 0,
      nonAttested: 0,
      printing: 0,
      delivery: 0,
      pdfFee: 0,
      total: 0,
    };
    // Batch-7 5.8: "Clerk Earning is 900, Photocopy is 600 and delivery is
    // 400 — please make such tabs, it will be easier for the clerk." He
    // annotated the PENDING tile, which was a single opaque 1,900; only the
    // realized tile carried an itemisation.
    const pendingBreakdown = {
      base: 0,
      attested: 0,
      nonAttested: 0,
      printing: 0,
      delivery: 0,
      pdfFee: 0,
      total: 0,
    };
    const counts: Record<string, number> = {};

    for (const t of tickets) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
      const wantPdf =
        ((t.formPayload ?? {}) as Record<string, unknown>)
          .want_pdf_before_dispatch === 'Yes';
      const b = computeClerkEarningsBreakdown({
        clerkCost: toNum(t.clerkCost),
        defaultClerkCost: toNum(t.defaultClerkCost),
        attestedCharges: toNum(t.attestedCharges),
        nonAttestedCharges: toNum(t.nonAttestedCharges),
        printingCharges: toNum(t.printingCharges),
        deliveryCharges: toNum(t.deliveryCharges),
        clerkAttestedCharges:
          t.clerkAttestedCharges == null ? null : toNum(t.clerkAttestedCharges),
        clerkNonAttestedCharges:
          t.clerkNonAttestedCharges == null
            ? null
            : toNum(t.clerkNonAttestedCharges),
        clerkPrintingCharges:
          t.clerkPrintingCharges == null ? null : toNum(t.clerkPrintingCharges),
        clerkDeliveryCharges:
          t.clerkDeliveryCharges == null ? null : toNum(t.clerkDeliveryCharges),
        wantPdf,
      });
      const earn = b.total;
      if (REALIZED.has(t.status)) {
        realized += earn;
        for (const k of Object.keys(breakdown) as (keyof typeof breakdown)[]) {
          breakdown[k] += b[k];
        }
        if (t.updatedAt >= startOfMonth) thisMonth += earn;
      } else if (PENDING.has(t.status)) {
        pending += earn;
        for (const k of Object.keys(
          pendingBreakdown,
        ) as (keyof typeof pendingBreakdown)[]) {
          pendingBreakdown[k] += b[k];
        }
      }
    }

    const recent = tickets.slice(0, 6).map((t) => ({
      id: t.id,
      batchNo: t.batchNo,
      status: t.status,
      service: t.service?.name ?? null,
      caseNo: t.case?.caseNo ?? null,
    }));

    const upcomingHearings = tickets
      .filter((t) => t.scheduledDate && t.scheduledDate >= now)
      .sort((a, b) => a.scheduledDate!.getTime() - b.scheduledDate!.getTime())
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        batchNo: t.batchNo,
        scheduledDate: t.scheduledDate,
        hearingType: t.hearingType,
        caseTitle: t.case?.title ?? null,
      }));

    return {
      earnings: {
        realized: round2(realized),
        pending: round2(pending),
        thisMonth: round2(thisMonth),
        breakdown: {
          base: round2(breakdown.base),
          attested: round2(breakdown.attested),
          nonAttested: round2(breakdown.nonAttested),
          printing: round2(breakdown.printing),
          delivery: round2(breakdown.delivery),
          pdfFee: round2(breakdown.pdfFee),
          total: round2(breakdown.total),
        },
        // Batch-7 5.8
        pendingBreakdown: {
          base: round2(pendingBreakdown.base),
          attested: round2(pendingBreakdown.attested),
          nonAttested: round2(pendingBreakdown.nonAttested),
          printing: round2(pendingBreakdown.printing),
          delivery: round2(pendingBreakdown.delivery),
          pdfFee: round2(pendingBreakdown.pdfFee),
          total: round2(pendingBreakdown.total),
        },
      },
      counts: {
        assigned: counts['ASSIGNED'] ?? 0,
        inProgress: counts['IN_PROGRESS'] ?? 0,
        waitingApproval: counts['WAITING_APPROVAL'] ?? 0,
        completed: counts['COMPLETED'] ?? 0,
        delivered: counts['DELIVERED'] ?? 0,
      },
      pendingAcceptance: counts['ASSIGNED'] ?? 0,
      recent,
      upcomingHearings,
      // Batch-7 3.8 — scoped to this representative's own assignments.
      ticketTrend: await this.ownTicketTrend({
        assignments: { some: { representativeId: repId } },
      }),
    };
  }

  /**
   * Batch-7 3.4 — registration analytics.
   *
   * Verbatim: "we need to have data — how many people are registered with us,
   * how many lawyers, how many non-lawyers and how many companies, today,
   * this month, this year. From which area and so on." (He flagged it as
   * "maybe later", so this is the read-only aggregate, no new UI surface
   * beyond the reports page.)
   *
   * `consumerKind` carries the user-type split (LAWYER / NON_LAWYER /
   * CORPORATE — the display labels are remapped in CONSUMER_KIND_LABELS) and
   * `province`/`city` carry the area.
   */
  async getRegistrationStats() {
    const now = new Date();
    const startOfToday = startOfDay(now);
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfThisYear = new Date(now.getFullYear(), 0, 1);

    // Consumer-class roles only — staff and representatives are not
    // "people registered with us" in the sense he means. Prisma's enum
    // spelling, not the lowercase shared UserRole.
    const base: Prisma.UserWhereInput = {
      role: { in: [...CONSUMER_CLASS_ROLES] },
    };

    const [total, today, thisMonth, thisYear, byKind, byProvince, byCity] =
      await Promise.all([
        this.prisma.user.count({ where: base }),
        this.prisma.user.count({
          where: { ...base, createdAt: { gte: startOfToday } },
        }),
        this.prisma.user.count({
          where: { ...base, createdAt: { gte: startOfThisMonth } },
        }),
        this.prisma.user.count({
          where: { ...base, createdAt: { gte: startOfThisYear } },
        }),
        this.prisma.user.groupBy({
          by: ['consumerKind'],
          where: base,
          _count: { _all: true },
        }),
        this.prisma.user.groupBy({
          by: ['province'],
          where: base,
          _count: { _all: true },
        }),
        this.prisma.user.groupBy({
          by: ['city'],
          where: base,
          _count: { _all: true },
        }),
      ]);

    const toRows = (
      rows: Array<Record<string, unknown> & { _count: { _all: number } }>,
      key: string,
    ) =>
      rows
        .map((r) => ({
          label: (r[key] as string | null) ?? 'Unspecified',
          count: r._count._all,
        }))
        .sort((a, b) => b.count - a.count);

    return {
      totals: { total, today, thisMonth, thisYear },
      byKind: toRows(byKind as never, 'consumerKind'),
      byProvince: toRows(byProvince as never, 'province'),
      byCity: toRows(byCity as never, 'city').slice(0, 20),
    };
  }

  async getSummary(range: string = '7d') {
    const cached = this.statsCache.get(range);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const data = await this.computeSummary(range);
    this.statsCache.set(range, { data, expiresAt: Date.now() + 60_000 });
    return data;
  }

  /**
   * Multi-currency revenue KPI aggregate: sums PKR equivalents across every
   * ticket, not raw mixed amounts (a $35 ticket must not contribute 35 to a
   * PKR total). Extracted from `computeSummary` so it has direct test
   * coverage — see `aggregate-currency.spec.ts`.
   */
  /**
   * The four figures the client asked for by name (batch-7 3.1):
   *   "1- Total Business  2- Wusuq Profit  3- Clerk Profit
   *    4- Advance Amount from Consumers"
   * and again as "how much did the representative take, how much advance is
   * there, and what is the profit — the Super Admin can't see it."
   *
   * His own worked example on one PKR 1,100 ticket: representative 800,
   * Wusuq 300, consumer advance 900.
   *
   * CURRENCY: `totalAmount` may be USD, but representative payouts are ALWAYS
   * PKR (domestic). So business converts through the shared mixed-currency
   * reduce — excluding-and-counting rate-less tickets, same contract as the
   * revenue KPI — while the payout sum is added raw. Subtracting a raw USD
   * total from a PKR payout is exactly the batch-5 A defect; do not "simplify"
   * this by dropping the conversion.
   */
  private async getBusinessKpis(): Promise<{
    totalBusiness: number;
    wusuqProfit: number;
    representativeProfit: number;
    consumerAdvance: number;
    unconvertedCount: number;
    nonPkrWalletCount: number;
  }> {
    const [tickets, creditAgg, nonPkrWalletCount] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { archivedAt: null },
        select: {
          totalAmount: true,
          amountPaid: true,
          currency: true,
          fxRateToPkr: true,
          clerkCost: true,
          defaultClerkCost: true,
          attestedCharges: true,
          nonAttestedCharges: true,
          printingCharges: true,
          deliveryCharges: true,
          clerkAttestedCharges: true,
          clerkNonAttestedCharges: true,
          clerkPrintingCharges: true,
          clerkDeliveryCharges: true,
          formPayload: true,
          // Batch-8 item 1: "PKR 100 has gone to a representative
          // automatically — I haven't assigned anyone." Representative Profit
          // is money PAYABLE TO A PERSON, so a ticket nobody is working on
          // must contribute nothing. Without this the unconditional
          // PDF_CLERK_FEE (exactly 100) leaked in from every unassigned
          // ticket whose consumer bought a PDF.
          assignments: {
            where: { status: { in: ['ACTIVE', 'ACCEPTED'] } },
            select: { id: true },
            take: 1,
          },
        },
      }),
      // "Advance amount from consumers" = prepaid credit still held. That is
      // User.walletBalance, which is the credit only and never negative.
      //
      // Review finding 8: scoped to CONSUMER-CLASS roles (staff and
      // representative balances are not consumer advances) and to PKR wallets
      // — a wallet has no stamped FX rate (credit accrues across many top-ups,
      // so no single rate applies), and this KPI renders as PKR.
      this.prisma.user.aggregate({
        _sum: { walletBalance: true },
        where: {
          role: { in: [...CONSUMER_CLASS_ROLES] },
          currency: 'PKR',
        },
      }),
      // Batch-8 item 7: excluding non-PKR wallets from a PKR total is right,
      // but the old comment claimed they were "counted separately" while no
      // such count existed — so USD credit vanished with no marker at all.
      // Every other mixed-currency aggregate here surfaces an exclusion count
      // ("N excluded — FX rate not set"); this one now does too.
      this.prisma.user.count({
        where: {
          role: { in: [...CONSUMER_CLASS_ROLES] },
          currency: { not: 'PKR' },
          walletBalance: { gt: 0 },
        },
      }),
    ]);

    const { totalAmountPkr: totalBusiness, unconvertedCount } =
      sumMixedCurrencyToPkr(tickets);

    // Review finding 7: `sumMixedCurrencyToPkr` EXCLUDES non-PKR tickets with
    // no stamped fxRateToPkr. Reducing the payout over the full list would
    // subtract pay for business that was never counted, understating
    // wusuqProfit — potentially negative, the batch-5 A defect again. Reduce
    // over exactly the same set the business figure was built from.
    const convertible = tickets.filter(
      (t) =>
        (t.currency ?? 'PKR') === 'PKR' ||
        convertToPkr(1, t.fxRateToPkr as unknown as number | string | null) !==
          null,
    );

    const representativeProfit = round2(
      convertible.reduce((sum, t) => {
        // Batch-8 item 1: no active assignment → nobody is owed anything.
        if (t.assignments.length === 0) return sum;
        const payload =
          t.formPayload && typeof t.formPayload === 'object'
            ? (t.formPayload as Record<string, unknown>)
            : undefined;
        const wantPdf = payload?.want_pdf_before_dispatch === 'Yes';
        // A NULL clerk* column means "no submission recorded" and must stay
        // null through to the cap — coercing it to 0 would pay every
        // representative nothing (the load-bearing guard in CLAUDE.md).
        const orNull = (v: unknown) => (v == null ? null : Number(v));
        return (
          sum +
          computeClerkEarningsBreakdown({
            // Batch-8 item 2: these two were `Number(x ?? 0)`, which turns a
            // NULL clerkCost into 0. The shared fn branches on
            // `clerkCost != null`, and `0 != null` is TRUE, so the
            // defaultClerkCost fallback could never fire and an assigned
            // ticket with no explicit cost reported a base of 0. Same
            // coercion CLAUDE.md already warns about for this function —
            // pass the null through.
            clerkCost: orNull(t.clerkCost),
            defaultClerkCost: orNull(t.defaultClerkCost),
            attestedCharges: Number(t.attestedCharges ?? 0),
            nonAttestedCharges: Number(t.nonAttestedCharges ?? 0),
            printingCharges: Number(t.printingCharges ?? 0),
            deliveryCharges: Number(t.deliveryCharges ?? 0),
            wantPdf,
            clerkAttestedCharges: orNull(t.clerkAttestedCharges),
            clerkNonAttestedCharges: orNull(t.clerkNonAttestedCharges),
            clerkPrintingCharges: orNull(t.clerkPrintingCharges),
            clerkDeliveryCharges: orNull(t.clerkDeliveryCharges),
          }).total
        );
      }, 0),
    );

    return {
      totalBusiness,
      representativeProfit,
      wusuqProfit: round2(totalBusiness - representativeProfit),
      consumerAdvance: round2(Number(creditAgg._sum?.walletBalance ?? 0)),
      unconvertedCount,
      nonPkrWalletCount,
    };
  }

  /**
   * Batch-8 item 3 — Representative Profit, split by person.
   *
   * The KPI told the owner PKR 100 was payable but its drill-down
   * (/manage-users/representatives) carried only payout METHOD fields, so he
   * could not tell who was owed it: "how will I know WHO the money went to?"
   *
   * Deliberately mirrors `getBusinessKpis` exactly — same active-assignment
   * rule, same FX-convertible ticket set, same `computeClerkEarningsBreakdown`
   * — so these rows SUM to the KPI. If you change the rule in one, change it
   * in the other or the drill-down stops reconciling with the number that was
   * clicked. Amounts are PKR: representative payouts are domestic regardless
   * of the consumer's billing currency.
   */
  async getRepresentativeEarnings(): Promise<
    Array<{
      representativeId: string;
      name: string;
      email: string;
      ticketCount: number;
      realized: number;
      pending: number;
      total: number;
    }>
  > {
    const assignments = await this.prisma.assignment.findMany({
      where: {
        status: { in: ['ACTIVE', 'ACCEPTED'] },
        ticket: { archivedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        representativeId: true,
        representative: { select: { name: true, email: true } },
        ticket: {
          select: {
            id: true,
            status: true,
            currency: true,
            fxRateToPkr: true,
            clerkCost: true,
            defaultClerkCost: true,
            attestedCharges: true,
            nonAttestedCharges: true,
            printingCharges: true,
            deliveryCharges: true,
            clerkAttestedCharges: true,
            clerkNonAttestedCharges: true,
            clerkPrintingCharges: true,
            clerkDeliveryCharges: true,
            formPayload: true,
          },
        },
      },
    });

    const REALIZED = new Set(['COMPLETED', 'DELIVERED']);
    const orNull = (v: unknown) => (v == null ? null : Number(v));
    const rows = new Map<
      string,
      {
        representativeId: string;
        name: string;
        email: string;
        ticketCount: number;
        realized: number;
        pending: number;
        total: number;
      }
    >();
    // A ticket must be counted once even if it somehow carries two live
    // assignment rows — `getBusinessKpis` takes one per ticket, so this must
    // too or the drill-down would exceed the KPI it explains.
    const seenTickets = new Set<string>();

    for (const a of assignments) {
      const t = a.ticket;
      if (!t || seenTickets.has(t.id)) continue;
      // Same exclusion as the KPI: a non-PKR ticket with no stamped rate is
      // outside the business total, so its payout is outside this figure too.
      const convertible =
        (t.currency ?? 'PKR') === 'PKR' ||
        convertToPkr(1, t.fxRateToPkr as unknown as number | string | null) !==
          null;
      if (!convertible) continue;
      seenTickets.add(t.id);

      const payload =
        t.formPayload && typeof t.formPayload === 'object'
          ? (t.formPayload as Record<string, unknown>)
          : undefined;
      const amount = computeClerkEarningsBreakdown({
        clerkCost: orNull(t.clerkCost),
        defaultClerkCost: orNull(t.defaultClerkCost),
        attestedCharges: Number(t.attestedCharges ?? 0),
        nonAttestedCharges: Number(t.nonAttestedCharges ?? 0),
        printingCharges: Number(t.printingCharges ?? 0),
        deliveryCharges: Number(t.deliveryCharges ?? 0),
        wantPdf: payload?.want_pdf_before_dispatch === 'Yes',
        clerkAttestedCharges: orNull(t.clerkAttestedCharges),
        clerkNonAttestedCharges: orNull(t.clerkNonAttestedCharges),
        clerkPrintingCharges: orNull(t.clerkPrintingCharges),
        clerkDeliveryCharges: orNull(t.clerkDeliveryCharges),
      }).total;

      const row = rows.get(a.representativeId) ?? {
        representativeId: a.representativeId,
        name: a.representative?.name ?? '—',
        email: a.representative?.email ?? '',
        ticketCount: 0,
        realized: 0,
        pending: 0,
        total: 0,
      };
      row.ticketCount += 1;
      if (REALIZED.has(t.status)) row.realized += amount;
      else row.pending += amount;
      row.total += amount;
      rows.set(a.representativeId, row);
    }

    return [...rows.values()]
      .map((r) => ({
        ...r,
        realized: round2(r.realized),
        pending: round2(r.pending),
        total: round2(r.total),
      }))
      .sort((a, b) => b.total - a.total);
  }

  private async getRevenueKpis(): Promise<{
    totalRevenue: number;
    outstandingBalance: number;
    unconvertedCount: number;
  }> {
    const revenueRows = await this.prisma.ticket.findMany({
      where: { archivedAt: null },
      select: {
        totalAmount: true,
        amountPaid: true,
        currency: true,
        fxRateToPkr: true,
      },
    });
    const {
      totalAmountPkr,
      amountPaidPkr: totalRevenue,
      unconvertedCount,
    } = sumMixedCurrencyToPkr(revenueRows);
    const totalOutstanding = totalAmountPkr - totalRevenue;

    return {
      totalRevenue,
      outstandingBalance: totalOutstanding > 0 ? totalOutstanding : 0,
      unconvertedCount,
    };
  }

  /**
   * "Outstanding > 30 days (PKR)" pending action: sums PKR equivalents of the
   * remaining balance across tickets older than 30 days that aren't yet
   * DELIVERED. Extracted from computeSummary for direct test coverage —
   * mirrors getRevenueKpis's currency-aware reduce via the same
   * sumMixedCurrencyToPkr helper, but floors each ticket's remainder at 0
   * BEFORE summing/converting (a ticket where amountPaid exceeds totalAmount
   * must contribute 0, never a negative offset that understates other
   * tickets' outstanding balances) — matching how outstanding is computed
   * elsewhere (e.g. WalletService's due = Σ max(0, total − paid)).
   */
  private async getAgedOutstandingKpi(
    thirtyDaysAgo: Date,
  ): Promise<{ amount: number; unconvertedCount: number }> {
    const rows = await this.prisma.ticket.findMany({
      where: {
        status: { notIn: ['DELIVERED'] },
        createdAt: { lt: thirtyDaysAgo },
        archivedAt: null,
      },
      select: {
        totalAmount: true,
        amountPaid: true,
        currency: true,
        fxRateToPkr: true,
      },
    });
    const remainders = rows.map((r) => ({
      totalAmount: Math.max(
        0,
        Number(r.totalAmount ?? 0) - Number(r.amountPaid ?? 0),
      ),
      amountPaid: 0,
      currency: r.currency,
      fxRateToPkr: r.fxRateToPkr,
    }));
    const { totalAmountPkr, unconvertedCount } =
      sumMixedCurrencyToPkr(remainders);
    return { amount: totalAmountPkr, unconvertedCount };
  }

  /**
   * The super-admin "pending actions" list — a pure transform of already-
   * resolved counts/dates into deep-linked action rows. Extracted from
   * `computeSummary` so the deepLink <-> count pairing has direct test
   * coverage (mirrors why `getBusinessKpis` was extracted) — see
   * `pending-actions.spec.ts`.
   *
   * §9: the `clerk_submitted` count queries `clerkApprovalStatus:'SUBMITTED'`
   * with NO status filter, but `submitClerkCosts` (tickets.service.ts) only
   * ever writes that value in the SAME atomic update that sets
   * `status: 'WAITING_APPROVAL'` (and `sendBackToClerk`/`reviewAndComplete`
   * move it to REJECTED/VERIFIED, never leaving it SUBMITTED on any other
   * status). So every ticket this count includes is, by construction, in
   * WAITING_APPROVAL — its deepLink MUST be the same list the
   * `waiting_approval` action links to, or the destination structurally
   * cannot contain any of the tickets being counted.
   */
  private buildPendingActions(input: {
    pendingVerifications: number;
    oldestPendingVerificationAt: Date | null | undefined;
    pendingTicketsCount: number;
    oldestPendingTicketAt: Date | null | undefined;
    waitingApprovalCount: number;
    oldestWaitingApprovalAt: Date | null | undefined;
    clerkSubmittedCount: number;
    stuckInProgressCount: number;
    agedOutstandingAmount: number;
  }) {
    const ageHours = (d: Date | null | undefined): number | null =>
      d ? Math.round((Date.now() - new Date(d).getTime()) / 36e5) : null;

    return [
      {
        key: 'wallet_verifications',
        label: 'Wallet receipts to verify',
        count: input.pendingVerifications,
        oldestAgeHours: ageHours(input.oldestPendingVerificationAt),
        deepLink: '/wallet?tab=pending',
        severity: 'warning' as const,
      },
      {
        key: 'unpaid_tickets',
        label: 'Tickets awaiting payment',
        count: input.pendingTicketsCount,
        oldestAgeHours: ageHours(input.oldestPendingTicketAt),
        deepLink: '/tickets/unpaid',
        severity: 'info' as const,
      },
      {
        key: 'waiting_approval',
        label: 'Tickets waiting approval',
        count: input.waitingApprovalCount,
        oldestAgeHours: ageHours(input.oldestWaitingApprovalAt),
        deepLink: '/tickets/waiting-approval',
        severity: 'info' as const,
      },
      {
        key: 'clerk_submitted',
        label: 'Representative submissions to verify',
        count: input.clerkSubmittedCount,
        oldestAgeHours: null,
        // §9: see the method-level doc above — this MUST stay identical to
        // the 'waiting_approval' deepLink above; it was '/tickets/in-progress',
        // a list that structurally cannot contain a WAITING_APPROVAL ticket.
        deepLink: '/tickets/waiting-approval',
        severity: 'info' as const,
      },
      {
        key: 'stuck_in_progress',
        label: 'Tickets stuck in progress > 7 days',
        count: input.stuckInProgressCount,
        oldestAgeHours: null,
        deepLink: '/tickets/in-progress',
        severity: 'danger' as const,
      },
      {
        key: 'aged_outstanding',
        label: 'Outstanding > 30 days (PKR)',
        count: Math.max(0, Math.round(input.agedOutstandingAmount)),
        oldestAgeHours: null,
        deepLink: '/finance',
        severity: 'danger' as const,
      },
    ];
  }

  private async computeSummary(range: string) {
    const daysStr = range.replace('d', '');
    const days = parseInt(daysStr, 10);

    if (isNaN(days) || ![7, 30, 90].includes(days)) {
      throw new BadRequestException(
        'Invalid range. Supported values: 7d, 30d, 90d',
      );
    }

    const startDate = startOfDay(subDays(new Date(), days - 1));
    const prevStart = startOfDay(subDays(new Date(), days * 2 - 1));
    const prevEnd = startDate;

    const totalTickets = await this.prisma.ticket.count({
      where: { archivedAt: null },
    });
    const completedTickets = await this.prisma.ticket.count({
      where: { status: 'COMPLETED', archivedAt: null },
    });

    const { totalRevenue, outstandingBalance, unconvertedCount } =
      await this.getRevenueKpis();
    const business = await this.getBusinessKpis();

    const kpis = {
      totalTickets,
      completedTickets,
      totalRevenue,
      outstandingBalance,
      unconvertedCount,
      // Batch-7 3.1
      totalBusiness: business.totalBusiness,
      wusuqProfit: business.wusuqProfit,
      representativeProfit: business.representativeProfit,
      consumerAdvance: business.consumerAdvance,
      // Batch-8 item 7: how many consumer wallets hold credit in a currency
      // this PKR total cannot include. Rendered as an exclusion note, the
      // same contract every other mixed-currency aggregate follows.
      consumerAdvanceExcluded: business.nonPkrWalletCount,
    };

    // Period-over-period deltas (current window vs same-length prior window)
    const [
      currTicketsInRange,
      prevTicketsInRange,
      currCompletedInRange,
      prevCompletedInRange,
      currRevenueAgg,
      prevRevenueAgg,
    ] = await Promise.all([
      this.prisma.ticket.count({
        where: { createdAt: { gte: startDate }, archivedAt: null },
      }),
      this.prisma.ticket.count({
        where: {
          createdAt: { gte: prevStart, lt: prevEnd },
          archivedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: {
          status: 'COMPLETED',
          updatedAt: { gte: startDate },
          archivedAt: null,
        },
      }),
      this.prisma.ticket.count({
        where: {
          status: 'COMPLETED',
          updatedAt: { gte: prevStart, lt: prevEnd },
          archivedAt: null,
        },
      }),
      // Audit 1.11: revenue = money applied to tickets, which is exactly the
      // TICKET_DEBIT rows (wallet settlement + finance reconcile). TOPUP and
      // TICKET_PAYMENT rows are the consumer handing us money — verifying a
      // TICKET_PAYMENT immediately writes a TICKET_DEBIT for the applied
      // amount, so counting both would double-count.
      this.prisma.walletTransaction.aggregate({
        where: {
          verifiedAt: { gte: startDate },
          status: 'VERIFIED',
          type: 'TICKET_DEBIT',
        },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: {
          verifiedAt: { gte: prevStart, lt: prevEnd },
          status: 'VERIFIED',
          type: 'TICKET_DEBIT',
        },
        _sum: { amount: true },
      }),
    ]);

    const pct = (curr: number, prev: number): number | null => {
      if (prev === 0) return curr === 0 ? 0 : null;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    const kpisDelta = {
      totalTickets: pct(currTicketsInRange, prevTicketsInRange),
      completedTickets: pct(currCompletedInRange, prevCompletedInRange),
      totalRevenue: pct(
        Number(currRevenueAgg._sum.amount || 0),
        Number(prevRevenueAgg._sum.amount || 0),
      ),
      outstandingBalance: null as number | null,
    };

    const statusGroups = await this.prisma.ticket.groupBy({
      by: ['status'],
      where: { archivedAt: null },
      _count: { _all: true },
    });
    const ticketsByStatus = statusGroups.map((g) => ({
      name: g.status,
      value: g._count._all,
    }));

    // Fetch tickets in range for trend and mix
    const recentTickets = await this.prisma.ticket.findMany({
      where: { createdAt: { gte: startDate }, archivedAt: null },
      select: {
        createdAt: true,
        serviceCity: true,
        service: { select: { category: true } },
      },
    });

    // Compute Ticket Trend
    const ticketTrendMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      ticketTrendMap.set(format(subDays(new Date(), i), 'MMM dd'), 0);
    }

    recentTickets.forEach((t) => {
      const day = format(t.createdAt, 'MMM dd');
      if (ticketTrendMap.has(day)) {
        ticketTrendMap.set(day, ticketTrendMap.get(day)! + 1);
      }
    });

    const ticketTrend = Array.from(ticketTrendMap.entries())
      .reverse()
      .map(([date, count]) => ({ date, count }));

    // Per-day completed tickets for KPI sparkline
    const completedInRange = await this.prisma.ticket.findMany({
      where: {
        status: 'COMPLETED',
        updatedAt: { gte: startDate },
        archivedAt: null,
      },
      select: { updatedAt: true },
    });
    const completedTrendMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      completedTrendMap.set(format(subDays(new Date(), i), 'MMM dd'), 0);
    }
    completedInRange.forEach((t) => {
      const day = format(t.updatedAt, 'MMM dd');
      if (completedTrendMap.has(day)) {
        completedTrendMap.set(day, completedTrendMap.get(day)! + 1);
      }
    });
    const completedTrend = Array.from(completedTrendMap.entries())
      .reverse()
      .map(([date, count]) => ({ date, count }));

    // Service Mix & City Mix
    const serviceMixMap = new Map<string, number>();
    const cityMixMap = new Map<string, number>();

    recentTickets.forEach((t) => {
      // Service Mix
      const cat = t.service?.category || 'Unknown';
      serviceMixMap.set(cat, (serviceMixMap.get(cat) || 0) + 1);

      // City Mix
      const city = t.serviceCity || 'Unknown';
      cityMixMap.set(city, (cityMixMap.get(city) || 0) + 1);
    });

    const serviceMix = Array.from(serviceMixMap.entries()).map(
      ([name, value]) => ({ name, value }),
    );
    const cityMix = Array.from(cityMixMap.entries()).map(([name, value]) => ({
      name,
      value,
    }));

    // Finance Trend (simplified: based on ticket creation date for simplicity, mapping to their amountPaid)
    // In a real scenario, we'd query WalletTransaction verifiedAt or Invoice paidAt.
    const recentTransactions = await this.prisma.walletTransaction.findMany({
      where: { verifiedAt: { gte: startDate }, status: 'VERIFIED' },
      select: { verifiedAt: true, amount: true },
    });

    const financeTrendMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      financeTrendMap.set(format(subDays(new Date(), i), 'MMM dd'), 0);
    }
    recentTransactions.forEach((tx) => {
      if (!tx.verifiedAt) return;
      const day = format(tx.verifiedAt, 'MMM dd');
      if (financeTrendMap.has(day)) {
        financeTrendMap.set(day, financeTrendMap.get(day)! + Number(tx.amount));
      }
    });
    const financeTrend = Array.from(financeTrendMap.entries())
      .reverse()
      .map(([date, amount]) => ({ date, amount }));

    // Pending Actions — structured for the action center
    const sevenDaysAgo = subDays(new Date(), 7);
    const thirtyDaysAgo = subDays(new Date(), 30);

    const [
      pendingVerifications,
      oldestPendingVerification,
      pendingTicketsCount,
      oldestPendingTicket,
      waitingApprovalCount,
      oldestWaitingApproval,
      clerkSubmittedCount,
      stuckInProgressCount,
      agedOutstandingKpi,
    ] = await Promise.all([
      this.prisma.walletTransaction.count({
        where: { status: 'PENDING_VERIFICATION' },
      }),
      this.prisma.walletTransaction.findFirst({
        where: { status: 'PENDING_VERIFICATION' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.ticket.count({
        where: { status: 'UNPAID', archivedAt: null },
      }),
      this.prisma.ticket.findFirst({
        where: { status: 'UNPAID', archivedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.ticket.count({
        where: { status: 'WAITING_APPROVAL', archivedAt: null },
      }),
      this.prisma.ticket.findFirst({
        where: { status: 'WAITING_APPROVAL', archivedAt: null },
        orderBy: { updatedAt: 'asc' },
        select: { updatedAt: true },
      }),
      this.prisma.ticket.count({
        where: { clerkApprovalStatus: 'SUBMITTED', archivedAt: null },
      }),
      this.prisma.ticket.count({
        where: {
          status: 'IN_PROGRESS',
          updatedAt: { lt: sevenDaysAgo },
          archivedAt: null,
        },
      }),
      this.getAgedOutstandingKpi(thirtyDaysAgo),
    ]);

    const agedOutstandingAmount = agedOutstandingKpi.amount;

    const pendingActions = this.buildPendingActions({
      pendingVerifications,
      oldestPendingVerificationAt: oldestPendingVerification?.createdAt,
      pendingTicketsCount,
      oldestPendingTicketAt: oldestPendingTicket?.createdAt,
      waitingApprovalCount,
      oldestWaitingApprovalAt: oldestWaitingApproval?.updatedAt,
      clerkSubmittedCount,
      stuckInProgressCount,
      agedOutstandingAmount,
    });

    // Cases-with-suggestions row (case workflow redesign §2.5).
    // Counts open, non-deleted cases that have at least one active
    // recommendation. Uses the pure shared filter — no DB roundtrip per case.
    const openCases = await this.prisma.case.findMany({
      where: { status: 'OPEN', deletedAt: null },
      select: {
        id: true,
        createdAt: true,
        tickets: {
          // Batch-5 B: an archived ticket must not keep driving a case's
          // recommendation — it's deleted as far as the user is concerned.
          where: { archivedAt: null },
          select: {
            status: true,
            intakeFlow: true,
            service: { select: { flowKey: true } },
          },
        },
      },
    });

    let casesWithRecommendations = 0;
    let oldestRecommendationCaseAt: Date | null = null;
    for (const c of openCases) {
      const triggerFlows: FlowKey[] = [];
      const blockingFlows: FlowKey[] = [];
      for (const t of c.tickets) {
        const flow = t.service?.flowKey ?? t.intakeFlow;
        if (!flow || !isFlowKey(flow)) continue;
        blockingFlows.push(flow);
        if (t.status === 'COMPLETED') triggerFlows.push(flow);
      }
      const recs = recommendationsForCase({ triggerFlows, blockingFlows });
      if (recs.length > 0) {
        casesWithRecommendations++;
        if (
          !oldestRecommendationCaseAt ||
          c.createdAt < oldestRecommendationCaseAt
        ) {
          oldestRecommendationCaseAt = c.createdAt;
        }
      }
    }

    pendingActions.push({
      key: 'case_recommendations',
      label: 'Cases with suggested next steps',
      count: casesWithRecommendations,
      oldestAgeHours: oldestRecommendationCaseAt
        ? Math.round((Date.now() - oldestRecommendationCaseAt.getTime()) / 36e5)
        : null,
      deepLink: '/cases?filter=has_recommendations',
      severity: 'info' as const,
    });

    // Recent Activity
    const recentActivity = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Today's hearings — sourced from tickets with scheduledDate set today.
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const todayTickets = await this.prisma.ticket.findMany({
      where: {
        scheduledDate: { gte: todayStart, lte: todayEnd },
        caseId: { not: null },
        archivedAt: null,
      },
      orderBy: { scheduledDate: 'asc' },
      take: 8,
      select: {
        id: true,
        scheduledDate: true,
        hearingType: true,
        case: {
          select: {
            id: true,
            title: true,
            consumer: { select: { id: true, name: true } },
          },
        },
      },
    });
    const todaysHearings = todayTickets.map((t) => ({
      id: t.id,
      scheduledDate: t.scheduledDate,
      hearingType: t.hearingType,
      case: t.case,
    }));

    // Top paralegals — by completed-ticket count in current range
    const topAssignments = await this.prisma.assignment.groupBy({
      by: ['representativeId'],
      where: {
        ticket: {
          status: 'COMPLETED',
          updatedAt: { gte: startDate },
          // Batch-5 B: reach the ticket through the relation filter, so an
          // archived ticket stops counting toward a clerk's completed tally.
          // Client: "ticket 0 hy to clerks ki tickets kesy ho sakti hy" — with
          // every ticket deleted, Top Paralegals still showed Abbas Ali 1 /
          // Bilal 1.
          archivedAt: null,
        },
      },
      _count: { _all: true },
      orderBy: { _count: { representativeId: 'desc' } },
      take: 5,
    });
    const topRepIds = topAssignments.map((a) => a.representativeId);
    const topRepUsers = topRepIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: topRepIds } },
          select: { id: true, name: true, email: true, city: true },
        })
      : [];
    const topParalegals = topAssignments.map((a) => {
      const user = topRepUsers.find((u) => u.id === a.representativeId);
      return {
        id: a.representativeId,
        name: user?.name ?? 'Unknown',
        email: user?.email ?? null,
        city: user?.city ?? null,
        completed: a._count._all,
      };
    });

    const kpiSparks = {
      totalTickets: ticketTrend.map((p) => p.count),
      completedTickets: completedTrend.map((p) => p.count),
      totalRevenue: financeTrend.map((p) => p.amount),
      outstandingBalance: [] as number[],
    };

    return {
      kpis,
      kpisDelta,
      kpiSparks,
      ticketsByStatus,
      ticketTrend,
      financeTrend,
      serviceMix,
      cityMix,
      pendingActions,
      recentActivity,
      todaysHearings,
      topParalegals,
    };
  }
}
