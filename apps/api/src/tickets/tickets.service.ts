import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  requiredFieldsFor,
  courtTierFromCourtType,
  paymentModelFor,
  chargeCapabilitiesFor,
  isFullyPaid,
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
import { FinalizeRemainderDto } from './dto/finalize-remainder.dto';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { WalletService } from '../wallet/wallet.service';

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
    'judge_name',
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
    'case_title',
    'judge_name',
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
  ],
  non_judicial_registry_deed: [
    'office_name',
    'city',
    'city_type',
    'doc_no',
    'year',
    'case_title',
    'delivery_mode',
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
  UNPAID: ['PAID'],
  PAID: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_APPROVAL'],
  WAITING_APPROVAL: ['COMPLETED', 'IN_PROGRESS'],
  COMPLETED: ['DELIVERED'],
  DELIVERED: [],
};

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly pricingService: PricingService,
    private readonly geoService: GeoService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly walletService: WalletService,
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
        payload: ticket.formPayload as Record<string, string> | null,
        status: ticket.status,
        clerkApprovalStatus: ticket.clerkApprovalStatus,
        clerkReceiptUrl: ticket.clerkReceiptUrl,
        serviceCost: ticket.serviceCost,
        totalAmount: ticket.totalAmount,
        amountPaid: ticket.amountPaid,
        createdBy: ticket.createdBy,
        remainderFinalizedAt: ticket.remainderFinalizedAt,
        scheduledDate: ticket.scheduledDate,
        hearingType: ticket.hearingType,
        clerkCost: ticket.clerkCost,
        defaultClerkCost: ticket.defaultClerkCost,
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

  async findOne(id: string, caller?: { role: string; userId: string }) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        consumer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            cnic: true,
            address: true,
            province: true,
            district: true,
            city: true,
          },
        },
        service: {
          select: { id: true, name: true, category: true, type: true },
        },
        assignments: {
          orderBy: { createdAt: 'desc' },
          include: {
            representative: {
              select: {
                id: true,
                name: true,
                phone: true,
                city: true,
                district: true,
                court: true,
              },
            },
          },
        },
        documents: true,
        history: { orderBy: { createdAt: 'asc' } },
        clerkReport: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (caller?.role === 'CONSUMER') {
      const completed = ticket.status === 'COMPLETED';
      (ticket as { documents: typeof ticket.documents }).documents = completed
        ? (ticket.documents ?? []).filter((d) => d.visibleToConsumer)
        : [];
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
      metadata: { updates: { ...dto } },
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
    const caseYear = rawYear ? parseInt(rawYear, 10) || undefined : undefined;
    const setType = payload['set_type'];
    let attestedQty = 0;
    let nonAttestedQty = 0;
    if (setType === 'attested') {
      attestedQty = parseInt(payload['attested_qty'] ?? '0', 10) || 0;
    } else if (setType === 'non_attested') {
      nonAttestedQty = parseInt(payload['non_attested_qty'] ?? '0', 10) || 0;
    } else if (setType === 'both') {
      attestedQty = parseInt(payload['both_attested_qty'] ?? '0', 10) || 0;
      nonAttestedQty =
        parseInt(payload['both_non_attested_qty'] ?? '0', 10) || 0;
    }

    const province = payload['province'] ?? payload['province_capital'] ?? '';
    const city =
      payload['select_court_city'] ??
      payload['city'] ??
      payload['select_city'] ??
      '';
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

    // SPLIT flows (e.g. judicial_case_files) bill base only at creation;
    // phase-2 surcharges (attested, printing, delivery, pdf) are added at
    // finalize (Task 1.4). ONE_TIME flows bill the full computed total upfront.
    const billedTotal = pricing.matched
      ? paymentModelFor(dto.flow) === 'SPLIT'
        ? pricing.serviceCost
        : pricing.total
      : 0;

    const ticket = await this.prisma.ticket.create({
      data: {
        batchNo: this.generateBatchNo(),
        consumerId: dto.consumerId,
        serviceId: dto.serviceId,
        status: 'UNPAID',
        createdBy:
          actor?.actorUserId && actor.actorUserId === dto.consumerId
            ? 'CONSUMER'
            : 'ADMIN_STAFF',
        serviceCity: inferredServiceCity,
        caseType: inferredCaseType,
        serviceCost: pricing.matched ? pricing.serviceCost : 0,
        deliveryCharges: pricing.matched ? pricing.deliveryCharge : 0,
        defaultClerkCost: pricing.matched
          ? (pricing.clerkBaseCost ?? null)
          : null,
        totalAmount: billedTotal,
        intakeFlow: dto.flow,
        formPayload: dto.payload as Prisma.InputJsonValue | undefined,
        // Atomic case linkage + scheduling. Replaces the prior two-step
        // pattern in cases.service.ts (create then update).
        caseId: dto.caseId,
        scheduledDate: dto.scheduledDate
          ? new Date(dto.scheduledDate)
          : undefined,
        hearingType: dto.hearingType,
      },
    });

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId: ticket.id,
        to: 'UNPAID',
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

    // Drafts are auto-saved every 5s while the consumer fills out the wizard
    // (TicketIntakeDraft is upserted on the unique (consumerId, flow) key).
    // Once a ticket is created from that draft the draft is stale — delete it
    // so it doesn't reappear in the consumer's drafts list as a phantom
    // duplicate of the just-submitted ticket.
    await this.prisma.ticketIntakeDraft
      .delete({
        where: {
          consumerId_flow: { consumerId: dto.consumerId, flow: dto.flow },
        },
      })
      .catch(() => undefined);

    await this.dispatcher.ticketCreated(ticket.id).catch(() => undefined);

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

    // QA: belt-and-suspenders against the autosave/submit race. If a ticket
    // for this (consumerId, flow) was just created (within the last 30s),
    // refuse the draft upsert — the autosave POST is almost certainly a
    // stale closure firing after the user already submitted, and accepting
    // it would resurrect the just-deleted draft and pre-fill the next
    // intake with the previous ticket's payload.
    const recentTicketCutoff = new Date(Date.now() - 30_000);
    const recentTicket = await this.prisma.ticket.findFirst({
      where: {
        consumerId: dto.consumerId,
        intakeFlow: dto.flow,
        createdAt: { gte: recentTicketCutoff },
      },
      select: { id: true },
    });
    if (recentTicket) {
      this.logger.debug(
        `Suppressed draft autosave for consumer ${dto.consumerId} / flow ${dto.flow}: ticket ${recentTicket.id} was just created.`,
      );
      // Return a stable shape mirroring a draft so callers don't crash; the
      // wizard's autosave only reads the id off the response.
      return {
        id: '',
        flow: dto.flow,
        consumerId: dto.consumerId,
        serviceId: dto.serviceId ?? null,
        step: dto.step ?? 1,
        payload: dto.payload ?? null,
        suppressed: true,
      };
    }

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

  async listConsumerDrafts(consumerId: string) {
    return this.prisma.ticketIntakeDraft.findMany({
      where: { consumerId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // QA cosmetic: "Start Fresh" in the wizard needs to remove the server-side
  // draft so a subsequent page reload doesn't restore it. Returns
  // { deleted: boolean } so the client can distinguish "removed something"
  // from "nothing to remove" without surfacing 404s as errors.
  async deleteActiveDraft({
    consumerId,
    flow,
    actorUserId,
    actorEmail,
  }: {
    consumerId: string;
    flow: string;
    actorUserId?: string;
    actorEmail?: string;
  }): Promise<{ deleted: boolean }> {
    this.ensureFlowSupported(flow);
    const existing = await this.prisma.ticketIntakeDraft.findUnique({
      where: { consumerId_flow: { consumerId, flow } },
      select: { id: true },
    });
    if (!existing) {
      return { deleted: false };
    }
    await this.prisma.ticketIntakeDraft.delete({
      where: { id: existing.id },
    });
    await this.auditLogsService.create({
      action: 'TICKET_DRAFT_DELETED',
      entity: 'TICKET_DRAFT',
      entityId: existing.id,
      actorUserId,
      actorEmail,
      metadata: { flow, trigger: 'start_fresh' },
    });
    return { deleted: true };
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

    if (status === 'DELIVERED' && !isFullyPaid(ticket)) {
      throw new ForbiddenException('Final payment required before delivery.');
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        status,
      },
      include: {
        consumer: {
          select: { id: true, name: true, phone: true, email: true },
        },
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

      const docs = await this.prisma.ticketDocument.findMany({
        where: { ticketId: id },
      });
      for (const doc of docs) {
        if (!doc.visibleToConsumer) continue;
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

    await this.dispatcher
      .ticketStatusChanged(id, ticket.status, status)
      .catch(() => undefined);

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
      caseRecommendations = recommendationsForCase({
        triggerFlows,
        blockingFlows,
      });
    }

    return { ...updated, caseRecommendations };
  }

  async overrideStatus(
    ticketId: string,
    status: TicketStatus,
    actor: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status },
    });
    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId,
        to: status,
        note: `Admin override from ${ticket.status}`,
      },
    });
    await this.auditLogsService.create({
      action: 'TICKET_STATUS_OVERRIDDEN',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
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
    const priorAssignment = await this.prisma.assignment.findFirst({
      where: { ticketId: id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { representativeId: true },
    });
    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id },
        data: {
          clerkCost,
          totalAmount: nextTotalAmount,
          status: 'ASSIGNED',
        },
      }),
      this.prisma.assignment.updateMany({
        where: { ticketId: id, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED' },
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

    if (
      priorAssignment &&
      priorAssignment.representativeId !== dto.representativeId
    ) {
      await this.dispatcher
        .ticketReassigned(
          id,
          priorAssignment.representativeId,
          dto.representativeId,
        )
        .catch(() => undefined);
    } else {
      await this.dispatcher
        .ticketAssigned(id, dto.representativeId)
        .catch(() => undefined);
    }

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

  async assignBulk(
    dto: {
      ticketIds: string[];
      representativeId: string;
      forceAssign?: boolean;
    },
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const assigned: string[] = [];
    const skipped: { ticketId: string; reason: string }[] = [];
    for (const ticketId of dto.ticketIds) {
      const t = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, defaultClerkCost: true },
      });
      if (!t) {
        skipped.push({ ticketId, reason: 'Not found' });
        continue;
      }
      try {
        await this.assign(
          ticketId,
          {
            representativeId: dto.representativeId,
            clerkCost:
              t.defaultClerkCost != null
                ? Number(t.defaultClerkCost)
                : undefined,
            forceAssign: dto.forceAssign,
          },
          actor,
        );
        assigned.push(ticketId);
      } catch (e) {
        skipped.push({
          ticketId,
          reason: e instanceof Error ? e.message : 'Failed',
        });
      }
    }
    return { assigned, skipped };
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
          await this.updateStatus(
            ticketId,
            'COMPLETED',
            'Bulk completion',
            actor,
          );
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
    visibleToConsumer: boolean = false,
    category: 'WORK_DOCUMENT' | 'DELIVERABLE_PDF' = 'WORK_DOCUMENT',
  ) {
    await this.ensureTicketExists(ticketId);

    const trimmedCaption = caption?.trim();
    const consumerVisible =
      category === 'DELIVERABLE_PDF' ? true : visibleToConsumer;
    const document = await this.prisma.ticketDocument.create({
      data: {
        ticketId,
        name: file.filename,
        type: file.mimetype,
        fileUrl: file.path,
        caption:
          trimmedCaption && trimmedCaption.length > 0 ? trimmedCaption : null,
        visibleToConsumer: consumerVisible,
        category,
        uploadedByUserId: actor?.actorUserId ?? null,
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_DOCUMENT_UPLOADED',
      entity: 'TICKET_DOCUMENT',
      entityId: document.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { ticketId, visibleToConsumer: consumerVisible },
    });

    if (consumerVisible) {
      await this.dispatcher
        .ticketDocumentUploaded(ticketId)
        .catch(() => undefined);
    }

    return document;
  }

  async patchDocument(
    ticketId: string,
    documentId: string,
    dto: { visibleToConsumer: boolean },
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const doc = await this.prisma.ticketDocument.findFirst({
      where: { id: documentId, ticketId },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    const updated = await this.prisma.ticketDocument.update({
      where: { id: documentId },
      data: { visibleToConsumer: dto.visibleToConsumer },
    });
    await this.auditLogsService.create({
      action: 'TICKET_DOCUMENT_VISIBILITY_CHANGED',
      entity: 'TICKET_DOCUMENT',
      entityId: documentId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        ticketId,
        from: doc.visibleToConsumer,
        to: dto.visibleToConsumer,
      },
    });
    return updated;
  }

  async resolveDocumentDownload(
    ticketId: string,
    documentId: string,
    caller: { userId: string; role: string; consumerId: string | null },
  ): Promise<{ filePath: string; name: string; type: string }> {
    const doc = await this.prisma.ticketDocument.findFirst({
      where: { id: documentId, ticketId },
      include: { ticket: { select: { consumerId: true, status: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const isConsumer = caller.role === 'CONSUMER';
    if (isConsumer) {
      if (doc.ticket.consumerId !== caller.consumerId) {
        throw new ForbiddenException('Not your ticket');
      }
      if (!doc.visibleToConsumer) {
        throw new ForbiddenException('Document not visible to consumer');
      }
      if (doc.ticket.status !== 'COMPLETED') {
        throw new ForbiddenException('Document available after completion');
      }
    }
    return { filePath: doc.fileUrl, name: doc.name, type: doc.type };
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
        status: 'UNPAID',
        createdBy: original.createdBy ?? 'ADMIN_STAFF',
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
      },
    });

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId: cloned.id,
        to: 'UNPAID',
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

    await this.dispatcher.ticketRegenerated(cloned.id).catch(() => undefined);

    return cloned;
  }

  async submitClerkReceipt(
    ticketId: string,
    receiptUrl: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
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

    await this.dispatcher
      .ticketClerkReceiptSubmitted(ticketId)
      .catch(() => undefined);

    return updated;
  }

  async verifyClerkReceipt(
    ticketId: string,
    decision: 'VERIFIED' | 'REJECTED',
    reason?: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
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

    await this.dispatcher
      .ticketClerkReceiptDecided(ticketId, decision)
      .catch(() => undefined);

    return updated;
  }

  async submitClerkCosts(
    ticketId: string,
    dto: SubmitClerkCostsDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (
      ticket.status !== 'IN_PROGRESS' &&
      ticket.status !== 'WAITING_APPROVAL'
    ) {
      throw new BadRequestException(
        'Ticket must be in progress or waiting approval',
      );
    }

    const deliveryCharges =
      dto.deliveryCharges ?? Number(ticket.deliveryCharges);
    const printingCharges =
      dto.printingCharges ??
      this.computePrintingCharges(dto.noOfPages, dto.costPerPage) ??
      Number(ticket.printingCharges);
    const attestedCharges =
      dto.attestedCharges ?? Number(ticket.attestedCharges);
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
          ...(fa.attested !== undefined
            ? { attestedAvailable: fa.attested }
            : {}),
          ...(fa.nonAttested !== undefined
            ? { nonAttestedAvailable: fa.nonAttested }
            : {}),
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
        filesAvailable: dto.filesAvailable
          ? { ...dto.filesAvailable }
          : undefined,
        perPageRateAttested: dto.perPageRateAttested,
        perPageRateNonAttested: dto.perPageRateNonAttested,
        unavailableReason: dto.unavailableReason,
        partialCompletion: dto.partialCompletion,
        from: ticket.status,
        to: 'WAITING_APPROVAL',
      },
    });

    await this.dispatcher
      .ticketClerkCostsSubmitted(ticketId)
      .catch(() => undefined);

    return updated;
  }

  async acceptAssignment(
    ticketId: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    if (ticket.status !== 'ASSIGNED') {
      throw new BadRequestException('Only ASSIGNED tickets can be accepted');
    }

    const activeAssignment = await this.prisma.assignment.findFirst({
      where: { ticketId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeAssignment) {
      throw new BadRequestException('No active assignment to accept');
    }
    if (
      actor?.actorUserId &&
      activeAssignment.representativeId !== actor.actorUserId
    ) {
      throw new ForbiddenException(
        'Only the assigned representative can accept',
      );
    }

    const txResult = await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      }),
      this.prisma.assignment.update({
        where: { id: activeAssignment.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      }),
      this.prisma.ticketStatusHistory.create({
        data: {
          ticketId,
          from: 'ASSIGNED',
          to: 'IN_PROGRESS',
          note: 'Assignment accepted',
        },
      }),
    ]);
    const updated = txResult[0];

    await this.auditLogsService.create({
      action: 'TICKET_ASSIGNMENT_ACCEPTED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { from: 'ASSIGNED', to: 'IN_PROGRESS' },
    });

    await this.dispatcher
      .ticketAssignmentAccepted(ticketId)
      .catch(() => undefined);

    return updated;
  }

  async rejectAssignment(
    ticketId: string,
    reason: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException(
        'A reason is required to reject an assignment',
      );
    }
    const trimmedReason = reason.trim();
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    if (ticket.status !== 'ASSIGNED') {
      throw new BadRequestException('Only assigned tickets can be rejected');
    }

    const activeAssignment = await this.prisma.assignment.findFirst({
      where: { ticketId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    const txOps: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'PAID' },
      }),
    ];
    if (activeAssignment) {
      txOps.push(
        this.prisma.assignment.update({
          where: { id: activeAssignment.id },
          data: {
            status: 'REJECTED',
            rejectedAt: new Date(),
            rejectionReason: trimmedReason,
          },
        }),
      );
    }
    txOps.push(
      this.prisma.ticketStatusHistory.create({
        data: {
          ticketId,
          from: 'ASSIGNED',
          to: 'PAID',
          note: trimmedReason,
        },
      }),
    );

    const txResult = await this.prisma.$transaction(txOps);
    const updated = txResult[0];

    await this.auditLogsService.create({
      action: 'TICKET_ASSIGNMENT_REJECTED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { reason: trimmedReason, from: 'ASSIGNED', to: 'PAID' },
    });

    if (activeAssignment) {
      await this.dispatcher
        .ticketAssignmentRejected(ticketId, trimmedReason)
        .catch(() => undefined);
    }

    return updated;
  }

  /**
   * Clerk draft: write phase-2 charge fields to the ticket without finalizing.
   * Does not modify totalAmount. Intended for clerk review
   * before an admin confirms/edits and calls finalizeRemainder.
   */
  async saveClerkCharges(
    ticketId: string,
    dto: FinalizeRemainderDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, intakeFlow: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const caps = chargeCapabilitiesFor(ticket.intakeFlow);
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        attestedCharges: caps.attestation
          ? (dto.attestedCharges ?? undefined)
          : 0,
        nonAttestedCharges: caps.attestation
          ? (dto.nonAttestedCharges ?? undefined)
          : 0,
        printingCharges: caps.printing
          ? (dto.printingCharges ?? undefined)
          : undefined,
        deliveryCharges: caps.delivery
          ? (dto.deliveryCharges ?? undefined)
          : undefined,
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_CLERK_CHARGES_SAVED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { ...dto },
    });

    return this.findOne(ticketId);
  }

  /**
   * Admin finalize: recompute totalAmount from capability-gated, admin-edited
   * charges; set remainderFinalizedAt; trigger wallet settlement so any excess
   * balance auto-covers the new total.
   */
  async finalizeRemainder(
    ticketId: string,
    dto: FinalizeRemainderDto,
    actor: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        consumerId: true,
        serviceCost: true,
        clerkCost: true,
        additionalCharges: true,
        additionalServiceCost: true,
        discountPrice: true,
        amountPaid: true,
        intakeFlow: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const caps = chargeCapabilitiesFor(ticket.intakeFlow);
    // Attestation / printing / delivery have NO default rates — they are the
    // amounts the clerk entered (and the admin edited) for this ticket.
    const attested = caps.attestation ? Number(dto.attestedCharges ?? 0) : 0;
    const nonAttested = caps.attestation
      ? Number(dto.nonAttestedCharges ?? 0)
      : 0;
    const printing = caps.printing ? Number(dto.printingCharges ?? 0) : 0;
    const delivery = caps.delivery ? Number(dto.deliveryCharges ?? 0) : 0;
    // PDF is opt-in: the consumer is charged the standard PDF fee only when a
    // PDF is requested. The admin sets the amount at finalize (the frontend
    // defaults the input to the standard Rs 300); 0/absent means no PDF.
    const pdf = caps.pdf ? Number(dto.pdfCharges ?? 0) : 0;
    // Clerk assignment cost is consumer-billed (set at assignment) and any
    // additional charges / discount persisted earlier must be preserved so
    // finalize stays consistent with assignClerk's total computation.
    const total =
      Number(ticket.serviceCost) +
      Number(ticket.clerkCost ?? 0) +
      Number(ticket.additionalCharges ?? 0) +
      Number(ticket.additionalServiceCost ?? 0) -
      Number(ticket.discountPrice ?? 0) +
      attested +
      nonAttested +
      printing +
      delivery +
      pdf;
    const paid = Number(ticket.amountPaid);

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        attestedCharges: attested,
        nonAttestedCharges: nonAttested,
        printingCharges: printing,
        deliveryCharges: delivery,
        totalAmount: total,
        remainderFinalizedAt: new Date(),
        remainderFinalizedByUserId: actor.actorUserId ?? null,
      },
    });

    // Auto-cover from any wallet excess, then notify if a balance remains.
    await this.walletService.settleTicketsForUser(ticket.consumerId);
    await this.dispatcher.paymentRemainderDue(ticketId).catch(() => undefined);

    await this.auditLogsService.create({
      action: 'TICKET_REMAINDER_FINALIZED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
      metadata: { total, attested, nonAttested, printing, delivery, pdf },
    });

    return this.findOne(ticketId);
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
    const baseRequired = REQUIRED_FIELDS_BY_FLOW[flow] ?? [];
    if (baseRequired.length === 0) {
      return;
    }

    if (!payload) {
      throw new BadRequestException('Payload is required for selected flow');
    }

    // QA B6/B7: required-field FE/BE drift fix — apply per-tier overrides
    // from shared so fields the wizard marks optional (red ✗ in the PDF
    // matrix) don't fail the API validator with a generic "missing
    // required field" error on submit.
    const courtType =
      typeof payload['select_court_type'] === 'string'
        ? payload['select_court_type']
        : undefined;
    const tier = courtTierFromCourtType(courtType);
    const required = requiredFieldsFor(flow, baseRequired, tier);

    const missing = required.find(
      (key) =>
        !this.hasPayloadStringValue(payload, [
          key,
          ...(PAYLOAD_FIELD_ALIASES[key] ?? []),
        ]),
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
      select: {
        id: true,
        role: true,
        isActive: true,
        city: true,
        courtCity: true,
      },
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
      {
        column: 'caseYear',
        canonical: 'case_year',
        parse: (v) => {
          const s =
            typeof v === 'string'
              ? v.trim()
              : typeof v === 'number'
                ? String(v)
                : '';
          const n = parseInt(s, 10);
          return Number.isFinite(n) ? n : null;
        },
      },
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
      const parsed = m.parse
        ? m.parse(raw)
        : typeof raw === 'string'
          ? raw.trim()
          : typeof raw === 'number'
            ? String(raw)
            : '';
      if (parsed === null || parsed === '') continue;

      const existing = caseAsRecord[m.column];
      if (existing === null || existing === undefined || existing === '') {
        updateData[m.column] = parsed;
        continue;
      }
      // Normalised compare (string-form, case-insensitive for free text).
      const a =
        typeof existing === 'number'
          ? String(existing)
          : typeof existing === 'string'
            ? existing.trim()
            : '';
      const b =
        typeof parsed === 'number' ? String(parsed) : String(parsed).trim();
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

    if (drifts.length > 0) {
      await this.dispatcher.caseDriftDetected(caseId).catch(() => undefined);
    }
  }

  async recordNextHearing(
    ticketId: string,
    dto: { scheduledDate: string; hearingType?: string },
  ) {
    await this.ensureTicketExists(ticketId);
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        scheduledDate: new Date(dto.scheduledDate),
        ...(dto.hearingType ? { hearingType: dto.hearingType } : {}),
      },
    });
  }

  private static FUTURE_COPIED_KEYS = [
    'city',
    'city_id',
    'select_court',
    'select_court_id',
    'select_court_type',
    'select_court_city',
    'case_type',
    'case_no',
    'case_title',
    'case_year',
    'bench',
    'judge_name',
    'judge_designation',
  ];

  async generateNextHearing(
    parentId: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const parent = await this.prisma.ticket.findUnique({
      where: { id: parentId },
    });
    if (!parent) throw new NotFoundException('Ticket not found');
    if (!parent.scheduledDate)
      throw new BadRequestException(
        'No next-hearing date recorded on this ticket',
      );

    const srcPayload = (parent.formPayload ?? {}) as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const k of TicketsService.FUTURE_COPIED_KEYS) {
      if (srcPayload[k] !== undefined) payload[k] = srcPayload[k];
    }
    payload.case_status = 'Pending Case';
    payload.case_date = parent.scheduledDate.toISOString().slice(0, 10);
    payload.parent_ticket_id = parent.id;

    const cloned = await this.prisma.ticket.create({
      data: {
        batchNo: this.generateBatchNo(),
        consumerId: parent.consumerId,
        serviceId: parent.serviceId,
        status: 'UNPAID',
        createdBy: 'CONSUMER',
        serviceCity: parent.serviceCity,
        caseType: parent.caseType,
        intakeFlow: parent.intakeFlow,
        formPayload: payload as Prisma.InputJsonValue,
        serviceCost: parent.serviceCost,
        defaultClerkCost: parent.defaultClerkCost,
        totalAmount: parent.serviceCost,
        amountPaid: 0,
      },
    });

    await this.prisma.ticketStatusHistory.create({
      data: {
        ticketId: cloned.id,
        to: 'UNPAID',
        note: `Generated next-hearing from ${parent.batchNo}`,
      },
    });

    await this.auditLogsService.create({
      action: 'TICKET_NEXT_HEARING_GENERATED',
      entity: 'TICKET',
      entityId: cloned.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: {
        sourceTicketId: parent.id,
        sourceBatchNo: parent.batchNo,
        scheduledDate: parent.scheduledDate.toISOString(),
      },
    });

    return cloned;
  }
}
