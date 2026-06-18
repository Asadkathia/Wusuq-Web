import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Prisma, UserRole } from '@prisma/client';
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
  buildPricingResolveInput,
  isConsumerRole,
  isStaffRole,
  computeTicketTotal,
  type TicketChargeComponents,
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
import { RepriceTicketDto } from './dto/reprice-ticket.dto';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { WalletService } from '../wallet/wallet.service';
import { SettingsService } from '../settings/settings.service';
import { PromosService } from '../promos/promos.service';

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
    // 5-24-26 #2/#3: Case Information now collects the same case-identifying
    // fields as Case Files (case type + status added). Per-tier drops in
    // REQUIRED_FIELDS_OPTIONAL_BY_TIER.judicial_case_information mirror Case
    // Files so the wizard and validator stay in lock-step.
    'select_service',
    'select_court',
    'select_court_city',
    'case_petition_no',
    'case_year',
    'case_type',
    'case_status',
    'case_title',
    'judge_name',
    // 2026-06 #4/#5: the document bundle IS the Case Information base fee, so a
    // submission without it has no real price — the resolver would fall back to
    // the seeded placeholder base and mischarge. Require it server-side (the
    // wizard already does) so non-wizard / stale-draft submissions are rejected
    // rather than silently mispriced.
    'required_documentations',
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
    private readonly settingsService?: SettingsService,
    private readonly promosService?: PromosService,
  ) {}

  async findAll(query: FilterTicketsDto, opts?: { forConsumer?: boolean }) {
    const skip = (query.page - 1) * query.limit;

    const where = {
      // Audit 4.2: archived (soft-deleted) tickets never appear in lists.
      archivedAt: null,
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
        // Physical-dispatch trail. deliveryStatus + trackingNo are consumer-safe
        // ("Out for delivery" chip); the proof file path is admin-only.
        deliveryStatus: ticket.deliveryStatus,
        trackingNo: ticket.trackingNo,
        // Clerk cost is internal-only (rep pay-out) — never expose it to
        // consumers (CLAUDE.md). Admin/staff list rows still carry it.
        ...(opts?.forConsumer
          ? {}
          : {
              clerkCost: ticket.clerkCost,
              defaultClerkCost: ticket.defaultClerkCost,
              dispatchProofUrl: ticket.dispatchProofUrl,
            }),
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

    // Consumer-class callers only ever see their own tickets — 404 (not 403)
    // so foreign ticket ids cannot be probed for existence. Representatives
    // are scoped to tickets they have an assignment on. (Audit 3.1/3.3d; the
    // previous guard compared against the uppercase Prisma spelling
    // 'CONSUMER' and never matched.)
    if (caller && isConsumerRole(caller.role)) {
      if (ticket.consumerId !== caller.userId || ticket.archivedAt) {
        throw new NotFoundException('Ticket not found');
      }
      return this.redactTicketForConsumer(ticket);
    }
    if (caller?.role === 'representative') {
      const assigned = await this.prisma.assignment.findFirst({
        where: { ticketId: id, representativeId: caller.userId },
        select: { id: true },
      });
      if (!assigned) {
        throw new NotFoundException('Ticket not found');
      }
    }

    return ticket;
  }

  /**
   * Consumer view of a ticket: internal clerk-payout fields, the clerk
   * report, the dispatch proof path and the representative's phone number
   * are all back-office data (CLAUDE.md: clerk cost is internal-only).
   * Documents stay hidden until completion, then only consumer-visible ones.
   */
  private redactTicketForConsumer<
    T extends {
      status: string;
      documents?: { visibleToConsumer: boolean }[] | null;
      assignments?: { representative?: Record<string, unknown> | null }[];
    },
  >(ticket: T) {
    const safe: Record<string, unknown> = { ...ticket };
    delete safe.clerkCost;
    delete safe.defaultClerkCost;
    delete safe.clerkReport;
    delete safe.dispatchProofUrl;
    // DELIVERED included: auto-deliver (digital flows) and the admin's
    // delivery confirmation are terminal — the consumer must keep access to
    // the deliverables they paid for after COMPLETED.
    const completed =
      ticket.status === 'COMPLETED' || ticket.status === 'DELIVERED';
    safe.documents = completed
      ? (ticket.documents ?? []).filter((d) => d.visibleToConsumer)
      : [];
    safe.assignments = (ticket.assignments ?? []).map((assignment) => {
      if (!assignment.representative) return assignment;
      const representative = { ...assignment.representative };
      delete representative.phone;
      return { ...assignment, representative };
    });
    return safe as T;
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
    //
    // The resolve input is built by the SAME shared mapper the wizard uses for
    // its live checkout preview (buildPricingResolveInput). This is the single
    // source of truth: the quoted price and the persisted charge are derived
    // from identical inputs, so they can never drift. Hand-maintaining this
    // call site previously dropped yearBand (Pending Case Files overcharge),
    // caseTitle (State-vs surcharge), and cityCount/searchMethod (multi-city
    // Case Search undercharge).
    const payload = (dto.payload ?? {}) as Record<string, string | undefined>;
    const pricing = await this.pricingService.resolve(
      buildPricingResolveInput(dto.flow, payload),
    );

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
    // Audit 1.4: a flow with NO rules at all used to create the ticket free
    // of charge with only a logger.warn — three whole non-judicial services
    // were fulfilled end-to-end with zero revenue. Fail loudly unless ops
    // explicitly opts into free intake (escape hatch for environments where
    // the pricing seed hasn't run yet).
    if (
      !pricing.matched &&
      !pricing.rulesExistForFlow &&
      process.env.ALLOW_UNPRICED_INTAKE !== 'true'
    ) {
      throw new BadRequestException(
        `Flow "${dto.flow}" has no active pricing rules — intake would create ` +
          'a free ticket. Seed pricing rules for this flow (or set ' +
          'ALLOW_UNPRICED_INTAKE=true to permit free intake explicitly).',
      );
    }

    // Resolve tax rate (optional service; defaults to 0 when not injected).
    const taxRate = (await this.settingsService?.getTaxRate?.()) ?? 0;

    // Resolve promo code discount (optional service; skipped when not injected).
    let promoDiscount = 0;
    let promoCodeId: string | null = null;
    let promoValidation: {
      valid: boolean;
      reason?: string;
      discount: number;
      promoCodeId?: string;
    } | null = null;
    if (pricing.matched && dto.promoCode && this.promosService) {
      promoValidation = await this.promosService.validate({
        code: dto.promoCode,
        userId: dto.consumerId,
        flow: dto.flow,
        subtotal:
          paymentModelFor(dto.flow) === 'SPLIT'
            ? pricing.serviceCost
            : pricing.total,
      });
      if (!promoValidation.valid) {
        throw new BadRequestException(
          promoValidation.reason ?? 'Invalid promo code',
        );
      }
      promoDiscount = promoValidation.discount;
      promoCodeId = promoValidation.promoCodeId ?? null;
    }

    // Assemble the billed-at-intake charge components + money (tax-inclusive).
    // SPLIT flows bill phase-1 base only; ONE_TIME flows bill the full total.
    const assembled = pricing.matched
      ? TicketsService.assembleIntakeMoney({
          flow: dto.flow,
          serviceCost: pricing.serviceCost,
          deliveryCharge: pricing.deliveryCharge,
          taxRate,
          promoDiscount,
        })
      : null;

    const billedTotal = assembled ? assembled.money.totalAmount : 0;

    let ticket;
    try {
      // Ticket + initial history row are atomic (audit 1.9) — a crash between
      // the two used to orphan a ticket without its creation history.
      ticket = await this.prisma.$transaction(async (tx) => {
        const createdTicket = await tx.ticket.create({
          data: {
            batchNo: this.generateBatchNo(),
            consumerId: dto.consumerId,
            serviceId: dto.serviceId,
            status: 'UNPAID',
            // Client idempotency key: a replayed submit hits the unique index
            // and is resolved to the original ticket in the catch below.
            intakeRequestId: dto.requestId ?? null,
            createdBy:
              actor?.actorUserId && actor.actorUserId === dto.consumerId
                ? 'CONSUMER'
                : 'ADMIN_STAFF',
            serviceCity: inferredServiceCity,
            caseType: inferredCaseType,
            serviceCost: pricing.matched ? pricing.serviceCost : 0,
            deliveryCharges: assembled ? assembled.charges.deliveryCharges : 0,
            promoCodeId,
            promoDiscount,
            taxRate,
            taxAmount: assembled ? assembled.money.taxAmount : 0,
            priceBreakdown: assembled
              ? ({
                  resolver: {
                    basePrice: pricing.basePrice,
                    pdfSurcharge: pricing.pdfSurcharge,
                    titleSurcharge: pricing.titleSurcharge,
                    ageSurcharge: pricing.ageSurcharge,
                    bundleSurcharge: pricing.bundleSurcharge,
                    searchBothSurcharge: pricing.searchBothSurcharge,
                    cityCount: pricing.cityCount,
                    serviceCost: pricing.serviceCost,
                    total: pricing.total,
                  },
                  applied: assembled.money,
                  taxRate,
                  promoDiscount,
                } as unknown as Prisma.InputJsonValue)
              : undefined,
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

        await tx.ticketStatusHistory.create({
          data: {
            ticketId: createdTicket.id,
            to: 'UNPAID',
            note: 'Ticket created via intake flow',
          },
        });

        if (promoCodeId) {
          if (!this.promosService) {
            throw new InternalServerErrorException('Promo service unavailable for redemption');
          }
          await this.promosService.assertWithinLimits(tx, promoCodeId, dto.consumerId);
          await tx.promoRedemption.create({
            data: {
              promoCodeId,
              userId: dto.consumerId,
              ticketId: createdTicket.id,
              amount: promoDiscount,
            },
          });
        }

        return createdTicket;
      });
    } catch (error) {
      // Idempotent replay: the unique intakeRequestId already has a ticket —
      // return it instead of duplicating (audit 1.9). batchNo collisions and
      // other P2002s still surface as errors.
      if (
        dto.requestId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | string | undefined)
          ?.toString()
          .includes('intakeRequestId')
      ) {
        const existing = await this.prisma.ticket.findUnique({
          where: { intakeRequestId: dto.requestId },
        });
        // The key is client-supplied: only treat the collision as a replay
        // when it is the SAME consumer's ticket — otherwise returning it
        // would leak another tenant's ticket to whoever guessed the key.
        if (existing && existing.consumerId === dto.consumerId) {
          return existing;
        }
      }
      throw error;
    }

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

    // Physical-document flows must be dispatched (clerk sent the files) before
    // the admin can confirm delivery. Digital flows have no dispatch step.
    if (
      status === 'DELIVERED' &&
      chargeCapabilitiesFor(ticket.intakeFlow).delivery &&
      ticket.deliveryStatus !== 'DISPATCHED'
    ) {
      throw new BadRequestException(
        'Mark the package dispatched before confirming delivery.',
      );
    }

    // Audit 2.1: conditional transition — only flip when the row is still in
    // the status we validated against, and write the history row atomically.
    // A concurrent action that moved the ticket first turns this into a 409,
    // never a silent last-write-wins.
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.ticket.updateMany({
        where: { id, status: ticket.status },
        data: { status },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          `Ticket is no longer in ${ticket.status} — reload and retry`,
        );
      }
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: id,
          from: ticket.status,
          to: status,
          note,
        },
      });
    });

    const updated = await this.prisma.ticket.findUniqueOrThrow({
      where: { id },
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
    actor: { actorUserId?: string; actorEmail?: string; actorRole?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        intakeFlow: true,
        totalAmount: true,
        amountPaid: true,
        deliveryStatus: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Audit 2.2: an override may skip transition ORDER, but never the money /
    // dispatch gates — overriding an unpaid ticket to DELIVERED also silently
    // erased the consumer's outstanding due from the wallet net balance.
    // Owner decision 2026-06-12: super-admin (and ONLY super-admin) may
    // bypass even these gates; the bypass is stamped into the audit row.
    const superAdminBypass =
      actor.actorRole === 'super-admin' && status === 'DELIVERED';
    if (status === 'DELIVERED' && !superAdminBypass) {
      if (!isFullyPaid(ticket)) {
        throw new ForbiddenException(
          'Final payment required before delivery — even via override.',
        );
      }
      if (
        chargeCapabilitiesFor(ticket.intakeFlow).delivery &&
        ticket.deliveryStatus !== 'DISPATCHED'
      ) {
        throw new BadRequestException(
          'Mark the package dispatched before confirming delivery — even via override.',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.ticket.updateMany({
        where: { id: ticketId, status: ticket.status },
        data: { status },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          `Ticket is no longer in ${ticket.status} — reload and retry`,
        );
      }
      await tx.ticketStatusHistory.create({
        data: {
          ticketId,
          from: ticket.status,
          to: status,
          note: `Admin override from ${ticket.status}`,
        },
      });
      return tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    });
    await this.auditLogsService.create({
      action: 'TICKET_STATUS_OVERRIDDEN',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
      metadata: { from: ticket.status, to: status, superAdminBypass },
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
    // 5-24-26 #23: clerk assignment cost is INTERNAL ONLY — it is the
    // representative's pay-out, not something the client is billed for. It is
    // still persisted on the ticket (below) for internal accounting but is
    // deliberately excluded from the consumer-facing totalAmount.
    const nextTotalAmount =
      Number(ticket.serviceCost) +
      Number(ticket.deliveryCharges) +
      Number(ticket.printingCharges) +
      Number(ticket.attestedCharges) +
      Number(ticket.nonAttestedCharges) +
      Number(ticket.additionalCharges) +
      Number(ticket.additionalServiceCost) -
      Number(ticket.discountPrice);
    const priorAssignment = await this.prisma.assignment.findFirst({
      where: { ticketId: id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { representativeId: true },
    });
    // Audit 2.1: the status flip is conditional on the status we validated
    // against — a concurrent transition turns this into a 409 instead of a
    // silent overwrite of someone else's state change.
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.ticket.updateMany({
        where: { id, status: ticket.status },
        data: {
          clerkCost,
          totalAmount: nextTotalAmount,
          status: 'ASSIGNED',
        },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          `Ticket is no longer in ${ticket.status} — reload and retry`,
        );
      }
      await tx.assignment.updateMany({
        where: { ticketId: id, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED' },
      });
      await tx.assignment.create({
        data: {
          ticketId: id,
          representativeId: dto.representativeId,
        },
      });
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: id,
          from: ticket.status,
          to: 'ASSIGNED',
        },
      });
    });

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
      // Audit 4.2: soft archive, never hard delete. deleteMany hit ON DELETE
      // RESTRICT children (every ticket has status history) and — had it ever
      // succeeded — would have orphaned WalletTransaction money rows via
      // SET NULL. Archived tickets drop out of lists and wallet dues.
      await this.prisma.ticket.updateMany({
        where: { id: { in: dto.ticketIds }, archivedAt: null },
        data: { archivedAt: new Date() },
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
    actor?: { actorUserId?: string; actorEmail?: string; actorRole?: string },
    caption?: string,
    visibleToConsumer: boolean = false,
    category: 'WORK_DOCUMENT' | 'DELIVERABLE_PDF' = 'WORK_DOCUMENT',
  ) {
    const target = await this.ensureTicketExists(ticketId);
    // Authorization lives here, not in the route permission: consumers
    // attach files to their OWN tickets at intake, representatives upload
    // work documents to their ASSIGNED tickets, staff to any.
    if (actor?.actorUserId && isConsumerRole(actor.actorRole)) {
      if (target.consumerId !== actor.actorUserId) {
        throw new NotFoundException('Ticket not found');
      }
    } else {
      await this.ensureClerkActionAllowed(ticketId, actor);
    }

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
    actor?: { actorUserId?: string; actorEmail?: string; actorRole?: string },
  ) {
    const doc = await this.prisma.ticketDocument.findFirst({
      where: { id: documentId, ticketId },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    // Representatives may only toggle visibility on their assigned ticket;
    // staff are exempt (ensureClerkActionAllowed handles both).
    await this.ensureClerkActionAllowed(ticketId, actor);
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

    if (isConsumerRole(caller.role)) {
      if (doc.ticket.consumerId !== caller.consumerId) {
        throw new ForbiddenException('Not your ticket');
      }
      if (!doc.visibleToConsumer) {
        throw new ForbiddenException('Document not visible to consumer');
      }
      if (
        doc.ticket.status !== 'COMPLETED' &&
        doc.ticket.status !== 'DELIVERED'
      ) {
        throw new ForbiddenException('Document available after completion');
      }
    } else if (caller.role === 'representative') {
      const assigned = await this.prisma.assignment.findFirst({
        where: { ticketId, representativeId: caller.userId },
        select: { id: true },
      });
      if (!assigned) {
        throw new ForbiddenException('Not your assignment');
      }
    }
    return { filePath: doc.fileUrl, name: doc.name, type: doc.type };
  }

  /**
   * Clerk lifecycle actions (receipt, costs, charges, dispatch, reject) must
   * come from the representative who holds the ticket's current assignment;
   * staff are exempt. Mirrors acceptAssignment's binding (audit 3.3e).
   */
  private async ensureClerkActionAllowed(
    ticketId: string,
    actor?: { actorUserId?: string; actorRole?: string },
  ) {
    if (!actor?.actorUserId || isStaffRole(actor.actorRole)) return;
    const current = await this.prisma.assignment.findFirst({
      where: { ticketId, status: { in: ['ACTIVE', 'ACCEPTED'] } },
      orderBy: { createdAt: 'desc' },
      select: { representativeId: true },
    });
    if (!current || current.representativeId !== actor.actorUserId) {
      throw new ForbiddenException(
        'Only the assigned representative can perform this action',
      );
    }
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

    // Owner decision 2026-06-12: a regenerated ticket is a NEW sale at the
    // CURRENT price list — re-resolve through the same shared input builder
    // intake uses (quote = charge), reset the phase-2 clerk charge columns,
    // and start unpaid (audit 1.8: the clone has no backing money rows).
    // Legacy tickets without an intake flow/payload can't be re-priced —
    // they fall back to the copied totals.
    let pricingData: Record<string, unknown> = {
      serviceCost: original.serviceCost,
      deliveryCharges: original.deliveryCharges,
      printingCharges: original.printingCharges,
      attestedCharges: original.attestedCharges,
      nonAttestedCharges: original.nonAttestedCharges,
      additionalCharges: original.additionalCharges,
      additionalServiceCost: original.additionalServiceCost,
      discountPrice: original.discountPrice,
      clerkCost: original.clerkCost,
      defaultClerkCost: original.defaultClerkCost,
      totalAmount: original.totalAmount,
    };
    if (original.intakeFlow && original.formPayload) {
      const payload = original.formPayload as Record<
        string,
        string | undefined
      >;
      const pricing = await this.pricingService.resolve(
        buildPricingResolveInput(original.intakeFlow, payload),
      );
      if (!pricing.matched && pricing.rulesExistForFlow) {
        throw new BadRequestException(
          `Cannot regenerate: no pricing rule matches ticket ${original.batchNo}'s ` +
            'criteria under the current price list. Update pricing rules first.',
        );
      }
      if (
        !pricing.matched &&
        !pricing.rulesExistForFlow &&
        process.env.ALLOW_UNPRICED_INTAKE !== 'true'
      ) {
        throw new BadRequestException(
          `Cannot regenerate: flow "${original.intakeFlow}" has no active ` +
            'pricing rules — the clone would be free. Seed rules first.',
        );
      }
      const billedTotal = pricing.matched
        ? paymentModelFor(original.intakeFlow) === 'SPLIT'
          ? pricing.serviceCost
          : pricing.total
        : 0;
      pricingData = {
        serviceCost: pricing.matched ? pricing.serviceCost : 0,
        // Same shape as createIntakeTicket: phase-2 charges start clean —
        // the clerk re-enters them for the new fulfilment.
        deliveryCharges:
          pricing.matched && paymentModelFor(original.intakeFlow) !== 'SPLIT'
            ? pricing.deliveryCharge
            : 0,
        printingCharges: 0,
        attestedCharges: 0,
        nonAttestedCharges: 0,
        additionalCharges: 0,
        additionalServiceCost: 0,
        discountPrice: 0,
        clerkCost: 0,
        defaultClerkCost: pricing.matched
          ? (pricing.clerkBaseCost ?? null)
          : null,
        totalAmount: billedTotal,
      };
    }

    // Clone + initial history row are atomic (mirrors createIntakeTicket,
    // audit 1.9) — a crash between the two would otherwise orphan a
    // regenerated ticket with no creation-history row.
    const cloned = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
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
          ...pricingData,
          // Audit 1.8: the clone has no backing WalletTransaction/Payment rows —
          // copying amountPaid let a regenerated ticket sail to DELIVERED with
          // zero money collected. It starts unpaid (cf. generateNextHearing).
          amountPaid: 0,
        },
      });
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: created.id,
          to: 'UNPAID',
          note: `Regenerated from ${original.batchNo}`,
        },
      });
      return created;
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
    actor?: { actorUserId?: string; actorEmail?: string; actorRole?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.ensureClerkActionAllowed(ticketId, actor);

    // Submitting the work receipt advances the ticket into the admin's review
    // queue (WAITING_APPROVAL). The admin's single "Review & Complete" step then
    // verifies + finalizes + completes — no separate verify gate.
    // Audit 2.1: both paths are conditional updates — a receipt can only land
    // while the ticket is IN_PROGRESS (advance) or already WAITING_APPROVAL
    // (re-submit); anything else is a 409.
    await this.prisma.$transaction(async (tx) => {
      const advanced = await tx.ticket.updateMany({
        where: { id: ticketId, status: 'IN_PROGRESS' },
        data: {
          clerkReceiptUrl: receiptUrl,
          clerkApprovalStatus: 'SUBMITTED',
          status: 'WAITING_APPROVAL',
        },
      });
      if (advanced.count === 1) {
        await tx.ticketStatusHistory.create({
          data: {
            ticketId,
            from: 'IN_PROGRESS',
            to: 'WAITING_APPROVAL',
            note: 'Clerk submitted work receipt',
          },
        });
        return;
      }
      const resubmitted = await tx.ticket.updateMany({
        where: { id: ticketId, status: 'WAITING_APPROVAL' },
        data: {
          clerkReceiptUrl: receiptUrl,
          clerkApprovalStatus: 'SUBMITTED',
        },
      });
      if (resubmitted.count !== 1) {
        throw new ConflictException(
          'Ticket is not accepting a clerk receipt in its current state',
        );
      }
    });
    const updated = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
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

  /**
   * Admin "Review & Complete" — the single step that replaces the old
   * Verify-Receipt → Finalize-Charges → Approve sequence. From WAITING_APPROVAL:
   * verifies the clerk receipt, finalizes phase-2 charges (if the flow has
   * them), completes the ticket, and auto-delivers digital flows that are
   * already fully paid.
   */
  async reviewAndComplete(
    ticketId: string,
    dto: FinalizeRemainderDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    // Audit 2.3: finalize + verify + complete (+ auto-deliver) are ONE
    // transaction — a crash mid-way can no longer leave charges finalized on
    // a ticket stuck in WAITING_APPROVAL. Audit 2.1: each status flip is a
    // conditional update, so a racing sendBackToClerk / second review gets a
    // 409 instead of last-write-wins.
    const review = await this.prisma.$transaction(async (tx) => {
      // user -> ticket lock order (see finalizeRemainder): the finalize core
      // below may credit a surplus back to the consumer's wallet.
      const ref = await tx.ticket.findUnique({
        where: { id: ticketId },
        select: { consumerId: true },
      });
      if (!ref) throw new NotFoundException('Ticket not found');
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${ref.consumerId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      const ticket = await tx.ticket.findUnique({
        where: { id: ticketId },
      });
      if (!ticket) throw new NotFoundException('Ticket not found');
      if (ticket.status !== 'WAITING_APPROVAL') {
        throw new BadRequestException('Ticket is not awaiting review');
      }

      // 1. Apply phase-2 charges (reuses the caps-gated finalize math) when
      //    the flow has them and they weren't finalized already.
      const caps = chargeCapabilitiesFor(ticket.intakeFlow);
      const hasCaps =
        caps.attestation || caps.printing || caps.delivery || caps.pdf;
      let finalized: Awaited<
        ReturnType<TicketsService['finalizeRemainderCore']>
      > | null = null;
      if (hasCaps && !ticket.remainderFinalizedAt) {
        finalized = await this.finalizeRemainderCore(tx, ticketId, dto, {
          actorUserId: actor?.actorUserId,
        });
      }

      // 2. Verify the clerk receipt (if submitted) + complete.
      const completed = await tx.ticket.updateMany({
        where: { id: ticketId, status: 'WAITING_APPROVAL' },
        data: {
          ...(ticket.clerkApprovalStatus === 'SUBMITTED'
            ? { clerkApprovalStatus: 'VERIFIED' as const }
            : {}),
          status: 'COMPLETED',
        },
      });
      if (completed.count !== 1) {
        throw new ConflictException(
          'Ticket is no longer awaiting review — reload and retry',
        );
      }
      await tx.ticketStatusHistory.create({
        data: {
          ticketId,
          from: 'WAITING_APPROVAL',
          to: 'COMPLETED',
          note: 'Reviewed & completed',
        },
      });

      // 3. Digital flows (no physical delivery leg) auto-advance to DELIVERED
      //    when fully paid — the consumer already has the deliverable PDFs.
      const fresh = await tx.ticket.findUnique({
        where: { id: ticketId },
        select: { intakeFlow: true, totalAmount: true, amountPaid: true },
      });
      let finalStatus: TicketStatus = 'COMPLETED';
      if (
        fresh &&
        !chargeCapabilitiesFor(fresh.intakeFlow).delivery &&
        isFullyPaid(fresh)
      ) {
        const delivered = await tx.ticket.updateMany({
          where: { id: ticketId, status: 'COMPLETED' },
          data: { status: 'DELIVERED' },
        });
        if (delivered.count === 1) {
          finalStatus = 'DELIVERED';
          await tx.ticketStatusHistory.create({
            data: {
              ticketId,
              from: 'COMPLETED',
              to: 'DELIVERED',
              note: 'Auto-delivered — digital deliverables available',
            },
          });
        }
      }

      return { finalStatus, finalized };
    });

    if (review.finalized) {
      await this.afterRemainderFinalized(ticketId, review.finalized, {
        actorUserId: actor?.actorUserId,
        actorEmail: actor?.actorEmail,
      });
    }

    await this.auditLogsService.create({
      action: 'TICKET_REVIEWED_COMPLETED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    await this.dispatcher
      .ticketStatusChanged(ticketId, 'WAITING_APPROVAL', review.finalStatus)
      .catch(() => undefined);
    return this.findOne(ticketId);
  }

  /**
   * Admin "Send back to clerk" from WAITING_APPROVAL → IN_PROGRESS. Replaces the
   * old verify-reject + standalone send-back.
   */
  async sendBackToClerk(
    ticketId: string,
    reason?: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status !== 'WAITING_APPROVAL') {
      throw new BadRequestException('Ticket is not awaiting review');
    }

    // Audit 2.1: conditional — racing against reviewAndComplete must 409,
    // not pull a just-completed ticket back to IN_PROGRESS.
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.ticket.updateMany({
        where: { id: ticketId, status: 'WAITING_APPROVAL' },
        data: { status: 'IN_PROGRESS', clerkApprovalStatus: 'REJECTED' },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          'Ticket is no longer awaiting review — reload and retry',
        );
      }
      await tx.ticketStatusHistory.create({
        data: {
          ticketId,
          from: 'WAITING_APPROVAL',
          to: 'IN_PROGRESS',
          note: reason,
        },
      });
    });
    await this.auditLogsService.create({
      action: 'TICKET_SENT_BACK_TO_CLERK',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { reason },
    });
    await this.dispatcher
      .ticketStatusChanged(ticketId, 'WAITING_APPROVAL', 'IN_PROGRESS')
      .catch(() => undefined);
    return this.findOne(ticketId);
  }

  /**
   * Clerk "Mark dispatched" for a physical-document flow (Case Files + the 3
   * non-judicial copies) once COMPLETED: records the courier proof + tracking
   * no and sets deliveryStatus = DISPATCHED. The admin then confirms delivery.
   */
  async dispatchDelivery(
    ticketId: string,
    payload: { proofUrl?: string; trackingNo?: string },
    actor?: { actorUserId?: string; actorEmail?: string; actorRole?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.ensureClerkActionAllowed(ticketId, actor);
    if (!chargeCapabilitiesFor(ticket.intakeFlow).delivery) {
      throw new BadRequestException('This service has no physical delivery.');
    }
    if (ticket.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Ticket must be completed before it can be dispatched.',
      );
    }

    const trimmedTracking = payload.trackingNo?.trim();
    // Audit 2.1: conditional on status AND deliveryStatus — a concurrent
    // dispatch (or a status change) turns this into a 409.
    const dispatched = await this.prisma.ticket.updateMany({
      where: { id: ticketId, status: 'COMPLETED', deliveryStatus: 'PENDING' },
      data: {
        deliveryStatus: 'DISPATCHED',
        dispatchProofUrl: payload.proofUrl ?? ticket.dispatchProofUrl,
        trackingNo: trimmedTracking || ticket.trackingNo,
      },
    });
    if (dispatched.count !== 1) {
      throw new ConflictException(
        'Ticket was already dispatched or changed state — reload and retry',
      );
    }
    const updated = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    await this.auditLogsService.create({
      action: 'TICKET_DISPATCHED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { trackingNo: trimmedTracking ?? null },
    });
    // Audit 2.3: the 2026-06-05 spec's "notify the admin on dispatch" was
    // never wired — only the audit row existed.
    await this.dispatcher.ticketDispatched(ticketId).catch(() => undefined);
    return updated;
  }

  async submitClerkCosts(
    ticketId: string,
    dto: SubmitClerkCostsDto,
    actor?: { actorUserId?: string; actorEmail?: string; actorRole?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    await this.ensureClerkActionAllowed(ticketId, actor);

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
    // 5-24-26 #23: clerk cost is internal-only and excluded from the
    // consumer-facing totalAmount (see assignClerk).
    const totalAmount =
      Number(ticket.serviceCost) +
      deliveryCharges +
      printingCharges +
      attestedCharges +
      nonAttestedCharges +
      additionalCharges +
      Number(ticket.additionalServiceCost) -
      Number(ticket.discountPrice);

    if (ticket.remainderFinalizedAt) {
      throw new ConflictException(
        'Charges have already been finalized for this ticket — clerk cost ' +
          'resubmission is closed',
      );
    }

    // Audit 2.1: conditional on the status we validated against (IN_PROGRESS
    // or WAITING_APPROVAL resubmit) — a concurrent transition 409s. The
    // remainderFinalizedAt guard repeats in the where clause so a finalize
    // racing this resubmit can't be overwritten either.
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.ticket.updateMany({
        where: {
          id: ticketId,
          status: ticket.status,
          remainderFinalizedAt: null,
        },
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
      if (transitioned.count !== 1) {
        throw new ConflictException(
          `Ticket is no longer in ${ticket.status} — reload and retry`,
        );
      }
      await tx.ticketStatusHistory.create({
        data: {
          ticketId,
          from: ticket.status,
          to: 'WAITING_APPROVAL',
          note: dto.rejectionReason,
        },
      });
    });
    const updated = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
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

    // Audit 2.1: conditional transition — a concurrent reassignment/rejection
    // turns this into a 409 instead of overwriting it.
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.ticket.updateMany({
        where: { id: ticketId, status: 'ASSIGNED' },
        data: { status: 'IN_PROGRESS' },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          'Ticket is no longer ASSIGNED — reload and retry',
        );
      }
      await tx.assignment.update({
        where: { id: activeAssignment.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      await tx.ticketStatusHistory.create({
        data: {
          ticketId,
          from: 'ASSIGNED',
          to: 'IN_PROGRESS',
          note: 'Assignment accepted',
        },
      });
    });
    const updated = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });

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
    actor?: { actorUserId?: string; actorEmail?: string; actorRole?: string },
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
    await this.ensureClerkActionAllowed(ticketId, actor);

    const activeAssignment = await this.prisma.assignment.findFirst({
      where: { ticketId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    // Audit 2.1: conditional transition (ASSIGNED → PAID).
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.ticket.updateMany({
        where: { id: ticketId, status: 'ASSIGNED' },
        data: { status: 'PAID' },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          'Ticket is no longer ASSIGNED — reload and retry',
        );
      }
      if (activeAssignment) {
        await tx.assignment.update({
          where: { id: activeAssignment.id },
          data: {
            status: 'REJECTED',
            rejectedAt: new Date(),
            rejectionReason: trimmedReason,
          },
        });
      }
      await tx.ticketStatusHistory.create({
        data: {
          ticketId,
          from: 'ASSIGNED',
          to: 'PAID',
          note: trimmedReason,
        },
      });
    });
    const updated = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });

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
    actor?: { actorUserId?: string; actorEmail?: string; actorRole?: string },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, intakeFlow: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.ensureClerkActionAllowed(ticketId, actor);

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
   *
   * Audit 1.5 guards: runs inside a transaction with the user row locked
   * BEFORE the ticket row (wallet-settlement order — see the surplus credit
   * below); charge fields default to the PERSISTED clerk-entered values (an
   * empty admin body must not zero them); only once (conditional update on
   * remainderFinalizedAt IS NULL); and only from the review queue
   * (WAITING_APPROVAL) or a COMPLETED-but-not-yet-dispatched ticket.
   *
   * Owner decision 2026-06-12: when the finalized total drops BELOW the
   * amount already paid (charges corrected down after a wallet settlement),
   * the surplus auto-credits back to the consumer's wallet as a VERIFIED
   * ADMIN_ADJUSTMENT and the ticket's amountPaid steps down to the new total
   * — there is no on-ticket refund, the money returns to wallet credit.
   */
  async finalizeRemainder(
    ticketId: string,
    dto: FinalizeRemainderDto,
    actor: { actorUserId?: string; actorEmail?: string },
  ) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      // Lock ordering matches wallet settlement (user -> ticket) so a
      // concurrent settleTicketsForUser can never deadlock against the
      // surplus auto-credit inside the core.
      const ref = await tx.ticket.findUnique({
        where: { id: ticketId },
        select: { consumerId: true },
      });
      if (!ref) throw new NotFoundException('Ticket not found');
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${ref.consumerId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      return this.finalizeRemainderCore(tx, ticketId, dto, actor);
    });

    await this.afterRemainderFinalized(ticketId, outcome, actor);

    return this.findOne(ticketId);
  }

  /**
   * Finalize internals shared by finalizeRemainder (standalone endpoint) and
   * reviewAndComplete (audit 2.3 — one transaction for finalize + verify +
   * complete). The caller must hold the ticket row lock.
   */
  private async finalizeRemainderCore(
    tx: Prisma.TransactionClient,
    ticketId: string,
    dto: FinalizeRemainderDto,
    actor: { actorUserId?: string },
  ) {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        consumerId: true,
        status: true,
        deliveryStatus: true,
        serviceCost: true,
        clerkCost: true,
        attestedCharges: true,
        nonAttestedCharges: true,
        printingCharges: true,
        deliveryCharges: true,
        additionalCharges: true,
        additionalServiceCost: true,
        discountPrice: true,
        promoDiscount: true,
        taxRate: true,
        amountPaid: true,
        intakeFlow: true,
        remainderFinalizedAt: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.remainderFinalizedAt) {
      throw new ConflictException(
        'Charges have already been finalized for this ticket',
      );
    }
    const canFinalize =
      ticket.status === 'WAITING_APPROVAL' ||
      (ticket.status === 'COMPLETED' && ticket.deliveryStatus !== 'DISPATCHED');
    if (!canFinalize) {
      throw new BadRequestException(
        'Charges can only be finalized while the ticket is awaiting review (or completed but not yet dispatched)',
      );
    }

    const caps = chargeCapabilitiesFor(ticket.intakeFlow);
    // Attestation / printing / delivery have NO default rates — they are the
    // amounts the clerk entered (and the admin may edit). Absent dto fields
    // fall back to the persisted columns, never to 0.
    const attested = caps.attestation
      ? Number(dto.attestedCharges ?? ticket.attestedCharges ?? 0)
      : 0;
    const nonAttested = caps.attestation
      ? Number(dto.nonAttestedCharges ?? ticket.nonAttestedCharges ?? 0)
      : 0;
    const printing = caps.printing
      ? Number(dto.printingCharges ?? ticket.printingCharges ?? 0)
      : 0;
    const delivery = caps.delivery
      ? Number(dto.deliveryCharges ?? ticket.deliveryCharges ?? 0)
      : 0;
    // 5-24-26 #17: PDF is now priced at intake (folded into serviceCost by the
    // pricing resolver when want_pdf_before_dispatch=Yes), so it is NOT
    // re-added at finalize — doing so would double-bill the PDF surcharge.
    // 5-24-26 #23: clerk assignment cost is internal-only (rep pay-out) and is
    // excluded from the consumer total. Additional charges / discount persisted
    // earlier are preserved.
    // Task 7: route through the shared computeTicketTotal so the cumulative
    // total includes tax on phase-2 charges (taxRate defaults to 0 for legacy
    // tickets that predate the column).
    const money = TicketsService.assembleFinalizeMoney({
      serviceCost: Number(ticket.serviceCost),
      additionalCharges: Number(ticket.additionalCharges ?? 0),
      additionalServiceCost: Number(ticket.additionalServiceCost ?? 0),
      discountPrice: Number(ticket.discountPrice ?? 0),
      promoDiscount: Number(ticket.promoDiscount ?? 0),
      taxRate: Number(ticket.taxRate ?? 0),
      attested,
      nonAttested,
      printing,
      delivery,
    });
    const total = money.totalAmount;

    // Owner decision 2026-06-12: when the finalized total drops below what
    // the consumer already paid (charges corrected down after a wallet
    // settlement), the surplus auto-credits back to their wallet as a
    // recorded ADMIN_ADJUSTMENT and the ticket finalizes exactly fully paid.
    // Requires the caller to hold the USER row lock, taken BEFORE the ticket
    // lock — the same order wallet settlement uses.
    const surplus = Math.max(0, Number(ticket.amountPaid) - total);
    if (surplus > 0) {
      await tx.user.update({
        where: { id: ticket.consumerId },
        data: { walletBalance: { increment: surplus } },
      });
      await tx.walletTransaction.create({
        data: {
          userId: ticket.consumerId,
          ticketId,
          amount: surplus,
          paymentMode: 'BANK_TRANSFER',
          currency: 'PKR',
          status: 'VERIFIED',
          type: 'ADMIN_ADJUSTMENT',
          verifiedAt: new Date(),
          reviewedByUserId: actor.actorUserId ?? null,
          note: `Auto-credit: finalized total (${total}) below amount paid (${Number(
            ticket.amountPaid,
          )})`,
        },
      });
    }

    const updated = await tx.ticket.updateMany({
      where: { id: ticketId, remainderFinalizedAt: null },
      data: {
        attestedCharges: attested,
        nonAttestedCharges: nonAttested,
        printingCharges: printing,
        deliveryCharges: delivery,
        totalAmount: total,
        taxAmount: money.taxAmount,
        // The surplus moved to the wallet; the ticket books stay exact.
        ...(surplus > 0 ? { amountPaid: total } : {}),
        remainderFinalizedAt: new Date(),
        remainderFinalizedByUserId: actor.actorUserId ?? null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'Charges have already been finalized for this ticket',
      );
    }

    return {
      consumerId: ticket.consumerId,
      total,
      attested,
      nonAttested,
      printing,
      delivery,
      surplusCredited: surplus,
    };
  }

  /**
   * Post-commit side effects of a finalized remainder: wallet settlement,
   * consumer notification, audit row. Deliberately outside the transaction —
   * settlement takes its own user/ticket locks and would deadlock against
   * the finalize lock.
   */
  private async afterRemainderFinalized(
    ticketId: string,
    outcome: {
      consumerId: string;
      total: number;
      attested: number;
      nonAttested: number;
      printing: number;
      delivery: number;
      surplusCredited: number;
    },
    actor: { actorUserId?: string; actorEmail?: string },
  ) {
    // Auto-cover from any wallet excess, then notify if a balance remains.
    await this.walletService.settleTicketsForUser(outcome.consumerId);
    await this.dispatcher.paymentRemainderDue(ticketId).catch(() => undefined);

    await this.auditLogsService.create({
      action: 'TICKET_REMAINDER_FINALIZED',
      entity: 'TICKET',
      entityId: ticketId,
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
      metadata: {
        total: outcome.total,
        attested: outcome.attested,
        nonAttested: outcome.nonAttested,
        printing: outcome.printing,
        delivery: outcome.delivery,
        surplusCredited: outcome.surplusCredited,
      },
    });
  }

  /**
   * Assemble the intake charge components + money for a freshly resolved price.
   * SPLIT flows bill phase-1 base only (phase-2 charges stay 0 until finalize);
   * ONE_TIME flows fold everything into serviceCost. Tax/promo/discount applied
   * via the single shared computeTicketTotal.
   */
  static assembleFinalizeMoney(args: {
    serviceCost: number;
    additionalCharges: number;
    additionalServiceCost: number;
    discountPrice: number;
    promoDiscount: number;
    taxRate: number;
    attested: number;
    nonAttested: number;
    printing: number;
    delivery: number;
  }) {
    return computeTicketTotal({
      charges: {
        serviceCost: args.serviceCost,
        deliveryCharges: args.delivery,
        printingCharges: args.printing,
        attestedCharges: args.attested,
        nonAttestedCharges: args.nonAttested,
        additionalCharges: args.additionalCharges,
        additionalServiceCost: args.additionalServiceCost,
      },
      discountPrice: args.discountPrice,
      promoDiscount: args.promoDiscount,
      taxRate: args.taxRate,
    });
  }

  static assembleIntakeMoney(args: {
    flow: string;
    serviceCost: number;
    deliveryCharge: number;
    taxRate: number;
    promoDiscount: number;
    discountPrice?: number;
  }) {
    const isSplit = paymentModelFor(args.flow) === 'SPLIT';
    const charges: TicketChargeComponents = {
      serviceCost: args.serviceCost,
      // Delivery is a phase-2 charge for SPLIT; ONE_TIME digital flows are 0 too.
      deliveryCharges: isSplit ? 0 : args.deliveryCharge,
      printingCharges: 0,
      attestedCharges: 0,
      nonAttestedCharges: 0,
      additionalCharges: 0,
      additionalServiceCost: 0,
    };
    const money = computeTicketTotal({
      charges,
      discountPrice: args.discountPrice ?? 0,
      promoDiscount: args.promoDiscount,
      taxRate: args.taxRate,
    });
    return { charges, money };
  }

  private generateBatchNo() {
    const stamp = Date.now().toString().slice(-8);
    // Audit 4.4: 4 digits of Math.random() collided under burst load and the
    // unique constraint surfaced as an unhandled P2002/500. Six CSPRNG digits
    // on top of the millisecond stamp make a same-ms collision negligible.
    const rand = randomInt(100000, 1000000);
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
      select: { id: true, consumerId: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
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

  // ─────────────────────────────────────────────────────────────────────────
  // Reprice helpers
  // ─────────────────────────────────────────────────────────────────────────

  private buildRepriceResult(
    ticket: {
      intakeFlow: string | null;
      formPayload: unknown;
      printingCharges: unknown;
      attestedCharges: unknown;
      nonAttestedCharges: unknown;
      deliveryCharges: unknown;
      additionalCharges: unknown;
      additionalServiceCost: unknown;
      discountPrice: unknown;
      promoDiscount: unknown;
    },
    resolved: Awaited<ReturnType<PricingService['resolve']>>,
    taxRate: number,
    dto: RepriceTicketDto,
  ) {
    const flow = ticket.intakeFlow ?? '';
    const isSplit = paymentModelFor(flow) === 'SPLIT';
    const o = dto.overrides ?? {};
    const num = (v: unknown) => Number(v ?? 0);
    const charges = {
      serviceCost: resolved.matched ? resolved.serviceCost : num(0),
      deliveryCharges:
        o.deliveryCharges ??
        (isSplit ? num(ticket.deliveryCharges) : resolved.deliveryCharge),
      printingCharges: o.printingCharges ?? num(ticket.printingCharges),
      attestedCharges: o.attestedCharges ?? num(ticket.attestedCharges),
      nonAttestedCharges:
        o.nonAttestedCharges ?? num(ticket.nonAttestedCharges),
      additionalCharges: o.additionalCharges ?? num(ticket.additionalCharges),
      additionalServiceCost:
        o.additionalServiceCost ?? num(ticket.additionalServiceCost),
    };
    const money = computeTicketTotal({
      charges,
      discountPrice: dto.discountPrice ?? num(ticket.discountPrice),
      promoDiscount: num(ticket.promoDiscount),
      taxRate,
    });
    return { resolver: resolved, charges, money };
  }

  private mergedPayload(
    ticket: { formPayload: unknown },
    dto: RepriceTicketDto,
  ) {
    const base = (ticket.formPayload ?? {}) as Record<
      string,
      string | undefined
    >;
    return { ...base, ...(dto.payload ?? {}) } as Record<
      string,
      string | undefined
    >;
  }

  async repricePreview(id: string, dto: RepriceTicketDto) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const payload = this.mergedPayload(ticket, dto);
    const resolved = await this.pricingService.resolve(
      buildPricingResolveInput(ticket.intakeFlow ?? '', payload),
    );
    const taxRate = (await this.settingsService?.getTaxRate?.()) ?? 0;
    return this.buildRepriceResult(ticket, resolved, taxRate, dto);
  }

  async repriceTicket(
    id: string,
    dto: RepriceTicketDto,
    actor: { actorUserId?: string; actorEmail?: string },
  ) {
    const existing = await this.prisma.ticket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ticket not found');
    if (existing.status === 'DELIVERED') {
      throw new BadRequestException(
        'A delivered ticket can no longer be repriced',
      );
    }
    const payload = this.mergedPayload(existing, dto);
    const resolved = await this.pricingService.resolve(
      buildPricingResolveInput(existing.intakeFlow ?? '', payload),
    );
    if (!resolved.matched) {
      throw new BadRequestException(
        'Cannot reprice: no active pricing rule matched the edited case details',
      );
    }
    const taxRate = (await this.settingsService?.getTaxRate?.()) ?? 0;
    const result = this.buildRepriceResult(existing, resolved, taxRate, dto);
    const total = result.money.totalAmount;

    // USER row lock BEFORE ticket lock — same order as finalizeRemainderCore
    // to prevent deadlocks with wallet settlement.
    await this.prisma.$transaction(async (tx) => {
      // Re-read amountPaid INSIDE the transaction to avoid clobbering a
      // concurrent payment webhook that increments amountPaid between the
      // outer findUnique and this write.
      const fresh = await tx.ticket.findUnique({
        where: { id },
        select: { amountPaid: true },
      });
      const amountPaid = Number(fresh?.amountPaid ?? 0);
      const surplus = Math.max(0, amountPaid - total);
      if (surplus > 0) {
        await tx.user.update({
          where: { id: existing.consumerId },
          data: { walletBalance: { increment: surplus } },
        });
        await tx.walletTransaction.create({
          data: {
            userId: existing.consumerId,
            ticketId: id,
            amount: surplus,
            paymentMode: 'BANK_TRANSFER',
            currency: 'PKR',
            status: 'VERIFIED',
            type: 'ADMIN_ADJUSTMENT',
            verifiedAt: new Date(),
            reviewedByUserId: actor.actorUserId ?? null,
            note: `Reprice surplus: new total (${total}) below amount paid (${amountPaid})`,
          },
        });
      }
      await tx.ticket.updateMany({
        where: { id },
        data: {
          serviceCost: result.charges.serviceCost,
          deliveryCharges: result.charges.deliveryCharges,
          printingCharges: result.charges.printingCharges,
          attestedCharges: result.charges.attestedCharges,
          nonAttestedCharges: result.charges.nonAttestedCharges,
          additionalCharges: result.charges.additionalCharges,
          additionalServiceCost: result.charges.additionalServiceCost,
          discountPrice: dto.discountPrice ?? existing.discountPrice,
          taxRate,
          taxAmount: result.money.taxAmount,
          totalAmount: total,
          ...(surplus > 0 ? { amountPaid: total } : {}),
          formPayload: payload as Prisma.InputJsonValue,
          priceBreakdown: {
            resolver: result.resolver,
            applied: result.money,
            taxRate,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    await this.auditLogsService.create({
      action: 'TICKET_REPRICE',
      entity: 'TICKET',
      entityId: id,
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
      metadata: {
        total,
        taxRate,
        payloadKeys: Object.keys(dto.payload ?? {}),
      },
    });

    return this.findOne(id);
  }
}
