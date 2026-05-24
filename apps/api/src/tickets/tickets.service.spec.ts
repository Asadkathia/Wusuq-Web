import { jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  requiredFieldsFor,
  paymentModelFor,
  chargeCapabilitiesFor,
  orderCaseDetailKeys,
  isBaseCovered,
  isFullyPaid,
  TICKET_STATUSES,
} from '@wusuq/shared';
import { TicketsService } from './tickets.service';

function makeDispatcher() {
  return {
    ticketCreated: jest.fn().mockResolvedValue(undefined),
    ticketStatusChanged: jest.fn().mockResolvedValue(undefined),
    ticketAssigned: jest.fn().mockResolvedValue(undefined),
    ticketReassigned: jest.fn().mockResolvedValue(undefined),
    ticketAssignmentAccepted: jest.fn().mockResolvedValue(undefined),
    ticketAssignmentRejected: jest.fn().mockResolvedValue(undefined),
    ticketClerkCostsSubmitted: jest.fn().mockResolvedValue(undefined),
    ticketClerkReceiptSubmitted: jest.fn().mockResolvedValue(undefined),
    ticketClerkReceiptDecided: jest.fn().mockResolvedValue(undefined),
    ticketDocumentUploaded: jest.fn().mockResolvedValue(undefined),
    ticketRegenerated: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
    caseDriftDetected: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TicketsService', () => {
  it('preserves financial fields when regenerating a ticket', async () => {
    const original = {
      id: 'ticket-1',
      batchNo: 'TKT-1',
      consumerId: 'consumer-1',
      serviceId: 'service-1',
      serviceCity: 'Karachi',
      caseType: 'civil',
      intakeFlow: 'judicial_case_files',
      formPayload: { sample: true },
      serviceCost: 100,
      deliveryCharges: 5,
      printingCharges: 2,
      attestedCharges: 3,
      additionalServiceCost: 10,
      clerkCost: 10,
      totalAmount: 120,
      amountPaid: 20,
    };

    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(original),
        create: jest.fn().mockResolvedValue({ id: 'ticket-2' }),
      },
      ticketStatusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'history-1' }),
      },
    };
    const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    const pricingService = {
      resolve: jest.fn().mockResolvedValue({
        matched: false,
        basePrice: 0,
        attestedCharge: 0,
        nonAttestedCharge: 0,
        deliveryCharge: 0,
        serviceCost: 0,
        total: 0,
      }),
    };
    const geoService = { resolveProvinceByCity: jest.fn() };
    const dispatcher = makeDispatcher();
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      pricingService as never,
      geoService as never,
      dispatcher as never,
      { settleTicketsForUser: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.regenerate('ticket-1');

    expect(prisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceCost: 100,
          deliveryCharges: 5,
          printingCharges: 2,
          attestedCharges: 3,
          additionalServiceCost: 10,
          clerkCost: 10,
          totalAmount: 120,
          amountPaid: 20,
          status: 'UNPAID',
        }),
      }),
    );
  });

  it('rejects assigning a non-representative user', async () => {
    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          status: 'PENDING',
          service: { id: 'service-1', category: 'x' },
          serviceCost: 100,
          deliveryCharges: 0,
          printingCharges: 0,
          attestedCharges: 0,
          caseType: null,
          formPayload: {},
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: 'consumer',
          isActive: true,
        }),
      },
      $transaction: jest.fn(),
    };
    const auditLogsService = { create: jest.fn() };
    const pricingService = {
      resolve: jest.fn().mockResolvedValue({
        matched: false,
        basePrice: 0,
        attestedCharge: 0,
        nonAttestedCharge: 0,
        deliveryCharge: 0,
        serviceCost: 0,
        total: 0,
      }),
    };
    const geoService = { resolveProvinceByCity: jest.fn() };
    const dispatcher = makeDispatcher();
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      pricingService as never,
      geoService as never,
      dispatcher as never,
      { settleTicketsForUser: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      service.assign('ticket-1', { representativeId: 'user-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('rejectAssignment', () => {
    function buildService(opts: {
      ticket?: Record<string, unknown> | null;
      activeAssignment?: Record<string, unknown> | null;
      assigningAuditLog?: Record<string, unknown> | null;
    }) {
      const ticket =
        opts.ticket === undefined
          ? {
              id: 'ticket-1',
              status: 'ASSIGNED',
              batchNo: 'TKT-001',
            }
          : opts.ticket;
      const updatedTicket =
        ticket && typeof ticket === 'object'
          ? { ...ticket, status: 'PAID' }
          : ticket;
      const activeAssignment =
        opts.activeAssignment === undefined
          ? { id: 'assignment-1', ticketId: 'ticket-1', status: 'ACTIVE' }
          : opts.activeAssignment;
      const updatedAssignment = activeAssignment
        ? {
            ...activeAssignment,
            status: 'REJECTED',
            rejectedAt: new Date(),
            rejectionReason: 'set-in-test',
          }
        : null;

      const prisma = {
        ticket: {
          findUnique: jest.fn().mockResolvedValue(ticket),
          update: jest.fn().mockResolvedValue(updatedTicket),
        },
        assignment: {
          findFirst: jest.fn().mockResolvedValue(activeAssignment),
          update: jest.fn().mockResolvedValue(updatedAssignment),
        },
        ticketStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'h-1' }),
        },
        auditLog: {
          findFirst: jest
            .fn()
            .mockResolvedValue(
              opts.assigningAuditLog === undefined
                ? { actorUserId: 'admin-1' }
                : opts.assigningAuditLog,
            ),
        },
        $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => {
          // Return the resolved values from each Prisma promise. In our
          // implementation the first op is the ticket update.
          return Promise.all(ops as Promise<unknown>[]);
        }),
      };
      const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
      const pricingService = {
        resolve: jest.fn(),
      };
      const geoService = { resolveProvinceByCity: jest.fn() };
      const dispatcher = makeDispatcher();
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        dispatcher as never,
      );
      return {
        service,
        prisma,
        auditLogsService,
        dispatcher,
      };
    }

    it('marks active Assignment REJECTED, reverts ticket to PENDING, notifies assigning admin', async () => {
      const { service, prisma, auditLogsService, dispatcher } = buildService(
        {},
      );

      await service.rejectAssignment(
        'ticket-1',
        'Cannot reach court this week',
        { actorUserId: 'clerk-1', actorEmail: 'clerk-1@example.com' },
      );

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: { status: 'PAID' },
      });
      expect(prisma.assignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'assignment-1' },
          data: expect.objectContaining({
            status: 'REJECTED',
            rejectionReason: 'Cannot reach court this week',
            rejectedAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.ticketStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketId: 'ticket-1',
            from: 'ASSIGNED',
            to: 'PAID',
            note: 'Cannot reach court this week',
          }),
        }),
      );
      expect(dispatcher.ticketAssignmentRejected).toHaveBeenCalledWith(
        'ticket-1',
        'Cannot reach court this week',
      );
      expect(auditLogsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TICKET_ASSIGNMENT_REJECTED',
          metadata: expect.objectContaining({
            reason: 'Cannot reach court this week',
          }),
        }),
      );
    });

    it('throws when reason is empty', async () => {
      const { service } = buildService({});
      await expect(
        service.rejectAssignment('ticket-1', '', { actorUserId: 'clerk-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when reason is whitespace-only', async () => {
      const { service } = buildService({});
      await expect(
        service.rejectAssignment('ticket-1', '   ', { actorUserId: 'clerk-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('acceptAssignment', () => {
    function buildService(opts: {
      ticket?: Record<string, unknown> | null;
      activeAssignment?: Record<string, unknown> | null;
    }) {
      const ticket =
        opts.ticket === undefined
          ? {
              id: 'ticket-1',
              status: 'ASSIGNED',
              batchNo: 'TKT-001',
            }
          : opts.ticket;
      const updatedTicket =
        ticket && typeof ticket === 'object'
          ? { ...ticket, status: 'IN_PROGRESS' }
          : ticket;
      const activeAssignment =
        opts.activeAssignment === undefined
          ? {
              id: 'assignment-1',
              ticketId: 'ticket-1',
              representativeId: 'clerk-1',
              status: 'ACTIVE',
            }
          : opts.activeAssignment;
      const updatedAssignment = activeAssignment
        ? { ...activeAssignment, status: 'ACCEPTED', acceptedAt: new Date() }
        : null;

      const prisma = {
        ticket: {
          findUnique: jest.fn().mockResolvedValue(ticket),
          update: jest.fn().mockResolvedValue(updatedTicket),
        },
        assignment: {
          findFirst: jest.fn().mockResolvedValue(activeAssignment),
          update: jest.fn().mockResolvedValue(updatedAssignment),
        },
        ticketStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'h-1' }),
        },
        $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => {
          return Promise.all(ops as Promise<unknown>[]);
        }),
      };
      const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
      const pricingService = { resolve: jest.fn() };
      const geoService = { resolveProvinceByCity: jest.fn() };
      const dispatcher = makeDispatcher();
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        dispatcher as never,
      );
      return { service, prisma, auditLogsService };
    }

    it('marks active Assignment ACCEPTED, moves ticket to IN_PROGRESS, audits', async () => {
      const { service, prisma, auditLogsService } = buildService({});

      await service.acceptAssignment('ticket-1', {
        actorUserId: 'clerk-1',
        actorEmail: 'clerk-1@example.com',
      });

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: { status: 'IN_PROGRESS' },
      });
      expect(prisma.assignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'assignment-1' },
          data: expect.objectContaining({
            status: 'ACCEPTED',
            acceptedAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.ticketStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketId: 'ticket-1',
            from: 'ASSIGNED',
            to: 'IN_PROGRESS',
          }),
        }),
      );
      expect(auditLogsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TICKET_ASSIGNMENT_ACCEPTED',
          entity: 'TICKET',
          entityId: 'ticket-1',
          actorUserId: 'clerk-1',
        }),
      );
    });

    it('rejects when ticket is not in ASSIGNED', async () => {
      const { service } = buildService({
        ticket: { id: 'ticket-1', status: 'UNPAID', batchNo: 'TKT-001' },
      });
      await expect(
        service.acceptAssignment('ticket-1', { actorUserId: 'clerk-1' }),
      ).rejects.toThrow(/ASSIGNED/);
    });

    it('forbids non-assigned representative from accepting', async () => {
      const { service } = buildService({});
      await expect(
        service.acceptAssignment('ticket-1', { actorUserId: 'other-clerk' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('TicketDocument visibility', () => {
    function buildService() {
      const docStore = new Map<string, Record<string, unknown>>();
      let idSeq = 0;
      const prisma = {
        ticket: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'ticket-1' } as unknown),
        },
        ticketDocument: {
          create: jest.fn().mockImplementation(async (args: unknown) => {
            const { data } = args as { data: Record<string, unknown> };
            const id = `doc-${++idSeq}`;
            const row = { id, ...data };
            docStore.set(id, row);
            return row;
          }),
          findFirst: jest.fn().mockImplementation(async (args: unknown) => {
            const { where } = args as {
              where: { id: string; ticketId: string };
            };
            const row = docStore.get(where.id);
            if (!row || row.ticketId !== where.ticketId) return null;
            return row;
          }),
          update: jest.fn().mockImplementation(async (args: unknown) => {
            const { where, data } = args as {
              where: { id: string };
              data: Record<string, unknown>;
            };
            const existing = docStore.get(where.id);
            if (!existing) return null;
            const updated = { ...existing, ...data };
            docStore.set(where.id, updated);
            return updated;
          }),
        },
      };
      const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
      const pricingService = { resolve: jest.fn() };
      const geoService = { resolveProvinceByCity: jest.fn() };
      const dispatcher = makeDispatcher();
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        dispatcher as never,
      );
      return { service, prisma, auditLogsService };
    }

    it('uploadDocument defaults visibleToConsumer=false and accepts override', async () => {
      const { service } = buildService();
      const doc = await service.uploadDocument(
        'ticket-1',
        {
          filename: 'a.pdf',
          mimetype: 'application/pdf',
          path: '/uploads/a.pdf',
        },
        { actorUserId: 'clerk-1' },
        undefined,
        true,
      );
      expect(doc.visibleToConsumer).toBe(true);

      const doc2 = await service.uploadDocument(
        'ticket-1',
        {
          filename: 'b.pdf',
          mimetype: 'application/pdf',
          path: '/uploads/b.pdf',
        },
        { actorUserId: 'clerk-1' },
      );
      expect(doc2.visibleToConsumer).toBe(false);
    });

    it('patchDocument toggles visibility and audits', async () => {
      const { service, auditLogsService } = buildService();
      const doc = await service.uploadDocument(
        'ticket-1',
        {
          filename: 'a.pdf',
          mimetype: 'application/pdf',
          path: '/uploads/a.pdf',
        },
        { actorUserId: 'clerk-1' },
      );
      const updated = await service.patchDocument(
        'ticket-1',
        doc.id,
        { visibleToConsumer: true },
        { actorUserId: 'clerk-1' },
      );
      expect(updated.visibleToConsumer).toBe(true);
      expect(auditLogsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TICKET_DOCUMENT_VISIBILITY_CHANGED',
          entity: 'TICKET_DOCUMENT',
          entityId: doc.id,
          metadata: expect.objectContaining({
            ticketId: 'ticket-1',
            from: false,
            to: true,
          }),
        }),
      );
    });
  });

  describe('resolveDocumentDownload', () => {
    function seedTicketWithDoc(opts: {
      visibleToConsumer: boolean;
      status?: string;
      consumerId?: string;
      ticketId?: string;
      docId?: string;
    }) {
      const consumerId = opts.consumerId ?? 'consumer-1';
      const ticketId = opts.ticketId ?? 'ticket-1';
      const docId = opts.docId ?? 'doc-1';
      const document = {
        id: docId,
        ticketId,
        name: 'file.pdf',
        type: 'application/pdf',
        fileUrl: '/var/uploads/ticket-documents/file.pdf',
        caption: null,
        visibleToConsumer: opts.visibleToConsumer,
        ticket: {
          consumerId,
          status: opts.status ?? 'IN_PROGRESS',
        },
      };
      const prisma = {
        ticketDocument: {
          findFirst: jest.fn().mockResolvedValue(document),
        },
      };
      const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
      const pricingService = { resolve: jest.fn() };
      const geoService = { resolveProvinceByCity: jest.fn() };
      const dispatcher = makeDispatcher();
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        dispatcher as never,
      );
      return { service, prisma, ticketId, docId, consumerId };
    }

    it('returns file metadata for staff regardless of visibility', async () => {
      const { service, ticketId, docId } = seedTicketWithDoc({
        visibleToConsumer: false,
      });
      const result = await service.resolveDocumentDownload(ticketId, docId, {
        userId: 'staff-1',
        role: 'CLERK',
        consumerId: null,
      });
      expect(result.filePath).toMatch(/uploads/);
    });

    it('returns file for consumer when visible and ticket COMPLETED', async () => {
      const { service, ticketId, docId, consumerId } = seedTicketWithDoc({
        visibleToConsumer: true,
        status: 'COMPLETED',
      });
      const result = await service.resolveDocumentDownload(ticketId, docId, {
        userId: consumerId,
        role: 'CONSUMER',
        consumerId,
      });
      expect(result.filePath).toBeDefined();
    });

    it('forbids consumer when doc is invisible', async () => {
      const { service, ticketId, docId, consumerId } = seedTicketWithDoc({
        visibleToConsumer: false,
        status: 'COMPLETED',
      });
      await expect(
        service.resolveDocumentDownload(ticketId, docId, {
          userId: consumerId,
          role: 'CONSUMER',
          consumerId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids consumer when ticket is not COMPLETED', async () => {
      const { service, ticketId, docId, consumerId } = seedTicketWithDoc({
        visibleToConsumer: true,
        status: 'IN_PROGRESS',
      });
      await expect(
        service.resolveDocumentDownload(ticketId, docId, {
          userId: consumerId,
          role: 'CONSUMER',
          consumerId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when document missing', async () => {
      const { service, prisma, ticketId } = seedTicketWithDoc({
        visibleToConsumer: true,
      });
      prisma.ticketDocument.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.resolveDocumentDownload(ticketId, 'missing-doc', {
          userId: 'staff-1',
          role: 'CLERK',
          consumerId: null,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne visibility filter', () => {
    function buildFindOneHarness(opts: {
      ticketId: string;
      consumerId: string;
      status: string;
      docs: Array<{ visibleToConsumer: boolean }>;
    }) {
      const documents = opts.docs.map((d, i) => ({
        id: `doc-${i}`,
        ticketId: opts.ticketId,
        name: `doc-${i}.pdf`,
        type: 'OUTPUT',
        fileUrl: `https://example.com/doc-${i}.pdf`,
        visibleToConsumer: d.visibleToConsumer,
      }));
      const ticket = {
        id: opts.ticketId,
        status: opts.status,
        consumerId: opts.consumerId,
        documents,
        history: [],
        assignments: [],
        clerkReport: null,
        consumer: { id: opts.consumerId },
        service: { id: 'svc-1', name: 'svc' },
      };

      const prisma = {
        ticket: {
          findUnique: jest.fn().mockResolvedValue(ticket),
        },
      };
      const auditLogsService = { create: jest.fn() };
      const pricingService = { resolve: jest.fn() };
      const geoService = { resolveProvinceByCity: jest.fn() };
      const dispatcher = makeDispatcher();
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        dispatcher as never,
      );
      return { service, prisma };
    }

    async function seedTicketWithDocs(
      docs: Array<{ visibleToConsumer: boolean }>,
      status: string,
    ) {
      const ticketId = 'ticket-vf';
      const consumerId = 'consumer-vf';
      const { service } = buildFindOneHarness({
        ticketId,
        consumerId,
        status,
        docs,
      });
      return { ticketId, consumerId, service };
    }

    it('hides invisible docs from consumers, shows them to staff', async () => {
      const { ticketId, consumerId, service } = await seedTicketWithDocs(
        [{ visibleToConsumer: true }, { visibleToConsumer: false }],
        'COMPLETED',
      );

      const asConsumer = await service.findOne(ticketId, {
        role: 'CONSUMER',
        userId: consumerId,
      });
      expect(asConsumer.documents).toHaveLength(1);
      expect(asConsumer.documents[0].visibleToConsumer).toBe(true);

      const { service: staffService } = buildFindOneHarness({
        ticketId,
        consumerId,
        status: 'COMPLETED',
        docs: [{ visibleToConsumer: true }, { visibleToConsumer: false }],
      });
      const asStaff = await staffService.findOne(ticketId, {
        role: 'CLERK',
        userId: 'staff-1',
      });
      expect(asStaff.documents).toHaveLength(2);
    });

    it('hides all docs from consumer when ticket not COMPLETED', async () => {
      const { ticketId, consumerId, service } = await seedTicketWithDocs(
        [{ visibleToConsumer: true }],
        'IN_PROGRESS',
      );
      const asConsumer = await service.findOne(ticketId, {
        role: 'CONSUMER',
        userId: consumerId,
      });
      expect(asConsumer.documents).toHaveLength(0);
    });

    it('completion mirror skips invisible docs', async () => {
      const ticketId = 'ticket-cm';
      const caseId = 'case-1';
      const ticketBefore = {
        id: ticketId,
        status: 'WAITING_APPROVAL',
        caseId,
      };
      const ticketAfter = {
        id: ticketId,
        status: 'COMPLETED',
        caseId,
        batchNo: 'TKT-CM',
        consumer: { id: 'c-1', name: 'c', email: null, phone: null },
        service: { id: 's-1', name: 'svc' },
      };

      const ticketDocs = [
        {
          id: 'd-vis',
          name: 'visible.pdf',
          type: 'OUTPUT',
          fileUrl: 'https://example.com/visible.pdf',
          visibleToConsumer: true,
        },
        {
          id: 'd-hid',
          name: 'hidden.pdf',
          type: 'INTERNAL',
          fileUrl: 'https://example.com/hidden.pdf',
          visibleToConsumer: false,
        },
      ];

      const prisma = {
        ticket: {
          findUnique: jest.fn().mockResolvedValue(ticketBefore),
          update: jest.fn().mockResolvedValue(ticketAfter),
          findMany: jest.fn().mockResolvedValue([]),
        },
        caseEvent: { create: jest.fn().mockResolvedValue({}) },
        ticketDocument: {
          findMany: jest.fn().mockResolvedValue(ticketDocs),
        },
        caseDocument: { create: jest.fn().mockResolvedValue({}) },
        case: {
          findUnique: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
        ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      };
      const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
      const pricingService = { resolve: jest.fn() };
      const geoService = { resolveProvinceByCity: jest.fn() };
      const dispatcher = makeDispatcher();
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        dispatcher as never,
      );

      await service.updateStatus(ticketId, 'COMPLETED', undefined, {
        actorUserId: 'admin-1',
      });

      expect(prisma.caseDocument.create).toHaveBeenCalledTimes(1);
      expect(prisma.caseDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'visible.pdf',
            fileUrl: 'https://example.com/visible.pdf',
          }),
        }),
      );
    });
  });

  describe('Ticket origin stamping', () => {
    function buildIntakeHarness() {
      const created: { data: Record<string, unknown> }[] = [];
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'consumer-1' }),
        },
        service: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'svc-1', category: 'judicial' }),
        },
        ticket: {
          create: jest.fn().mockImplementation(async (args: any) => {
            created.push(args);
            return { id: 'tkt-new', ...args.data };
          }),
        },
        ticketStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
        ticketIntakeDraft: {
          delete: jest.fn().mockResolvedValue({}),
        },
      };
      const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
      const pricingService = {
        resolve: jest.fn().mockResolvedValue({
          matched: false,
          rulesExistForFlow: false,
          basePrice: 0,
          attestedCharge: 0,
          nonAttestedCharge: 0,
          deliveryCharge: 0,
          serviceCost: 0,
          total: 0,
        }),
      };
      const geoService = { resolveProvinceByCity: jest.fn() };
      const dispatcher = makeDispatcher();
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        dispatcher as never,
      );
      return { service, prisma, created };
    }

    it('stamps createdBy=CONSUMER when the actor is the consumer themselves', async () => {
      const { service, created } = buildIntakeHarness();
      await service.createIntakeTicket(
        {
          consumerId: 'consumer-1',
          serviceId: 'svc-1',
          flow: 'judicial_case_information',
          payload: {
            select_service: 'x',
            select_court: 'x',
            select_court_city: 'x',
            case_petition_no: '1',
            case_year: '2024',
            case_title: 'A vs B',
            judge_name: 'Judge Smith',
          },
        } as never,
        { actorUserId: 'consumer-1', actorEmail: 'c@x.com' },
      );
      expect(created[0]?.data.createdBy).toBe('CONSUMER');
    });

    it('stamps createdBy=ADMIN_STAFF when actor is staff (different user)', async () => {
      const { service, created } = buildIntakeHarness();
      await service.createIntakeTicket(
        {
          consumerId: 'consumer-1',
          serviceId: 'svc-1',
          flow: 'judicial_case_information',
          payload: {
            select_service: 'x',
            select_court: 'x',
            select_court_city: 'x',
            case_petition_no: '1',
            case_year: '2024',
            case_title: 'A vs B',
            judge_name: 'Judge Smith',
          },
        } as never,
        { actorUserId: 'admin-1', actorEmail: 'a@x.com' },
      );
      expect(created[0]?.data.createdBy).toBe('ADMIN_STAFF');
    });

    it('stamps createdBy=ADMIN_STAFF when no actor is supplied', async () => {
      const { service, created } = buildIntakeHarness();
      await service.createIntakeTicket({
        consumerId: 'consumer-1',
        serviceId: 'svc-1',
        flow: 'judicial_case_information',
        payload: {
          select_service: 'x',
          select_court: 'x',
          select_court_city: 'x',
          case_petition_no: '1',
          case_year: '2024',
          case_title: 'A vs B',
          judge_name: 'Judge Smith',
        },
      } as never);
      expect(created[0]?.data.createdBy).toBe('ADMIN_STAFF');
    });
  });

  describe('createIntakeTicket — SPLIT billing (Task 1.2)', () => {
    function buildIntakeHarnessWithPricing(opts: {
      flow: string;
      serviceCost: number;
      total: number;
    }) {
      const created: { data: Record<string, unknown> }[] = [];
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'consumer-1' }),
        },
        service: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'svc-1', category: 'judicial' }),
        },
        ticket: {
          create: jest.fn().mockImplementation(async (args: any) => {
            created.push(args);
            return { id: 'tkt-new', ...args.data };
          }),
        },
        ticketStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
        ticketIntakeDraft: {
          delete: jest.fn().mockResolvedValue({}),
        },
      };
      const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
      const pricingService = {
        resolve: jest.fn().mockResolvedValue({
          matched: true,
          rulesExistForFlow: true,
          basePrice: opts.serviceCost,
          attestedCharge: 0,
          nonAttestedCharge: 0,
          deliveryCharge: 0,
          serviceCost: opts.serviceCost,
          total: opts.total,
        }),
      };
      const geoService = { resolveProvinceByCity: jest.fn() };
      const dispatcher = makeDispatcher();
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        dispatcher as never,
      );
      return { service, prisma, created };
    }

    it('SPLIT flow: totalAmount equals serviceCost (base only) even when pricing.total is higher', async () => {
      const { service, created } = buildIntakeHarnessWithPricing({
        flow: 'judicial_case_files',
        serviceCost: 5000,
        total: 8000,
      });
      await service.createIntakeTicket(
        {
          consumerId: 'consumer-1',
          serviceId: 'svc-1',
          flow: 'judicial_case_files',
          payload: {
            select_service: 'x',
            select_court: 'x',
            select_court_city: 'x',
            select_court_type: 'lower',
            case_petition_no: '1',
            case_year: '2024',
            case_type: 'civil',
            case_status: 'pending',
            case_title: 'A vs B',
            judge_name: 'Judge Smith',
            sets: '1',
            set_type: 'attested',
            delivery_mode: 'courier',
          },
        } as never,
        { actorUserId: 'consumer-1', actorEmail: 'c@x.com' },
      );
      const data = created[0]?.data;
      expect(data?.totalAmount).toBe(data?.serviceCost); // base only for SPLIT
      expect(data?.serviceCost).toBe(5000);
      expect(data?.totalAmount).toBe(5000); // NOT 8000
    });

    it('ONE_TIME flow: totalAmount equals pricing.total (full amount)', async () => {
      const { service, created } = buildIntakeHarnessWithPricing({
        flow: 'judicial_case_information',
        serviceCost: 3000,
        total: 3500,
      });
      await service.createIntakeTicket(
        {
          consumerId: 'consumer-1',
          serviceId: 'svc-1',
          flow: 'judicial_case_information',
          payload: {
            select_service: 'x',
            select_court: 'x',
            select_court_city: 'x',
            case_petition_no: '1',
            case_year: '2024',
            case_title: 'A vs B',
            judge_name: 'Judge Smith',
          },
        } as never,
        { actorUserId: 'consumer-1', actorEmail: 'c@x.com' },
      );
      const data = created[0]?.data;
      expect(data?.totalAmount).toBe(3500); // full total for ONE_TIME
    });
  });

  describe('Payment gate', () => {
    // Keep the suite hermetic: the dev escape hatch must be off by default so
    // the gate assertions hold regardless of the ambient .env.
    let prevDisableGating: string | undefined;
    beforeEach(() => {
      prevDisableGating = process.env.DISABLE_PAYMENT_GATING;
      delete process.env.DISABLE_PAYMENT_GATING;
    });
    afterEach(() => {
      if (prevDisableGating === undefined)
        delete process.env.DISABLE_PAYMENT_GATING;
      else process.env.DISABLE_PAYMENT_GATING = prevDisableGating;
    });

    function buildGateHarness(ticket: {
      createdBy: 'CONSUMER' | 'ADMIN_STAFF';
      intakeFlow?: string;
      serviceCost?: number;
      amountPaid?: number;
      totalAmount?: number;
      status?: string;
    }) {
      const { status: ticketStatus = 'PAID', ...rest } = ticket;
      const prisma = {
        ticket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tkt-1',
            status: ticketStatus,
            caseId: null,
            intakeFlow: null,
            serviceCost: 0,
            amountPaid: 0,
            totalAmount: 0,
            ...rest,
          }),
          update: jest.fn().mockResolvedValue({
            id: 'tkt-1',
            status:
              ticketStatus === 'WAITING_APPROVAL'
                ? 'COMPLETED'
                : ticketStatus === 'COMPLETED'
                  ? 'DELIVERED'
                  : 'ASSIGNED',
            caseId: null,
            consumer: {
              id: 'consumer-1',
              name: 'C',
              phone: null,
              email: null,
            },
            service: { id: 'svc-1', name: 'Svc' },
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      };
      const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
      const pricingService = { resolve: jest.fn() };
      const geoService = { resolveProvinceByCity: jest.fn() };
      const dispatcher = makeDispatcher();
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        dispatcher as never,
      );
      return { service, prisma };
    }

    it('UNPAID → ASSIGNED is blocked (invalid transition in new machine)', async () => {
      const { service, prisma } = buildGateHarness({
        createdBy: 'CONSUMER',
        status: 'UNPAID',
        serviceCost: 5000,
        amountPaid: 0,
        totalAmount: 5000,
      });
      await expect(
        service.updateStatus('tkt-1', 'ASSIGNED', undefined, {
          actorUserId: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('PAID → ASSIGNED is allowed', async () => {
      const { service, prisma } = buildGateHarness({
        createdBy: 'CONSUMER',
        status: 'PAID',
        serviceCost: 5000,
        amountPaid: 5000,
        totalAmount: 5000,
      });
      const updated = await service.updateStatus(
        'tkt-1',
        'ASSIGNED',
        undefined,
        { actorUserId: 'admin-1' },
      );
      expect(updated.status).toBe('ASSIGNED');
      expect(prisma.ticket.update).toHaveBeenCalled();
    });

    it('COMPLETED → DELIVERED blocked when amountPaid < totalAmount', async () => {
      const { service } = buildGateHarness({
        createdBy: 'CONSUMER',
        status: 'COMPLETED',
        serviceCost: 5000,
        amountPaid: 5000,
        totalAmount: 8000,
      });
      await expect(
        service.updateStatus('tkt-1', 'DELIVERED', undefined, {
          actorUserId: 'a',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('COMPLETED → DELIVERED allowed when amountPaid >= totalAmount', async () => {
      const { service, prisma } = buildGateHarness({
        createdBy: 'CONSUMER',
        status: 'COMPLETED',
        serviceCost: 5000,
        amountPaid: 8000,
        totalAmount: 8000,
      });
      await service.updateStatus('tkt-1', 'DELIVERED', undefined, {
        actorUserId: 'a',
      });
      expect(prisma.ticket.update).toHaveBeenCalled();
    });

    it('WAITING_APPROVAL → COMPLETED is allowed', async () => {
      const { service, prisma } = buildGateHarness({
        createdBy: 'CONSUMER',
        status: 'WAITING_APPROVAL',
        serviceCost: 5000,
        amountPaid: 5000,
        totalAmount: 5000,
      });
      await service.updateStatus('tkt-1', 'COMPLETED', undefined, {
        actorUserId: 'a',
      });
      expect(prisma.ticket.update).toHaveBeenCalled();
    });
  });

  // ─── B1: judge_name lower-court requirement ───────────────────────────────

  const CASE_FILES_BASE_WITH_JUDGE = [
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
  ];

  describe('judge_name lower-court requirement', () => {
    it('requires judge_name for LOWER tier', () => {
      expect(
        requiredFieldsFor(
          'judicial_case_files',
          CASE_FILES_BASE_WITH_JUDGE,
          'lower',
        ),
      ).toContain('judge_name');
    });
    it('drops judge_name for HIGH tier', () => {
      expect(
        requiredFieldsFor(
          'judicial_case_files',
          CASE_FILES_BASE_WITH_JUDGE,
          'high',
        ),
      ).not.toContain('judge_name');
    });
  });

  // ─── B2: Case Information is pending-only (no case_type) ─────────────────

  const CASE_INFO_BASE_AFTER = [
    'select_service',
    'select_court',
    'select_court_city',
    'case_petition_no',
    'case_year',
    'case_title',
    'judge_name',
  ]; // note: NO case_type

  describe('Case Information is pending-only (no case_type)', () => {
    it('does not require case_type at any tier', () => {
      for (const tier of [
        'lower',
        'high',
        'special',
        'shariat',
        'supreme',
        'fcc',
      ] as const) {
        expect(
          requiredFieldsFor(
            'judicial_case_information',
            CASE_INFO_BASE_AFTER,
            tier,
          ),
        ).not.toContain('case_type');
      }
    });
  });
});

describe('payment model + charge capabilities (Spec 2)', () => {
  it('classifies SPLIT vs ONE_TIME flows', () => {
    expect(paymentModelFor('judicial_case_files')).toBe('SPLIT');
    expect(paymentModelFor('non_judicial_registry_deed')).toBe('SPLIT');
    expect(paymentModelFor('judicial_case_information')).toBe('ONE_TIME');
    expect(paymentModelFor(undefined)).toBe('ONE_TIME');
  });
  it('exposes attestation only for case files', () => {
    expect(chargeCapabilitiesFor('judicial_case_files').attestation).toBe(true);
    expect(chargeCapabilitiesFor('non_judicial_copy_of_fir').attestation).toBe(
      false,
    );
    expect(chargeCapabilitiesFor('judicial_case_information')).toEqual({
      attestation: false,
      printing: false,
      delivery: false,
      pdf: false,
    });
  });
});

// ─── Task 1.4: finalizeRemainder ──────────────────────────────────────────────

describe('finalizeRemainder (Task 1.4)', () => {
  function buildFinalizeHarness(opts: {
    intakeFlow: string;
    serviceCost: number;
    amountPaid: number;
    attestedCharges?: number;
    printingCharges?: number;
    deliveryCharges?: number;
    pdfCharges?: number;
  }) {
    const ticket = {
      id: 'tkt-fin',
      consumerId: 'consumer-1',
      serviceCost: opts.serviceCost,
      amountPaid: opts.amountPaid,
      intakeFlow: opts.intakeFlow,
    };

    const updatedTicket = { ...ticket };
    const walletService = {
      settleTicketsForUser: jest.fn().mockResolvedValue(undefined),
    };

    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(ticket),
        update: jest.fn().mockResolvedValue(updatedTicket),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        include: jest.fn(),
      },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticketIntakeDraft: { delete: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'consumer-1' }) },
      service: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'svc-1', category: 'judicial' }),
      },
      assignment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    const pricingService = { resolve: jest.fn() };
    const geoService = { resolveProvinceByCity: jest.fn() };
    const dispatcher = makeDispatcher();
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      pricingService as never,
      geoService as never,
      dispatcher as never,
      walletService as never,
    );
    return { service, prisma, walletService };
  }

  it('bumps totalAmount from capability-gated charges and triggers wallet settlement', async () => {
    const { service, prisma, walletService } = buildFinalizeHarness({
      intakeFlow: 'judicial_case_files',
      serviceCost: 5000,
      amountPaid: 5000,
      attestedCharges: 2000,
      printingCharges: 1000,
    });

    // Mock findOne for the return value
    prisma.ticket.findUnique
      .mockResolvedValueOnce({
        id: 'tkt-fin',
        consumerId: 'consumer-1',
        serviceCost: 5000,
        amountPaid: 5000,
        intakeFlow: 'judicial_case_files',
      })
      .mockResolvedValue({
        id: 'tkt-fin',
        consumerId: 'consumer-1',
        serviceCost: 5000,
        amountPaid: 5000,
        intakeFlow: 'judicial_case_files',
        documents: [],
        assignments: [],
        history: [],
        clerkReport: null,
        consumer: { id: 'consumer-1' },
        service: { id: 'svc-1' },
      });

    await service.finalizeRemainder(
      'tkt-fin',
      { attestedCharges: 2000, printingCharges: 1000 },
      { actorUserId: 'admin-1' },
    );

    // totalAmount = 5000 + 2000 + 1000 = 8000
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tkt-fin' },
        data: expect.objectContaining({
          totalAmount: 8000,
          remainderFinalizedAt: expect.any(Date),
        }),
      }),
    );
    expect(walletService.settleTicketsForUser).toHaveBeenCalledWith(
      'consumer-1',
    );
  });

  it('includes the consumer-billed clerkCost in the finalized total', async () => {
    const { service, prisma } = buildFinalizeHarness({
      intakeFlow: 'judicial_case_files',
      serviceCost: 5000,
      amountPaid: 5000,
    });

    prisma.ticket.findUnique
      .mockResolvedValueOnce({
        id: 'tkt-fin',
        consumerId: 'consumer-1',
        serviceCost: 5000,
        clerkCost: 1500,
        amountPaid: 5000,
        intakeFlow: 'judicial_case_files',
      })
      .mockResolvedValue({
        id: 'tkt-fin',
        documents: [],
        assignments: [],
        history: [],
        clerkReport: null,
        consumer: { id: 'consumer-1' },
        service: { id: 'svc-1' },
      });

    await service.finalizeRemainder(
      'tkt-fin',
      { attestedCharges: 2000, printingCharges: 1000 },
      { actorUserId: 'admin-1' },
    );

    // total = serviceCost 5000 + clerkCost 1500 + attested 2000 + printing 1000
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalAmount: 9500 }),
      }),
    );
  });

  it('does not include paymentStatus in the finalize update (removed column)', async () => {
    const { service, prisma } = buildFinalizeHarness({
      intakeFlow: 'judicial_case_files',
      serviceCost: 5000,
      amountPaid: 5000,
    });

    prisma.ticket.findUnique
      .mockResolvedValueOnce({
        id: 'tkt-fin',
        consumerId: 'consumer-1',
        serviceCost: 5000,
        amountPaid: 5000,
        intakeFlow: 'judicial_case_files',
      })
      .mockResolvedValue({
        id: 'tkt-fin',
        documents: [],
        assignments: [],
        history: [],
        clerkReport: null,
        consumer: { id: 'consumer-1' },
        service: { id: 'svc-1' },
      });

    await service.finalizeRemainder(
      'tkt-fin',
      { printingCharges: 3000 },
      { actorUserId: 'admin-1' },
    );

    const updateCall = prisma.ticket.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('paymentStatus');
    expect(updateCall.data.totalAmount).toBe(8000); // 5000 + 3000
  });

  it('zeroes attestation charges for flows without attestation capability', async () => {
    const { service, prisma } = buildFinalizeHarness({
      intakeFlow: 'non_judicial_copy_of_fir',
      serviceCost: 3000,
      amountPaid: 0,
    });

    prisma.ticket.findUnique
      .mockResolvedValueOnce({
        id: 'tkt-fin',
        consumerId: 'consumer-1',
        serviceCost: 3000,
        amountPaid: 0,
        intakeFlow: 'non_judicial_copy_of_fir',
      })
      .mockResolvedValue({
        id: 'tkt-fin',
        documents: [],
        assignments: [],
        history: [],
        clerkReport: null,
        consumer: { id: 'consumer-1' },
        service: { id: 'svc-1' },
      });

    await service.finalizeRemainder(
      'tkt-fin',
      { attestedCharges: 9999, printingCharges: 500 }, // attestation should be zeroed
      { actorUserId: 'admin-1' },
    );

    const updateCall = prisma.ticket.update.mock.calls[0][0];
    // attestation is NOT a capability of non_judicial_copy_of_fir
    expect(updateCall.data.attestedCharges).toBe(0);
    // printing IS a capability
    expect(updateCall.data.printingCharges).toBe(500);
    // totalAmount = 3000 + 0 (attested zeroed) + 500 = 3500
    expect(updateCall.data.totalAmount).toBe(3500);
  });

  it('throws NotFoundException when ticket not found', async () => {
    const { service, prisma } = buildFinalizeHarness({
      intakeFlow: 'judicial_case_files',
      serviceCost: 5000,
      amountPaid: 0,
    });
    prisma.ticket.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.finalizeRemainder('nonexistent', {}, { actorUserId: 'admin-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('unified status helpers (Spec 4)', () => {
  it('has the 7 unified statuses, no PENDING', () => {
    expect(TICKET_STATUSES).toEqual([
      'UNPAID',
      'PAID',
      'ASSIGNED',
      'IN_PROGRESS',
      'WAITING_APPROVAL',
      'COMPLETED',
      'DELIVERED',
    ]);
  });
  it('derives base coverage and full payment from amounts', () => {
    expect(isBaseCovered({ amountPaid: 500, serviceCost: 500 })).toBe(true);
    expect(isBaseCovered({ amountPaid: 200, serviceCost: 500 })).toBe(false);
    expect(isFullyPaid({ amountPaid: 800, totalAmount: 800 })).toBe(true);
    expect(isFullyPaid({ amountPaid: 500, totalAmount: 800 })).toBe(false);
  });
});

describe('orderCaseDetailKeys (Spec 3)', () => {
  it('orders known keys city→court→service→…, appends unknown alphabetically', () => {
    const out = orderCaseDetailKeys([
      'case_title',
      'zzz_extra',
      'select_court_city',
      'select_service',
      'aaa_extra',
    ]);
    expect(out).toEqual([
      'select_court_city',
      'select_service',
      'case_title',
      'aaa_extra',
      'zzz_extra',
    ]);
  });
});

// ─── Task 1.2: assignBulk ────────────────────────────────────────────────────

describe('assignBulk (Spec 3)', () => {
  function buildAssignBulkService(opts: {
    tickets: Array<{ id: string; defaultClerkCost: number | null }>;
    assignShouldThrowFor?: string[];
  }) {
    const ticketMap = new Map(opts.tickets.map((t) => [t.id, t]));
    const prisma = {
      ticket: {
        findUnique: jest
          .fn()
          .mockImplementation(
            async (args: { where: { id: string }; select?: unknown }) => {
              return ticketMap.get(args.where.id) ?? null;
            },
          ),
      },
    };
    const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    const pricingService = { resolve: jest.fn() };
    const geoService = { resolveProvinceByCity: jest.fn() };
    const dispatcher = makeDispatcher();
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      pricingService as never,
      geoService as never,
      dispatcher as never,
    );

    // Spy on the real assign method: resolve for normal tickets, throw for bad ones
    jest.spyOn(service, 'assign').mockImplementation(async (id: string) => {
      if (opts.assignShouldThrowFor?.includes(id)) {
        throw new ForbiddenException(`Gating failed for ${id}`);
      }
      return { id } as never;
    });

    return { service, prisma };
  }

  it('assigns each ticket using its own defaultClerkCost; collects skipped', async () => {
    const { service } = buildAssignBulkService({
      tickets: [
        { id: 'tkt-ok', defaultClerkCost: 1500 },
        { id: 'tkt-bad', defaultClerkCost: 0 },
      ],
      assignShouldThrowFor: ['tkt-bad'],
    });

    const result = await service.assignBulk(
      { ticketIds: ['tkt-ok', 'tkt-bad'], representativeId: 'rep-1' },
      { actorUserId: 'admin-1' },
    );

    expect(result.assigned).toEqual(['tkt-ok']);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].ticketId).toBe('tkt-bad');

    // Verify assign was called with the ticket's own defaultClerkCost
    expect(service.assign).toHaveBeenCalledWith(
      'tkt-ok',
      expect.objectContaining({ clerkCost: 1500, representativeId: 'rep-1' }),
      expect.anything(),
    );
  });

  it('skips tickets that are not found', async () => {
    const { service } = buildAssignBulkService({ tickets: [] });

    const result = await service.assignBulk({
      ticketIds: ['missing-1'],
      representativeId: 'rep-1',
    });

    expect(result.assigned).toHaveLength(0);
    expect(result.skipped[0]).toMatchObject({
      ticketId: 'missing-1',
      reason: 'Not found',
    });
  });
});

// ─── Task 1.3: recordNextHearing + generateNextHearing ───────────────────────

describe('recordNextHearing (Task 1.3)', () => {
  function buildService() {
    const stored: Record<string, unknown> = {
      id: 'tkt-1',
      status: 'IN_PROGRESS',
    };
    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(stored),
        update: jest
          .fn()
          .mockImplementation(
            async (args: { data: Record<string, unknown> }) => ({
              ...stored,
              ...args.data,
            }),
          ),
      },
    };
    const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    const pricingService = { resolve: jest.fn() };
    const geoService = { resolveProvinceByCity: jest.fn() };
    const dispatcher = makeDispatcher();
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      pricingService as never,
      geoService as never,
      dispatcher as never,
    );
    return { service, prisma };
  }

  it('sets scheduledDate on the ticket', async () => {
    const { service, prisma } = buildService();
    await service.recordNextHearing('tkt-1', { scheduledDate: '2026-09-01' });
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tkt-1' },
        data: expect.objectContaining({
          scheduledDate: new Date('2026-09-01'),
        }),
      }),
    );
  });

  it('also sets hearingType when provided', async () => {
    const { service, prisma } = buildService();
    await service.recordNextHearing('tkt-1', {
      scheduledDate: '2026-09-01',
      hearingType: 'Arguments',
    });
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hearingType: 'Arguments' }),
      }),
    );
  });
});

describe('generateNextHearing (Task 1.3)', () => {
  function buildService(parent: Record<string, unknown>) {
    const created: { data: Record<string, unknown> }[] = [];
    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(parent),
        create: jest
          .fn()
          .mockImplementation(
            async (args: { data: Record<string, unknown> }) => {
              created.push(args);
              return { id: 'tkt-new', ...args.data };
            },
          ),
      },
      ticketStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    const pricingService = { resolve: jest.fn() };
    const geoService = { resolveProvinceByCity: jest.fn() };
    const dispatcher = makeDispatcher();
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      pricingService as never,
      geoService as never,
      dispatcher as never,
    );
    return { service, prisma, created };
  }

  const baseParent = {
    id: 'tkt-parent',
    batchNo: 'TKT-001',
    consumerId: 'consumer-1',
    serviceId: 'svc-1',
    serviceCity: 'Lahore',
    caseType: 'civil',
    intakeFlow: 'judicial_case_files',
    formPayload: {
      select_court_city: 'Lahore',
      select_court: 'District Court',
      case_title: 'State vs A',
      case_year: '2024',
      judge_name: 'Judge X',
    },
    serviceCost: 5000,
    defaultClerkCost: 1000,
    scheduledDate: new Date('2026-09-15'),
  };

  it('creates a CONSUMER-owned UNPAID ticket prefilled from parent', async () => {
    const { service, created } = buildService(baseParent);

    const result = await service.generateNextHearing('tkt-parent', {
      actorUserId: 'admin-1',
    });

    expect(result).toBeDefined();
    const data = created[0]?.data;
    expect(data?.createdBy).toBe('CONSUMER');
    expect(data?.status).toBe('UNPAID');
    expect(data?.consumerId).toBe('consumer-1');
  });

  it('seeds scheduledDate as case_date in the new payload', async () => {
    const { service, created } = buildService(baseParent);
    await service.generateNextHearing('tkt-parent', { actorUserId: 'admin-1' });
    const payload = created[0]?.data.formPayload as Record<string, unknown>;
    expect(payload?.case_date).toBe('2026-09-15');
    expect(payload?.case_status).toBe('Pending Case');
    expect(payload?.parent_ticket_id).toBe('tkt-parent');
  });

  it('copies case-identifier keys from parent payload', async () => {
    const { service, created } = buildService(baseParent);
    await service.generateNextHearing('tkt-parent');
    const payload = created[0]?.data.formPayload as Record<string, unknown>;
    expect(payload?.select_court_city).toBe('Lahore');
    expect(payload?.case_title).toBe('State vs A');
    expect(payload?.judge_name).toBe('Judge X');
  });

  it('throws BadRequestException when no scheduledDate recorded', async () => {
    const parentWithoutDate = { ...baseParent, scheduledDate: null };
    const { service } = buildService(parentWithoutDate);
    await expect(
      service.generateNextHearing('tkt-parent'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException when parent ticket not found', async () => {
    const { service, prisma } = buildService(baseParent);
    prisma.ticket.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.generateNextHearing('nonexistent'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
