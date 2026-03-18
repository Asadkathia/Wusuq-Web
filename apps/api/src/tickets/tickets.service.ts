import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TicketStatus } from '@wusuq/shared';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CostingService } from '../costing/costing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { BulkTicketActionDto } from './dto/bulk-ticket-action.dto';
import { CreateTicketIntakeDto } from './dto/create-ticket-intake.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';
import { SaveTicketIntakeDraftDto } from './dto/save-ticket-intake-draft.dto';

const INTAKE_FLOWS = new Set([
  'judicial_case_files',
  'judicial_case_information',
  'judicial_case_search',
  'judicial_case_filing',
  'judicial_power_of_attorney',
  'non_judicial_copy_of_fir',
  'non_judicial_registry_deed',
]);

const REQUIRED_FIELDS_BY_FLOW: Record<string, string[]> = {
  judicial_case_files: [
    'select_service',
    'select_court',
    'select_court_city',
    'case_petition_no',
    'case_year',
    'case_type',
    'case_status',
    'case_title',
    'no_of_sets',
    'set_type',
    'mode_of_delivery',
  ],
  judicial_case_information: [
    'select_service',
    'select_court',
    'select_court_city',
    'case_petition_no',
    'case_year',
    'case_type',
    'case_status',
    'case_title',
    'no_of_sets',
    'set_type',
    'mode_of_delivery',
  ],
  judicial_case_search: [
    'select_service',
    'select_court',
    'select_court_city',
    'case_petition_no',
    'case_year',
    'case_type',
    'case_status',
    'case_title',
    'no_of_sets',
    'set_type',
    'mode_of_delivery',
  ],
  judicial_case_filing: [
    'select_service',
    'select_court',
    'select_court_city',
    'case_petition_no',
    'case_year',
    'case_type',
    'case_status',
    'case_title',
    'no_of_sets',
    'set_type',
    'mode_of_delivery',
  ],
  judicial_power_of_attorney: [
    'select_service',
    'select_court',
    'select_court_city',
    'case_petition_no',
    'case_year',
    'case_type',
    'case_status',
    'case_title',
    'no_of_sets',
    'set_type',
    'mode_of_delivery',
  ],
  non_judicial_copy_of_fir: [
    'province_capital',
    'select_district',
    'police_station',
    'fir_no',
    'year',
    'fir_date',
    'offence',
    'title',
    'city_type',
    'mode_of_delivery',
    'no_of_sets',
    'set_type',
  ],
  non_judicial_registry_deed: [
    'office_name',
    'select_city',
    'city_type',
    'doc_no',
    'year',
    'date',
    'title_party_a',
    'title_party_b',
    'mode_of_delivery',
    'no_of_sets',
    'set_type',
  ],
};

const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  PENDING: ['ASSIGNED', 'IMMATURE'],
  ASSIGNED: ['IN_PROGRESS', 'IMMATURE'],
  IN_PROGRESS: ['COMPLETED', 'IMMATURE'],
  COMPLETED: [],
  IMMATURE: [],
};

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly costingService: CostingService,
  ) {}

  async findAll(query: FilterTicketsDto) {
    const skip = (query.page - 1) * query.limit;

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.consumerId ? { consumerId: query.consumerId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                batchNo: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
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
        : {}),
    };

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
          assignments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { representative: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      items: items.map((ticket) => ({
        id: ticket.id,
        batchNo: ticket.batchNo,
        consumer: ticket.consumer,
        service: ticket.service,
        serviceCity: ticket.serviceCity,
        caseType: ticket.caseType,
        intakeFlow: ticket.intakeFlow,
        status: ticket.status,
        assignedRepresentative: ticket.assignments[0]?.representative ?? null,
        createdAt: ticket.createdAt,
      })),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async createIntakeTicket(
    dto: CreateTicketIntakeDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    this.ensureFlowSupported(dto.flow);
    this.validateFlowPayload(dto.flow, dto.payload);

    await this.ensureUserExists(dto.consumerId);
    await this.ensureServiceExists(dto.serviceId);

    const inferredServiceCity =
      dto.serviceCity ??
      this.firstPayloadValue(dto.payload, [
        'select_court_city',
        'select_city',
        'select_district',
      ]);
    const inferredCaseType =
      dto.caseType ??
      this.firstPayloadValue(dto.payload, ['case_type', 'offence', 'title']);
    const inferredProvince =
      dto.province ??
      this.firstPayloadValue(dto.payload, ['province_capital', 'province']);
    const inferredAudience =
      dto.audience ?? this.firstPayloadValue(dto.payload, ['audience']);

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
      select: { id: true, category: true },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const resolvedServiceCost = await this.costingService.resolveServiceCost({
      serviceId: dto.serviceId,
      category: service.category,
      caseType: inferredCaseType,
      province: inferredProvince,
      audience: inferredAudience,
    });

    const serviceCost = resolvedServiceCost.amount;

    const ticket = await this.prisma.ticket.create({
      data: {
        batchNo: this.generateBatchNo(),
        consumerId: dto.consumerId,
        serviceId: dto.serviceId,
        status: 'PENDING',
        serviceCity: inferredServiceCity,
        caseType: inferredCaseType,
        serviceCost,
        totalAmount: serviceCost,
        intakeFlow: dto.flow,
        formPayload: dto.payload as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId: ticket.id,
        to: 'PENDING',
        note: 'Ticket created via intake flow',
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_CREATED',
      entity: 'TICKET',
      entityId: ticket.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { flow: dto.flow },
    });

    return ticket;
  }

  createIntakeTicketFromFlow(
    flow: string,
    dto: Omit<CreateTicketIntakeDto, 'flow'>,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    return this.createIntakeTicket({ ...dto, flow }, actor);
  }

  async saveIntakeDraft(
    dto: SaveTicketIntakeDraftDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    this.ensureFlowSupported(dto.flow);

    const draft = dto.draftId
      ? await this.prisma.ticketIntakeDraft.update({
          where: { id: dto.draftId },
          data: {
            flow: dto.flow,
            consumerId: dto.consumerId,
            serviceId: dto.serviceId,
            step: dto.step,
            payload: dto.payload as Prisma.InputJsonValue | undefined,
          },
        })
      : await this.prisma.ticketIntakeDraft.create({
          data: {
            flow: dto.flow,
            consumerId: dto.consumerId,
            serviceId: dto.serviceId,
            step: dto.step,
            payload: dto.payload as Prisma.InputJsonValue | undefined,
            savedByUserId: actor?.actorUserId,
          },
        });

    await this.auditLogsService.create({
      action: 'TICKET_DRAFT_SAVED',
      entity: 'TICKET_DRAFT',
      entityId: draft.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { flow: dto.flow, step: dto.step },
    });

    return draft;
  }

  async getIntakeDraft(id: string) {
    const draft = await this.prisma.ticketIntakeDraft.findUnique({
      where: { id },
    });

    if (!draft) {
      throw new NotFoundException('Draft not found');
    }

    return draft;
  }

  async updateStatus(
    id: string,
    status: TicketStatus,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (!STATUS_TRANSITIONS[ticket.status].includes(status)) {
      throw new BadRequestException(
        `Invalid transition from ${ticket.status} to ${status}`,
      );
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { status },
    });

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId: id,
        from: ticket.status,
        to: status,
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_STATUS_UPDATED',
      entity: 'TICKET',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { from: ticket.status, to: status },
    });

    return updated;
  }

  async assign(
    id: string,
    dto: AssignTicketDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { service: { select: { id: true, category: true } } },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    await this.ensureUserExists(dto.representativeId);

    const inferredProvince = this.firstPayloadValue(
      (ticket.formPayload as Record<string, unknown> | undefined) ?? undefined,
      ['province_capital', 'province'],
    );

    const autoClerkCost = await this.costingService.resolveClerkCost({
      serviceId: ticket.service.id,
      category: ticket.service.category,
      caseType: ticket.caseType ?? undefined,
      province: inferredProvince,
    });

    const clerkCost = dto.clerkCost ?? autoClerkCost.amount;

    await this.prisma.ticket.update({
      where: { id },
      data: {
        clerkCost,
        additionalServiceCost: clerkCost,
        totalAmount:
          Number(ticket.serviceCost) +
          Number(ticket.deliveryCharges) +
          Number(ticket.printingCharges) +
          Number(ticket.attestedCharges) +
          clerkCost,
      },
    });

    await this.prisma.assignment.create({
      data: {
        ticketId: id,
        representativeId: dto.representativeId,
      },
    });

    await this.updateStatus(id, 'ASSIGNED', actor);

    await this.auditLogsService.create({
      action: 'TICKET_ASSIGNED',
      entity: 'TICKET',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        representativeId: dto.representativeId,
        clerkCost,
      },
    });

    return { id, representativeId: dto.representativeId, assigned: true };
  }

  async representativeCandidates(filters: {
    city?: string;
    district?: string;
  }) {
    return this.prisma.user.findMany({
      where: {
        role: 'representative',
        isActive: true,
        ...(filters.city ? { city: filters.city } : {}),
        ...(filters.district ? { district: filters.district } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        district: true,
        serviceFocus: true,
        court: true,
        courtCity: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async bulkAction(
    dto: BulkTicketActionDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    if (dto.action === 'complete') {
      await this.prisma.ticket.updateMany({
        where: { id: { in: dto.ticketIds }, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED' },
      });
    }

    if (dto.action === 'immature') {
      await this.prisma.ticket.updateMany({
        where: { id: { in: dto.ticketIds } },
        data: { status: 'IMMATURE' },
      });
    }

    if (dto.action === 'delete') {
      await this.prisma.ticket.deleteMany({
        where: { id: { in: dto.ticketIds } },
      });
    }

    await this.auditLogsService.create({
      action: 'TICKET_BULK_ACTION',
      entity: 'TICKET',
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        action: dto.action,
        ticketIds: dto.ticketIds,
      },
    });

    return { accepted: true, action: dto.action, ticketIds: dto.ticketIds };
  }

  async uploadDocument(
    ticketId: string,
    file: {
      filename: string;
      mimetype: string;
      path: string;
    },
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    await this.ensureTicketExists(ticketId);

    const document = await this.prisma.ticketDocument.create({
      data: {
        ticketId,
        name: file.filename,
        type: file.mimetype,
        fileUrl: file.path,
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_DOCUMENT_UPLOADED',
      entity: 'TICKET_DOCUMENT',
      entityId: document.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { ticketId },
    });

    return document;
  }

  async timeline(ticketId: string) {
    await this.ensureTicketExists(ticketId);

    const [history, assignments, documents] = await this.prisma.$transaction([
      this.prisma.ticketStatusHistory.findMany({
        where: { ticketId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.assignment.findMany({
        where: { ticketId },
        include: {
          representative: {
            select: { id: true, name: true, city: true, district: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.ticketDocument.findMany({
        where: { ticketId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return { history, assignments, documents };
  }

  async regenerate(
    ticketId: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const original = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!original) {
      throw new NotFoundException('Ticket not found');
    }

    const cloned = await this.prisma.ticket.create({
      data: {
        batchNo: this.generateBatchNo(),
        consumerId: original.consumerId,
        serviceId: original.serviceId,
        status: 'PENDING',
        serviceCity: original.serviceCity,
        caseType: original.caseType,
        intakeFlow: original.intakeFlow,
        formPayload: (original.formPayload ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        serviceCost: original.serviceCost,
      },
    });

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId: cloned.id,
        to: 'PENDING',
        note: `Regenerated from ${original.batchNo}`,
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_REGENERATED',
      entity: 'TICKET',
      entityId: cloned.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        sourceTicketId: original.id,
        sourceBatchNo: original.batchNo,
      },
    });

    return cloned;
  }

  private generateBatchNo() {
    const stamp = Date.now().toString().slice(-8);
    const rand = Math.floor(Math.random() * 9000 + 1000);
    return `TKT-${stamp}-${rand}`;
  }

  private ensureFlowSupported(flow: string) {
    if (!INTAKE_FLOWS.has(flow)) {
      throw new BadRequestException('Unsupported intake flow');
    }
  }

  private validateFlowPayload(flow: string, payload?: Record<string, unknown>) {
    const required = REQUIRED_FIELDS_BY_FLOW[flow] ?? [];
    if (required.length === 0) {
      return;
    }

    if (!payload) {
      throw new BadRequestException('Payload is required for selected flow');
    }

    const missing = required.find((key) => {
      const value = payload[key];
      return !(typeof value === 'string' && value.trim().length > 0);
    });

    if (missing) {
      throw new BadRequestException(
        `Missing required payload field: ${missing}`,
      );
    }
  }

  private firstPayloadValue(
    payload: Record<string, unknown> | undefined,
    keys: string[],
  ) {
    if (!payload) {
      return undefined;
    }

    const value = keys
      .map((key) => payload[key])
      .find((item) => typeof item === 'string' && item.trim().length > 0);

    return typeof value === 'string' ? value : undefined;
  }

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private async ensureServiceExists(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }
  }

  private async ensureTicketExists(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
  }
}
