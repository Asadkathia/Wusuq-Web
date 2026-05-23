import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { TicketsService } from '../tickets/tickets.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { FilterCasesDto } from './dto/filter-cases.dto';
import { UpdateCaseStatusDto } from './dto/update-case-status.dto';
import { CreateCaseTicketDto } from './dto/create-case-ticket.dto';
import { Prisma } from '@prisma/client';
import { recommendationsForCase, isFlowKey, type FlowKey } from '@wusuq/shared';

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly ticketsService: TicketsService,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  async createCase(
    dto: CreateCaseDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const consumer = await this.prisma.user.findUnique({
      where: { id: dto.consumerId },
    });
    if (!consumer) {
      throw new NotFoundException('Consumer not found');
    }

    const stamp = Date.now().toString().slice(-8);
    const rand = Math.floor(Math.random() * 9000 + 1000);
    const caseRef = `CASE-${stamp}-${rand}`;

    const newCase = await this.prisma.case.create({
      data: {
        ...dto,
        caseRef,
        status: 'OPEN',
      },
    });

    await this.prisma.caseEvent.create({
      data: {
        caseId: newCase.id,
        type: 'CASE_CREATED',
        title: `Case opened: ${newCase.title}`,
        actorUserId: actor?.actorUserId,
      },
    });

    await this.auditLogsService.create({
      action: 'CASE_CREATED',
      entity: 'CASE',
      entityId: newCase.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { caseRef },
    });

    await this.dispatcher.caseCreated(newCase.id).catch(() => undefined);

    return newCase;
  }

  async findAll(query: FilterCasesDto) {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.CaseWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.consumerId ? { consumerId: query.consumerId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              {
                caseRef: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                title: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    if (query.hasRecommendations) {
      // Recommendations are computed, not stored, so filter in memory after
      // fetching the candidate set. Limited to OPEN cases — closed/archived
      // cases don't get recommended next steps.
      const candidates = await this.prisma.case.findMany({
        where: { ...where, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        include: {
          consumer: { select: { id: true, name: true } },
          _count: { select: { tickets: true } },
          tickets: {
            select: {
              status: true,
              intakeFlow: true,
              service: { select: { flowKey: true } },
            },
          },
        },
      });

      const filtered = candidates.filter((c) => {
        const triggerFlows: FlowKey[] = [];
        const blockingFlows: FlowKey[] = [];
        for (const t of c.tickets) {
          const flow = t.service?.flowKey ?? t.intakeFlow;
          if (!flow || !isFlowKey(flow)) continue;
          blockingFlows.push(flow);
          if (t.status === 'COMPLETED') triggerFlows.push(flow);
        }
        return (
          recommendationsForCase({ triggerFlows, blockingFlows }).length > 0
        );
      });

      const total = filtered.length;
      const items = filtered
        .slice(skip, skip + query.limit)
        // Strip the heavy `tickets` payload before returning.
        .map(({ tickets: _tickets, ...rest }) => rest);

      return {
        items,
        page: query.page,
        limit: query.limit,
        total,
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.case.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          consumer: { select: { id: true, name: true } },
          _count: {
            select: { tickets: true },
          },
        },
      }),
      this.prisma.case.count({ where }),
    ]);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async findOne(id: string) {
    const caseRec = await this.prisma.case.findFirst({
      where: { id, deletedAt: null },
      include: {
        consumer: {
          select: { id: true, name: true, phone: true, email: true },
        },
        tickets: {
          orderBy: { createdAt: 'desc' },
          include: { service: { select: { name: true } } },
        },
        events: { orderBy: { createdAt: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!caseRec) {
      throw new NotFoundException('Case not found');
    }

    return caseRec;
  }

  async updateCase(
    id: string,
    dto: UpdateCaseDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const updated = await this.prisma.case.update({
      where: { id },
      data: dto,
    });

    await this.prisma.caseEvent.create({
      data: {
        caseId: id,
        type: 'CASE_UPDATED',
        title: 'Case metadata updated',
        actorUserId: actor?.actorUserId,
      },
    });

    await this.auditLogsService.create({
      action: 'CASE_UPDATED',
      entity: 'CASE',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { updates: { ...dto } },
    });

    return updated;
  }

  async updateStatus(
    id: string,
    dto: UpdateCaseStatusDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const caseRec = await this.prisma.case.findFirst({
      where: { id, deletedAt: null },
    });
    if (!caseRec) {
      throw new NotFoundException('Case not found');
    }

    if (caseRec.status === dto.status) {
      return caseRec;
    }

    let eventType: 'CASE_CLOSED' | 'CASE_REOPENED' | 'CASE_UPDATED' =
      'CASE_UPDATED';
    if (dto.status === 'CLOSED' || dto.status === 'ARCHIVED') {
      eventType = 'CASE_CLOSED';
    } else if (caseRec.status === 'CLOSED' || caseRec.status === 'ARCHIVED') {
      if (dto.status === 'OPEN') eventType = 'CASE_REOPENED';
    }

    const updated = await this.prisma.case.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes ?? caseRec.notes,
        closedAt:
          dto.status === 'CLOSED'
            ? new Date()
            : dto.status === 'OPEN'
              ? null
              : caseRec.closedAt,
      },
    });

    await this.prisma.caseEvent.create({
      data: {
        caseId: id,
        type: eventType,
        title: `Case status changed to ${dto.status}`,
        description: dto.notes,
        actorUserId: actor?.actorUserId,
      },
    });

    await this.auditLogsService.create({
      action: 'CASE_STATUS_UPDATED',
      entity: 'CASE',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { from: caseRec.status, to: dto.status },
    });

    await this.dispatcher
      .caseStatusChanged(id, caseRec.status, dto.status)
      .catch(() => undefined);

    return updated;
  }

  async deleteCase(
    id: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const caseRec = await this.prisma.case.findFirst({
      where: { id, deletedAt: null },
    });
    if (!caseRec) {
      throw new NotFoundException('Case not found');
    }

    // Soft delete: preserves history (events, tickets, audit log) and is
    // reversible. Hard purge is a separate admin op (out of scope).
    await this.prisma.case.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.create({
      action: 'CASE_DELETED',
      entity: 'CASE',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { caseRef: caseRec.caseRef },
    });

    return { deleted: true, id };
  }

  async getCaseTimeline(id: string) {
    await this.findOne(id);

    return this.prisma.caseEvent.findMany({
      where: { caseId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        ticket: {
          select: {
            batchNo: true,
            status: true,
            serviceCost: true,
            totalAmount: true,
            service: { select: { name: true } },
          },
        },
      },
    });
  }

  async getCaseSummary(id: string) {
    const caseRec = await this.prisma.case.findFirst({
      where: { id, deletedAt: null },
      include: { tickets: true },
    });

    if (!caseRec) throw new NotFoundException('Case not found');

    const totalTickets = caseRec.tickets.length;
    const pending = caseRec.tickets.filter(
      (t) => t.status === 'UNPAID' || t.status === 'PAID',
    ).length;
    const inProgress = caseRec.tickets.filter(
      (t) => t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED',
    ).length;
    const completed = caseRec.tickets.filter(
      (t) => t.status === 'COMPLETED',
    ).length;
    const validTickets = caseRec.tickets;
    const totalCost = validTickets.reduce(
      (sum, t) => sum + Number(t.totalAmount || 0),
      0,
    );
    const amountPaid = validTickets.reduce(
      (sum, t) => sum + Number(t.amountPaid || 0),
      0,
    );

    const lastEvent = await this.prisma.caseEvent.findFirst({
      where: { caseId: id },
      orderBy: { createdAt: 'desc' },
    });

    const activeTicket = caseRec.tickets.find(
      (t) => t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED',
    );

    // Next scheduled item — first future ticket with scheduledDate set.
    const nextScheduled = caseRec.tickets
      .filter(
        (t) =>
          t.scheduledDate && new Date(t.scheduledDate).getTime() >= Date.now(),
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledDate!).getTime() -
          new Date(b.scheduledDate!).getTime(),
      )[0];

    return {
      caseRef: caseRec.caseRef,
      title: caseRec.title,
      status: caseRec.status,
      openedAt: caseRec.createdAt,
      ticketStats: { total: totalTickets, pending, inProgress, completed },
      financials: {
        totalCost,
        amountPaid,
        outstanding: totalCost - amountPaid,
      },
      lastActivity: lastEvent?.createdAt,
      nextHearing: nextScheduled
        ? {
            scheduledDate: nextScheduled.scheduledDate,
            hearingType: nextScheduled.hearingType,
            ticketId: nextScheduled.id,
          }
        : null,
      activeTicket: activeTicket || null,
    };
  }

  async createCaseTicket(
    caseId: string,
    dto: CreateCaseTicketDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const caseRec = await this.prisma.case.findFirst({
      where: { id: caseId, status: 'OPEN', deletedAt: null },
    });
    if (!caseRec) throw new BadRequestException('Case must exist and be OPEN');

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });
    if (!service) throw new NotFoundException('Service not found');

    let formPayload: Record<string, unknown> = {};

    if (caseRec.type === 'JUDICIAL') {
      formPayload = {
        select_service: service.name,
        case_title: caseRec.title,
        ...(caseRec.courtLevel && { select_court: caseRec.courtLevel }),
        ...(caseRec.courtCity && { select_court_city: caseRec.courtCity }),
        ...(caseRec.caseNo && { case_petition_no: caseRec.caseNo }),
        ...(caseRec.caseYear && { case_year: caseRec.caseYear.toString() }),
        ...(caseRec.caseCategory && { case_type: caseRec.caseCategory }),
        ...(caseRec.courtCaseStatus && {
          case_status: caseRec.courtCaseStatus,
        }),
        no_of_sets: '1',
        mode_of_delivery: 'By Hand',
      };
    } else {
      formPayload = {
        select_service: service.name,
        case_title: caseRec.title,
        case_date: new Date().toISOString().split('T')[0],
        sets: '1',
        set_type: 'attested',
        delivery_mode: 'self_collection',
        city_type: 'City',
        ...(caseRec.province && { province: caseRec.province }),
        ...(caseRec.district && { district_id: caseRec.district }),
        ...(caseRec.policeStation && { station_id: caseRec.policeStation }),
        ...(caseRec.firNo && { fir_no: caseRec.firNo }),
        ...(caseRec.offence && { offence: caseRec.offence }),
        ...(caseRec.caseYear && { year: caseRec.caseYear.toString() }),
        ...(caseRec.officeCity && { city: caseRec.officeCity }),
        ...(caseRec.docNo && { doc_no: caseRec.docNo }),
      };
    }

    if (dto.overrides) {
      formPayload = { ...formPayload, ...dto.overrides };
    }

    // Resolve the flow: prefer Service.flowKey (canonical), fall back to
    // legacy inferFlow for services that haven't been backfilled yet.
    const flow =
      dto.flow || service.flowKey || this.inferFlow(service, caseRec.type);

    // Single atomic create — caseId is written in the same row insert by
    // ticketsService.createIntakeTicket (no second update).
    const ticket = await this.ticketsService.createIntakeTicket(
      {
        flow,
        consumerId: caseRec.consumerId,
        serviceId: service.id,
        payload: formPayload,
        caseId,
      },
      actor,
    );

    const ticketWithService = await this.prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: { service: true },
    });

    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: 'TICKET_CREATED',
        title: `Ticket created: ${service.name} (${ticket.batchNo})`,
        ticketId: ticket.id,
        actorUserId: actor?.actorUserId,
      },
    });

    await this.auditLogsService.create({
      action: 'CASE_TICKET_CREATED',
      entity: 'TICKET',
      entityId: ticket.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { caseId },
    });

    return ticketWithService;
  }

  async listCaseTickets(caseId: string) {
    return this.prisma.ticket.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      include: {
        service: { select: { name: true, category: true, type: true } },
        assignments: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { representative: { select: { id: true, name: true } } },
        },
      },
    });
  }

  /**
   * Lists unresolved drift events for a case. A drift is unresolved when a
   * CONTEXT_DRIFT_DETECTED event exists for a field with no later
   * CONTEXT_RESOLVED event for the same field.
   */
  async getUnresolvedDrifts(caseId: string) {
    await this.findOne(caseId);
    const events = await this.prisma.caseEvent.findMany({
      where: {
        caseId,
        type: { in: ['CONTEXT_DRIFT_DETECTED', 'CONTEXT_RESOLVED'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    type Pending = {
      id: string;
      field: string;
      caseValue: string;
      ticketValue: string;
      ticketId: string | null;
      detectedAt: Date;
    };

    const pendingByField = new Map<string, Pending>();
    for (const e of events) {
      const meta =
        e.metadata && typeof e.metadata === 'object'
          ? (e.metadata as Record<string, unknown>)
          : {};
      const field = typeof meta.field === 'string' ? meta.field : '';
      if (!field) continue;

      if (e.type === 'CONTEXT_DRIFT_DETECTED') {
        pendingByField.set(field, {
          id: e.id,
          field,
          caseValue: typeof meta.caseValue === 'string' ? meta.caseValue : '',
          ticketValue:
            typeof meta.ticketValue === 'string' ? meta.ticketValue : '',
          ticketId: e.ticketId,
          detectedAt: e.createdAt,
        });
      } else if (e.type === 'CONTEXT_RESOLVED') {
        pendingByField.delete(field);
      }
    }

    return [...pendingByField.values()].sort(
      (a, b) => a.detectedAt.getTime() - b.detectedAt.getTime(),
    );
  }

  /**
   * Resolves a drift event by writing the chosen value to the Case row and
   * appending a CONTEXT_RESOLVED event. `source: 'CASE'` keeps the existing
   * value; `source: 'TICKET'` adopts the ticket-reported value.
   */
  async resolveDrift(
    caseId: string,
    eventId: string,
    source: 'CASE' | 'TICKET',
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const event = await this.prisma.caseEvent.findFirst({
      where: { id: eventId, caseId, type: 'CONTEXT_DRIFT_DETECTED' },
    });
    if (!event) throw new NotFoundException('Drift event not found');

    const meta =
      event.metadata && typeof event.metadata === 'object'
        ? (event.metadata as Record<string, unknown>)
        : {};
    const field = typeof meta.field === 'string' ? meta.field : '';
    const caseValue = typeof meta.caseValue === 'string' ? meta.caseValue : '';
    const ticketValue =
      typeof meta.ticketValue === 'string' ? meta.ticketValue : '';
    if (!field) throw new BadRequestException('Drift event is missing field');

    const chosenValue = source === 'TICKET' ? ticketValue : caseValue;

    if (source === 'TICKET') {
      // Coerce caseYear back to a number on assignment.
      const data: Record<string, string | number> =
        field === 'caseYear'
          ? { caseYear: parseInt(ticketValue, 10) || 0 }
          : { [field]: ticketValue };
      await this.prisma.case.update({ where: { id: caseId }, data });
    }

    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: 'CONTEXT_RESOLVED',
        title: `Resolved drift: ${field} → ${source.toLowerCase()} value`,
        description: `Chose ${source} value "${chosenValue}".`,
        ticketId: event.ticketId,
        actorUserId: actor?.actorUserId,
        metadata: { field, chosenValue, source, driftEventId: event.id },
      },
    });

    await this.auditLogsService.create({
      action: 'CASE_DRIFT_RESOLVED',
      entity: 'CASE',
      entityId: caseId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { field, source, chosenValue },
    });

    return { resolved: true, field, source, chosenValue };
  }

  /**
   * Logs a RECOMMENDATION_TRIGGERED event when a user clicks a suggested
   * next-step card. Used for analytics; does not change state otherwise.
   */
  async trackRecommendationClick(
    caseId: string,
    body: { flowKey: string; surface?: string },
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    await this.findOne(caseId);
    if (!isFlowKey(body.flowKey)) {
      throw new BadRequestException('Unknown flowKey');
    }
    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: 'RECOMMENDATION_TRIGGERED',
        title: `Suggestion clicked: ${body.flowKey}`,
        actorUserId: actor?.actorUserId,
        metadata: {
          flowKey: body.flowKey,
          surface: body.surface ?? 'case_detail',
        },
      },
    });
    return { tracked: true };
  }

  /**
   * Computes "next ticket" recommendations for a case from current ticket
   * state (Option D filter — see spec). Pure function of state; no
   * persistence.
   */
  async getRecommendations(caseId: string) {
    await this.findOne(caseId);

    const tickets = await this.prisma.ticket.findMany({
      where: { caseId },
      select: {
        intakeFlow: true,
        status: true,
        service: { select: { flowKey: true } },
      },
    });

    const triggerFlows: FlowKey[] = [];
    const blockingFlows: FlowKey[] = [];

    for (const t of tickets) {
      // Prefer Service.flowKey (canonical), fall back to ticket.intakeFlow.
      const flow = t.service?.flowKey ?? t.intakeFlow;
      if (!flow || !isFlowKey(flow)) continue;
      // Today's TicketStatus enum has no CANCELLED. Treat REJECTED-like
      // states (none today) as un-blocking when added; for now every
      // status that isn't a future cancellation counts as blocking.
      blockingFlows.push(flow);
      if (t.status === 'COMPLETED') triggerFlows.push(flow);
    }

    return recommendationsForCase({ triggerFlows, blockingFlows });
  }

  private inferFlow(service: { category?: string | null }, caseType: string) {
    if (caseType === 'JUDICIAL') {
      if (service.category?.toLowerCase().includes('filing'))
        return 'judicial_case_filing';
      if (service.category?.toLowerCase().includes('search'))
        return 'judicial_case_search';
      if (service.category?.toLowerCase().includes('attorney'))
        return 'judicial_power_of_attorney';
      return 'judicial_case_information';
    }
    if (service.category?.toLowerCase().includes('fir'))
      return 'non_judicial_copy_of_fir';
    return 'non_judicial_registry_deed';
  }
}
