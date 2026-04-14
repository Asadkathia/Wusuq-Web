import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { TicketsService } from '../tickets/tickets.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { FilterCasesDto } from './dto/filter-cases.dto';
import { UpdateCaseStatusDto } from './dto/update-case-status.dto';
import { CreateHearingDto } from './dto/create-hearing.dto';
import { UpdateHearingDto } from './dto/update-hearing.dto';
import { CreateCaseTicketDto } from './dto/create-case-ticket.dto';
import { ContinueCaseTicketDto } from './dto/continue-case-ticket.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly ticketsService: TicketsService,
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

    return newCase;
  }

  async findAll(query: FilterCasesDto) {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.CaseWhereInput = {
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

    const [items, total] = await this.prisma.$transaction([
      this.prisma.case.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          consumer: { select: { id: true, name: true } },
          _count: {
            select: { tickets: true, hearings: true },
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
    const caseRec = await this.prisma.case.findUnique({
      where: { id },
      include: {
        consumer: { select: { id: true, name: true, phone: true, email: true } },
        hearings: {
          where: { deletedAt: null },
          orderBy: { scheduledDate: 'asc' },
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
      metadata: { updates: dto as any },
    });

    return updated;
  }

  async updateStatus(
    id: string,
    dto: UpdateCaseStatusDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const caseRec = await this.prisma.case.findUnique({ where: { id } });
    if (!caseRec) {
      throw new NotFoundException('Case not found');
    }

    if (caseRec.status === dto.status) {
      return caseRec;
    }

    let eventType: 'CASE_CLOSED' | 'CASE_REOPENED' | 'CASE_UPDATED' = 'CASE_UPDATED';
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
        closedAt: dto.status === 'CLOSED' ? new Date() : dto.status === 'OPEN' ? null : caseRec.closedAt,
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

    return updated;
  }

  async deleteCase(
    id: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const caseRec = await this.prisma.case.findUnique({ where: { id } });
    if (!caseRec) {
      throw new NotFoundException('Case not found');
    }

    await this.prisma.case.delete({ where: { id } });

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
          select: { batchNo: true, status: true, serviceCost: true, totalAmount: true, service: { select: { name: true } } },
        },
        hearing: { select: { scheduledDate: true, hearingType: true } },
      },
    });
  }

  async getCaseSummary(id: string) {
    const caseRec = await this.prisma.case.findUnique({
      where: { id },
      include: {
        tickets: true,
        hearings: {
          where: { deletedAt: null, scheduledDate: { gte: new Date() } },
          orderBy: { scheduledDate: 'asc' },
          take: 1,
        },
      },
    });

    if (!caseRec) throw new NotFoundException('Case not found');

    const totalTickets = caseRec.tickets.length;
    const pending = caseRec.tickets.filter((t) => t.status === 'PENDING').length;
    const inProgress = caseRec.tickets.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED').length;
    const completed = caseRec.tickets.filter((t) => t.status === 'COMPLETED').length;
    const validTickets = caseRec.tickets;
    const totalCost = validTickets.reduce((sum, t) => sum + Number(t.totalAmount || 0), 0);
    const amountPaid = validTickets.reduce((sum, t) => sum + Number(t.amountPaid || 0), 0);

    const lastEvent = await this.prisma.caseEvent.findFirst({
      where: { caseId: id },
      orderBy: { createdAt: 'desc' },
    });

    const activeTicket = caseRec.tickets.find((t) => t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED');

    return {
      caseRef: caseRec.caseRef,
      title: caseRec.title,
      status: caseRec.status,
      openedAt: caseRec.createdAt,
      ticketStats: { total: totalTickets, pending, inProgress, completed },
      financials: { totalCost, amountPaid, outstanding: totalCost - amountPaid },
      lastActivity: lastEvent?.createdAt,
      nextHearing: caseRec.hearings[0] || null,
      activeTicket: activeTicket || null,
    };
  }

  async createHearing(
    caseId: string,
    dto: CreateHearingDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const caseRec = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRec) throw new NotFoundException('Case not found');

    const hearing = await this.prisma.hearing.create({
      data: {
        caseId,
        ...dto,
      },
    });

    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: 'HEARING_SCHEDULED',
        title: `Hearing scheduled: ${dto.scheduledDate.toISOString().split('T')[0]}`,
        description: dto.hearingType,
        hearingId: hearing.id,
        actorUserId: actor?.actorUserId,
      },
    });

    await this.auditLogsService.create({
      action: 'HEARING_SCHEDULED',
      entity: 'HEARING',
      entityId: hearing.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { caseId },
    });

    return hearing;
  }

  async listHearings(caseId: string) {
    return this.prisma.hearing.findMany({
      where: { caseId, deletedAt: null },
      orderBy: { scheduledDate: 'desc' },
      include: {
        _count: { select: { tickets: true } },
      },
    });
  }

  async updateHearing(
    caseId: string,
    hearingId: string,
    dto: UpdateHearingDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const hearing = await this.prisma.hearing.findFirst({
      where: { id: hearingId, caseId, deletedAt: null },
    });
    if (!hearing) throw new NotFoundException('Hearing not found');

    const updated = await this.prisma.hearing.update({
      where: { id: hearingId },
      data: dto,
    });

    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: 'HEARING_UPDATED',
        title: `Hearing updated: ${updated.scheduledDate.toISOString().split('T')[0]}`,
        hearingId: hearing.id,
        actorUserId: actor?.actorUserId,
      },
    });

    return updated;
  }

  async deleteHearing(
    caseId: string,
    hearingId: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const hearing = await this.prisma.hearing.findFirst({
      where: { id: hearingId, caseId, deletedAt: null },
    });
    if (!hearing) throw new NotFoundException('Hearing not found');

    await this.prisma.hearing.update({
      where: { id: hearingId },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.create({
      action: 'HEARING_DELETED',
      entity: 'HEARING',
      entityId: hearingId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { caseId },
    });

    return { deleted: true, id: hearingId };
  }

  async createCaseTicket(
    caseId: string,
    dto: CreateCaseTicketDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const caseRec = await this.prisma.case.findUnique({
      where: { id: caseId, status: 'OPEN' },
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
        ...(caseRec.courtCaseStatus && { case_status: caseRec.courtCaseStatus }),
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

    const flow = dto.flow || this.inferFlow(service, caseRec.type);

    const ticket = await this.ticketsService.createIntakeTicket(
      {
        flow,
        consumerId: caseRec.consumerId,
        serviceId: service.id,
        payload: formPayload,
      },
      actor,
    );

    const updatedTicket = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        caseId,
        hearingId: dto.hearingId,
      },
      include: { service: true },
    });

    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: 'TICKET_CREATED',
        title: `Ticket created: ${service.name} (${ticket.batchNo})`,
        ticketId: ticket.id,
        hearingId: dto.hearingId,
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

    return updatedTicket;
  }

  async continueCaseTicket(
    caseId: string,
    previousTicketId: string,
    dto: ContinueCaseTicketDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const prevTicket = await this.prisma.ticket.findUnique({
      where: { id: previousTicketId },
    });
    if (!prevTicket || prevTicket.caseId !== caseId) {
      throw new BadRequestException('Previous ticket not found in this case');
    }

    const prevPayload = (prevTicket.formPayload as Record<string, unknown>) || {};
    
    // Create new object without unneeded stuff or just pass prevPayload to createCaseTicket
    const mergedOverrides = {
      ...prevPayload,
      ...(dto.overrides || {}),
    };

    return this.createCaseTicket(
      caseId,
      {
        serviceId: dto.serviceId,
        hearingId: dto.hearingId,
        flow: dto.flow,
        overrides: mergedOverrides,
      },
      actor,
    );
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

  private inferFlow(service: any, caseType: string) {
    if (caseType === 'JUDICIAL') {
      if (service.category?.toLowerCase().includes('filing')) return 'judicial_case_filing';
      if (service.category?.toLowerCase().includes('search')) return 'judicial_case_search';
      if (service.category?.toLowerCase().includes('attorney')) return 'judicial_power_of_attorney';
      return 'judicial_case_information'; 
    }
    if (service.category?.toLowerCase().includes('fir')) return 'non_judicial_copy_of_fir';
    return 'non_judicial_registry_deed';
  }
}
