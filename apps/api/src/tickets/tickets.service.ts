import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, type Prisma } from '@prisma/client';
import type { TicketStatus } from '@wusuq/shared';
import {
  PAYLOAD_FIELD_ALIASES as SHARED_ALIASES,
  readAliased,
  recommendationsForCase,
  isFlowKey,
  type FlowKey,
} from '@wusuq/shared';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PricingService } from '../pricing/pricing.service';
import { GeoService } from '../geo/geo.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { BulkTicketActionDto } from './dto/bulk-ticket-action.dto';
import { CreateTicketIntakeDto } from './dto/create-ticket-intake.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';
import { SaveTicketIntakeDraftDto } from './dto/save-ticket-intake-draft.dto';
import { SubmitClerkCostsDto } from './dto/submit-clerk-costs.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { NotificationsService } from '../notifications/notifications.service';

const INTAKE_FLOWS = new Set([
  'judicial_case_files',
  'judicial_case_information',
  'judicial_case_search',
  'judicial_case_filing',
  'judicial_power_of_attorney',
  'non_judicial_copy_of_fir',
  'non_judicial_registry_deed',
  'non_judicial_criminal_record_search',
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
    'sets',
    'set_type',
    'delivery_mode',
  ],
  judicial_case_information: [
    'select_service',
    'select_court',
    'select_court_city',
    'case_petition_no',
    'case_year',
    'case_type',
    'case_title',
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
    'sets',
    'set_type',
    'delivery_mode',
  ],
  judicial_case_filing: [
    // PDF #42: Case Filing covers both NEW cases (no case-number yet — that's
    // the whole point: the lawyer is filing it now) and replies on PENDING
    // cases. `case_petition_no` is therefore intentionally NOT required here;
    // when the consumer is replying on a pending case the wizard captures it
    // under `case_no` (aliased to `case_petition_no` via PAYLOAD_FIELD_ALIASES)
    // but it must remain optional at the validator level so new-case filings
    // can submit cleanly.
    'select_service',
    'select_court',
    'select_court_city',
    'case_year',
    'case_type',
    'case_status',
    'case_title',
  ],
  judicial_power_of_attorney: [
    'select_service',
    'select_court',
    'select_court_city',
    'case_petition_no',
    'case_year',
    'case_type',
    'case_title',
  ],
  non_judicial_copy_of_fir: [
    'province',
    'district_id',
    'fir_no',
    'year',
    'offence',
    'case_title',
    'city_type',
    'delivery_mode',
    'sets',
    'set_type',
  ],
  non_judicial_registry_deed: [
    'office_name',
    'city',
    'city_type',
    'doc_no',
    'year',
    'case_title',
    'delivery_mode',
    'sets',
    'set_type',
  ],
  non_judicial_criminal_record_search: [
    'province',
    'district_id',
    'city',
    'station_id',
    'subject_cnic',
    'subject_full_name',
    'purpose',
    'delivery_mode',
  ],
};

// Re-exported from @wusuq/shared so the API and web stay in sync.
const PAYLOAD_FIELD_ALIASES: Record<string, readonly string[]> = SHARED_ALIASES;

const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  PENDING: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_APPROVAL'],
  WAITING_APPROVAL: ['COMPLETED', 'IN_PROGRESS'],
  COMPLETED: [],
};

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly pricingService: PricingService,
    private readonly geoService: GeoService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(query: FilterTicketsDto) {
    const skip = (query.page - 1) * query.limit;

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.serviceCity
        ? {
            serviceCity: {
              contains: query.serviceCity,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(query.consumerId ? { consumerId: query.consumerId } : {}),
      ...(query.representativeId
        ? {
            assignments: {
              some: { representativeId: query.representativeId },
            },
          }
        : {}),
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
              {
                consumer: {
                  email: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                serviceCity: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                caseType: {
                  contains: query.search,
                  mode: 'insensitive' as const,
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
        clerkApprovalStatus: ticket.clerkApprovalStatus,
        clerkReceiptUrl: ticket.clerkReceiptUrl,
        serviceCost: ticket.serviceCost,
        totalAmount: ticket.totalAmount,
        deliveryCharges: ticket.deliveryCharges,
        printingCharges: ticket.printingCharges,
        attestedCharges: ticket.attestedCharges,
        nonAttestedCharges: ticket.nonAttestedCharges,
        additionalCharges: ticket.additionalCharges,
        assignedRepresentative: ticket.assignments[0]?.representative ?? null,
        createdAt: ticket.createdAt,
      })),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async findOne(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        consumer: {
          select: {
            id: true, name: true, email: true, phone: true,
            cnic: true, address: true, province: true, district: true, city: true,
          },
        },
        service: {
          select: { id: true, name: true, category: true, type: true },
        },
        assignments: {
          orderBy: { createdAt: 'desc' },
          include: {
            representative: {
              select: { id: true, name: true, phone: true, city: true, district: true, court: true },
            },
          },
        },
        documents: true,
        history: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async update(
    id: string,
    dto: UpdateTicketDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.update({
      where: { id },
      data: {
        ...dto,
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_UPDATED',
      entity: 'TICKET',
      entityId: ticket.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { updates: dto as any },
    });

    return ticket;
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
        'city',
        'select_city',
        'select_district',
      ]);
    const inferredCaseType =
      dto.caseType ??
      this.firstPayloadValue(dto.payload, [
        'case_type',
        'offence',
        'case_title',
        'title',
      ]);

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
      select: { id: true, category: true },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    // Resolve pricing BEFORE creating the ticket so a misconfigured flow
    // fails fast instead of orphaning a zero-priced row that wallet
    // auto-deduction would silently skip.
    const payload = (dto.payload ?? {}) as Record<string, string | undefined>;
    const courtLevel = payload['select_court_type'];
    const caseStatus = payload['case_status'];
    const rawYear = payload['case_year'] ?? payload['year'];
    const caseYear = rawYear ? (parseInt(rawYear, 10) || undefined) : undefined;
    const setType = payload['set_type'];
    let attestedQty = 0;
    let nonAttestedQty = 0;
    if (setType === 'attested') {
      attestedQty = parseInt(payload['attested_qty'] ?? '0', 10) || 0;
    } else if (setType === 'non_attested') {
      nonAttestedQty = parseInt(payload['non_attested_qty'] ?? '0', 10) || 0;
    } else if (setType === 'both') {
      attestedQty = parseInt(payload['both_attested_qty'] ?? '0', 10) || 0;
      nonAttestedQty = parseInt(payload['both_non_attested_qty'] ?? '0', 10) || 0;
    }

    const province = payload['province'] ?? payload['province_capital'] ?? '';
    const city = payload['select_court_city'] ?? payload['city'] ?? payload['select_city'] ?? '';
    const pricing = await this.pricingService.resolve({
      flow: dto.flow,
      courtLevel,
      caseStatus,
      caseYear,
      setType,
      attestedQty,
      nonAttestedQty,
      province,
      city,
    });

    if (!pricing.matched && pricing.rulesExistForFlow) {
      // Active rules exist for this flow but none matched the supplied
      // criteria. This is a misconfiguration / payload mismatch — refuse
      // to create a zero-priced ticket that would slip past wallet
      // auto-settlement.
      throw new BadRequestException(
        `No pricing rule matched the supplied criteria for flow "${dto.flow}". ` +
          `Check court level, region, year and set type, or update pricing rules.`,
      );
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        batchNo: this.generateBatchNo(),
        consumerId: dto.consumerId,
        serviceId: dto.serviceId,
        status: 'PENDING',
        serviceCity: inferredServiceCity,
        caseType: inferredCaseType,
        serviceCost: pricing.matched ? pricing.serviceCost : 0,
        deliveryCharges: pricing.matched ? pricing.deliveryCharge : 0,
        totalAmount: pricing.matched ? pricing.total : 0,
        intakeFlow: dto.flow,
        formPayload: dto.payload as Prisma.InputJsonValue | undefined,
        // Atomic case linkage + scheduling. Replaces the prior two-step
        // pattern in cases.service.ts (create then update).
        caseId: dto.caseId,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        hearingType: dto.hearingType,
      },
    });

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId: ticket.id,
        to: 'PENDING',
        note: 'Ticket created via intake flow',
      },
    });

    if (!pricing.matched) {
      // Free flow (no rules configured). Surface for ops awareness.
      this.logger.warn(
        `Ticket ${ticket.id} created free-of-charge: flow "${dto.flow}" has no active pricing rules.`,
      );
    }

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

    // Upsert by (consumerId, flow) so a consumer always has at most one active
    // draft per flow. This is the server-side source of truth for resume —
    // the client only caches the draft id in localStorage as a fast path.
    const payload = dto.payload as Prisma.InputJsonValue | undefined;
    const draft = await this.prisma.ticketIntakeDraft.upsert({
      where: {
        consumerId_flow: { consumerId: dto.consumerId, flow: dto.flow },
      },
      update: {
        serviceId: dto.serviceId,
        step: dto.step,
        payload,
      },
      create: {
        flow: dto.flow,
        consumerId: dto.consumerId,
        serviceId: dto.serviceId,
        step: dto.step,
        payload,
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

  async getActiveDraft({
    consumerId,
    flow,
  }: {
    consumerId: string;
    flow: string;
  }) {
    this.ensureFlowSupported(flow);
    return this.prisma.ticketIntakeDraft.findUnique({
      where: { consumerId_flow: { consumerId, flow } },
    });
  }

  async updateStatus(
    id: string,
    status: TicketStatus,
    note?: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const allowedTransitions = this.getAllowedTransitions(ticket.status);
    if (!allowedTransitions.includes(status)) {
      throw new BadRequestException(
        `Invalid transition from ${ticket.status} to ${status}`,
      );
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        status,
        ...(status === 'COMPLETED' ? { paymentStatus: 'PAID' } : {}),
      },
      include: {
        consumer: { select: { id: true, name: true, phone: true, email: true } },
        service: { select: { id: true, name: true } },
      },
    });

    if (status === 'COMPLETED' && updated.caseId) {
      await this.prisma.caseEvent.create({
        data: {
          caseId: updated.caseId,
          type: 'TICKET_COMPLETED',
          title: `Completed: ${updated.service.name} (${updated.batchNo})`,
          ticketId: id,
          actorUserId: actor?.actorUserId,
        },
      });

      const docs = await this.prisma.ticketDocument.findMany({ where: { ticketId: id } });
      for (const doc of docs) {
        await this.prisma.caseDocument.create({
          data: {
            caseId: updated.caseId,
            ticketId: id,
            name: doc.name,
            type: doc.type,
            fileUrl: doc.fileUrl,
          },
        });
      }

      // Fill-only write-back from ticket payload to Case canonical context
      // (cases workflow design §2.3). Conflicts emit CONTEXT_DRIFT_DETECTED
      // events; values are never overwritten.
      await this.applyTicketCompletionToCase(updated.caseId, id, actor);
    }

    if (status === 'COMPLETED') {
      await this.notificationsService.create({
        userId: updated.consumer.id,
        title: 'Service completed',
        body: `${updated.service.name} has been completed`,
      });
      if (updated.consumer.email) {
        await this.notificationsService.sendEmail(
          updated.consumer.email,
          `Your ticket ${updated.batchNo} is complete`,
          `<p>Your paralegal request <strong>${updated.batchNo}</strong> has been completed. Log in to download your documents.</p>`,
        );
      }
    }

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId: id,
        from: ticket.status,
        to: status,
        note,
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_STATUS_UPDATED',
      entity: 'TICKET',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { from: ticket.status, to: status, note },
    });

    // When marking COMPLETED on a case-linked ticket, surface case
    // recommendations in the response so the admin's UI can show a toast.
    let caseRecommendations: ReturnType<typeof recommendationsForCase> = [];
    if (status === 'COMPLETED' && updated.caseId) {
      const tickets = await this.prisma.ticket.findMany({
        where: { caseId: updated.caseId },
        select: {
          status: true,
          intakeFlow: true,
          service: { select: { flowKey: true } },
        },
      });
      const triggerFlows: FlowKey[] = [];
      const blockingFlows: FlowKey[] = [];
      for (const t of tickets) {
        const flow = t.service?.flowKey ?? t.intakeFlow;
        if (!flow || !isFlowKey(flow)) continue;
        blockingFlows.push(flow);
        if (t.status === 'COMPLETED') triggerFlows.push(flow);
      }
      caseRecommendations = recommendationsForCase({ triggerFlows, blockingFlows });
    }

    return { ...updated, caseRecommendations };
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
    const representative = await this.ensureActiveRepresentativeExists(
      dto.representativeId,
    );
    const allowedTransitions = this.getAllowedTransitions(ticket.status);
    if (!allowedTransitions.includes('ASSIGNED')) {
      throw new BadRequestException(
        `Invalid transition from ${ticket.status} to ASSIGNED`,
      );
    }

    const clerkCost = dto.clerkCost ?? 0;
    let assignmentWarning: string | null = null;
    if (representative.courtCity && ticket.serviceCity) {
      const repCities = [representative.courtCity, representative.city]
        .filter((city): city is string => Boolean(city))
        .map((city) => city.toLowerCase());
      const ticketCity = ticket.serviceCity.toLowerCase();
      const cityMatches = repCities.some(
        (city) => city.includes(ticketCity) || ticketCity.includes(city),
      );
      if (!cityMatches) {
        assignmentWarning =
          'Representative does not serve this city. Pass forceAssign: true to override.';
        if (!dto.forceAssign) {
          throw new ConflictException(assignmentWarning);
        }
      }
    }
    const nextTotalAmount =
      Number(ticket.serviceCost) +
      Number(ticket.deliveryCharges) +
      Number(ticket.printingCharges) +
      Number(ticket.attestedCharges) +
      Number(ticket.nonAttestedCharges) +
      Number(ticket.additionalCharges) +
      Number(ticket.additionalServiceCost) +
      clerkCost -
      Number(ticket.discountPrice);
    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id },
        data: {
          clerkCost,
          totalAmount: nextTotalAmount,
          status: 'ASSIGNED',
        },
      }),
      this.prisma.assignment.create({
        data: {
          ticketId: id,
          representativeId: dto.representativeId,
        },
      }),
      this.prisma.ticketStatusHistory.create({
        data: {
          ticketId: id,
          from: ticket.status,
          to: 'ASSIGNED',
        },
      }),
    ]);

    await this.auditLogsService.create({
      action: 'TICKET_ASSIGNED',
      entity: 'TICKET',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        representativeId: dto.representativeId,
        clerkCost,
        forceAssign: Boolean(dto.forceAssign),
        warning: assignmentWarning,
      },
    });

    return { id, representativeId: dto.representativeId, assigned: true };
  }

  async representativeCandidates(_filters: {
    city?: string;
    district?: string;
  }) {
    // Return all active representatives — admins select from the full pool.
    // Geographic filters were previously hard-excluding reps without a matching
    // city, leaving the dropdown empty for most tickets.
    return this.prisma.user.findMany({
      where: {
        role: 'representative',
        isActive: true,
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
      orderBy: { name: 'asc' },
    });
  }

  async bulkAction(
    dto: BulkTicketActionDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const succeeded: string[] = [];
    const failed: { ticketId: string; error: string }[] = [];

    if (dto.action === 'complete') {
      for (const ticketId of dto.ticketIds) {
        try {
          await this.updateStatus(ticketId, 'COMPLETED', 'Bulk completion', actor);
          succeeded.push(ticketId);
        } catch (err) {
          failed.push({
            ticketId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
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
        ...(dto.action === 'complete' ? { succeeded, failed } : {}),
      },
    });

    return {
      accepted: true,
      action: dto.action,
      ticketIds: dto.ticketIds,
      ...(dto.action === 'complete' ? { succeeded, failed } : {}),
    };
  }

  async uploadDocument(
    ticketId: string,
    file: {
      filename: string;
      mimetype: string;
      path: string;
    },
    actor?: { actorUserId?: string; actorEmail?: string },
    caption?: string,
  ) {
    await this.ensureTicketExists(ticketId);

    const trimmedCaption = caption?.trim();
    const document = await this.prisma.ticketDocument.create({
      data: {
        ticketId,
        name: file.filename,
        type: file.mimetype,
        fileUrl: file.path,
        caption: trimmedCaption && trimmedCaption.length > 0 ? trimmedCaption : null,
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
        deliveryCharges: original.deliveryCharges,
        printingCharges: original.printingCharges,
        attestedCharges: original.attestedCharges,
        nonAttestedCharges: original.nonAttestedCharges,
        additionalCharges: original.additionalCharges,
        additionalServiceCost: original.additionalServiceCost,
        discountPrice: original.discountPrice,
        clerkCost: original.clerkCost,
        totalAmount: original.totalAmount,
        amountPaid: original.amountPaid,
        paymentStatus: original.paymentStatus,
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

  async submitClerkReceipt(
    ticketId: string,
    receiptUrl: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { clerkReceiptUrl: receiptUrl, clerkApprovalStatus: 'SUBMITTED' },
    });

    await this.auditLogsService.create({
      action: 'TICKET_CLERK_RECEIPT_SUBMITTED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return updated;
  }

  async verifyClerkReceipt(
    ticketId: string,
    decision: 'VERIFIED' | 'REJECTED',
    reason?: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.clerkApprovalStatus !== 'SUBMITTED') {
      throw new BadRequestException('No submitted receipt to verify');
    }

    const nextStatus: TicketStatus =
      decision === 'VERIFIED' ? 'WAITING_APPROVAL' : 'IN_PROGRESS';

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        clerkApprovalStatus: decision,
        status: nextStatus,
      },
    });

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId,
        from: ticket.status,
        to: nextStatus,
        note: reason,
      },
    });

    await this.auditLogsService.create({
      action: `TICKET_CLERK_RECEIPT_${decision}`,
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { reason, from: ticket.status, to: nextStatus },
    });

    return updated;
  }

  async submitClerkCosts(
    ticketId: string,
    dto: SubmitClerkCostsDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.status !== 'IN_PROGRESS' && ticket.status !== 'WAITING_APPROVAL') {
      throw new BadRequestException(
        'Ticket must be in progress or waiting approval',
      );
    }

    const deliveryCharges = dto.deliveryCharges ?? Number(ticket.deliveryCharges);
    const printingCharges =
      dto.printingCharges ??
      this.computePrintingCharges(dto.noOfPages, dto.costPerPage) ??
      Number(ticket.printingCharges);
    const attestedCharges = dto.attestedCharges ?? Number(ticket.attestedCharges);
    const nonAttestedCharges =
      dto.nonAttestedCharges ?? Number(ticket.nonAttestedCharges);
    const additionalCharges =
      dto.additionalCharges ?? Number(ticket.additionalCharges);
    const totalAmount =
      Number(ticket.serviceCost) +
      deliveryCharges +
      printingCharges +
      attestedCharges +
      nonAttestedCharges +
      additionalCharges +
      Number(ticket.additionalServiceCost) +
      Number(ticket.clerkCost) -
      Number(ticket.discountPrice);

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        deliveryCharges,
        printingCharges,
        attestedCharges,
        nonAttestedCharges,
        additionalCharges,
        totalAmount,
        clerkApprovalStatus: 'SUBMITTED',
        status: 'WAITING_APPROVAL',
      },
    });

    // Persist clerk-side files-availability report if any clerk-report field
    // was supplied. Upserted so a clerk can resubmit during WAITING_APPROVAL.
    const hasClerkReport =
      dto.filesAvailable !== undefined ||
      dto.perPageRateAttested !== undefined ||
      dto.perPageRateNonAttested !== undefined ||
      dto.unavailableReason !== undefined ||
      dto.partialCompletion !== undefined;

    if (hasClerkReport) {
      const fa = dto.filesAvailable ?? {};
      await this.prisma.ticketClerkReport.upsert({
        where: { ticketId },
        create: {
          ticketId,
          attestedAvailable: fa.attested ?? false,
          nonAttestedAvailable: fa.nonAttested ?? false,
          bothAvailable: fa.both ?? false,
          perPageRateAttested: dto.perPageRateAttested ?? null,
          perPageRateNonAttested: dto.perPageRateNonAttested ?? null,
          unavailableReason: dto.unavailableReason ?? null,
          partialCompletion: dto.partialCompletion ?? false,
        },
        update: {
          ...(fa.attested !== undefined ? { attestedAvailable: fa.attested } : {}),
          ...(fa.nonAttested !== undefined ? { nonAttestedAvailable: fa.nonAttested } : {}),
          ...(fa.both !== undefined ? { bothAvailable: fa.both } : {}),
          ...(dto.perPageRateAttested !== undefined
            ? { perPageRateAttested: dto.perPageRateAttested }
            : {}),
          ...(dto.perPageRateNonAttested !== undefined
            ? { perPageRateNonAttested: dto.perPageRateNonAttested }
            : {}),
          ...(dto.unavailableReason !== undefined
            ? { unavailableReason: dto.unavailableReason }
            : {}),
          ...(dto.partialCompletion !== undefined
            ? { partialCompletion: dto.partialCompletion }
            : {}),
        },
      });
    }

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId,
        from: ticket.status,
        to: 'WAITING_APPROVAL',
        note: dto.rejectionReason,
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_CLERK_COSTS_SUBMITTED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        deliveryCharges,
        printingCharges,
        attestedCharges,
        nonAttestedCharges,
        additionalCharges,
        noOfPages: dto.noOfPages,
        costPerPage: dto.costPerPage,
        rejectionReason: dto.rejectionReason,
        filesAvailable: dto.filesAvailable ? { ...dto.filesAvailable } : undefined,
        perPageRateAttested: dto.perPageRateAttested,
        perPageRateNonAttested: dto.perPageRateNonAttested,
        unavailableReason: dto.unavailableReason,
        partialCompletion: dto.partialCompletion,
        from: ticket.status,
        to: 'WAITING_APPROVAL',
      },
    });

    return updated;
  }

  async rejectAssignment(
    ticketId: string,
    reason: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    if (ticket.status !== 'ASSIGNED') {
      throw new BadRequestException('Only assigned tickets can be rejected');
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'PENDING' },
    });

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId,
        from: 'ASSIGNED',
        to: 'PENDING',
        note: reason,
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_ASSIGNMENT_REJECTED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { reason, from: 'ASSIGNED', to: 'PENDING' },
    });

    return updated;
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

    const missing = required.find(
      (key) => !this.hasPayloadStringValue(payload, [key, ...(PAYLOAD_FIELD_ALIASES[key] ?? [])]),
    );

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

  private hasPayloadStringValue(
    payload: Record<string, unknown>,
    keys: string[],
  ): boolean {
    return keys.some((key) => {
      const value = payload[key];
      return typeof value === 'string' && value.trim().length > 0;
    });
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

  private async ensureActiveRepresentativeExists(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true, city: true, courtCity: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== UserRole.representative || !user.isActive) {
      throw new BadRequestException(
        'Representative must be active and have representative role',
      );
    }

    return user;
  }

  private computePrintingCharges(noOfPages?: number, costPerPage?: number) {
    if (typeof noOfPages === 'number' && typeof costPerPage === 'number') {
      return noOfPages * costPerPage;
    }

    return undefined;
  }

  private getAllowedTransitions(status: string): TicketStatus[] {
    return STATUS_TRANSITIONS[status as TicketStatus];
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

  /**
   * Fill-only write-back from a completed ticket's payload to the Case row.
   * - If the Case field is null and the ticket reports a value → write it.
   * - If both differ → emit CONTEXT_DRIFT_DETECTED, no overwrite.
   * - If both match or ticket has no value → no-op.
   */
  private async applyTicketCompletionToCase(
    caseId: string,
    ticketId: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { formPayload: true },
    });
    const caseRec = await this.prisma.case.findUnique({
      where: { id: caseId },
    });
    if (!ticket || !caseRec) return;

    const payload =
      ticket.formPayload && typeof ticket.formPayload === 'object'
        ? (ticket.formPayload as Record<string, unknown>)
        : {};

    // (caseColumn, payloadCanonicalKey, parser?)
    type Mapping = {
      column: string;
      canonical: string;
      parse?: (raw: unknown) => string | number | null;
    };
    const mappings: Mapping[] = [
      { column: 'caseNo', canonical: 'case_petition_no' },
      { column: 'caseYear', canonical: 'case_year', parse: (v) => {
        const s = String(v ?? '').trim();
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : null;
      } },
      { column: 'court', canonical: 'select_court' },
      { column: 'courtCity', canonical: 'select_court_city' },
      { column: 'caseCategory', canonical: 'case_type' },
      { column: 'courtCaseStatus', canonical: 'case_status' },
      { column: 'judgeDesignation', canonical: 'judge_designation' },
      { column: 'province', canonical: 'province' },
      { column: 'district', canonical: 'district_id' },
      { column: 'policeStation', canonical: 'station_id' },
      { column: 'firNo', canonical: 'fir_no' },
      { column: 'offence', canonical: 'offence' },
      { column: 'docNo', canonical: 'doc_no' },
      { column: 'officeCity', canonical: 'office_city' },
    ];

    const updateData: Record<string, string | number | null> = {};
    type DriftEvent = { field: string; caseValue: string; ticketValue: string };
    const drifts: DriftEvent[] = [];
    const caseAsRecord = caseRec as unknown as Record<string, unknown>;

    for (const m of mappings) {
      const raw = readAliased(payload, m.canonical);
      if (raw === undefined) continue;
      const parsed = m.parse ? m.parse(raw) : String(raw).trim();
      if (parsed === null || parsed === '') continue;

      const existing = caseAsRecord[m.column];
      if (existing === null || existing === undefined || existing === '') {
        updateData[m.column] = parsed;
        continue;
      }
      // Normalised compare (string-form, case-insensitive for free text).
      const a = typeof existing === 'number' ? String(existing) : String(existing).trim();
      const b = typeof parsed === 'number' ? String(parsed) : String(parsed).trim();
      if (a.toLowerCase() === b.toLowerCase()) continue;
      drifts.push({ field: m.column, caseValue: a, ticketValue: b });
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.case.update({
        where: { id: caseId },
        data: updateData,
      });
    }

    for (const d of drifts) {
      await this.prisma.caseEvent.create({
        data: {
          caseId,
          type: 'CONTEXT_DRIFT_DETECTED',
          title: `Drift: ${d.field}`,
          description: `Ticket reported "${d.ticketValue}" but case has "${d.caseValue}".`,
          ticketId,
          actorUserId: actor?.actorUserId,
          metadata: {
            field: d.field,
            caseValue: d.caseValue,
            ticketValue: d.ticketValue,
          },
        },
      });
    }
  }
}
