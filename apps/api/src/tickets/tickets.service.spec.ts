import { jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';

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
      paymentStatus: 'PARTIALLY_PAID',
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
    const notificationsService = { create: jest.fn().mockResolvedValue({}) };
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      pricingService as never,
      geoService as never,
      notificationsService as never,
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
          paymentStatus: 'PARTIALLY_PAID',
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
    const notificationsService = { create: jest.fn() };
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      pricingService as never,
      geoService as never,
      notificationsService as never,
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
          ? { ...ticket, status: 'PENDING' }
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
      const notificationsService = {
        create: jest.fn().mockResolvedValue({}),
      };
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        notificationsService as never,
      );
      return {
        service,
        prisma,
        auditLogsService,
        notificationsService,
      };
    }

    it('marks active Assignment REJECTED, reverts ticket to PENDING, notifies assigning admin', async () => {
      const { service, prisma, auditLogsService, notificationsService } =
        buildService({});

      await service.rejectAssignment(
        'ticket-1',
        'Cannot reach court this week',
        { actorUserId: 'clerk-1', actorEmail: 'clerk-1@example.com' },
      );

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: { status: 'PENDING' },
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
            to: 'PENDING',
            note: 'Cannot reach court this week',
          }),
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          title: expect.stringMatching(/reject/i),
        }),
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
      const notificationsService = { create: jest.fn().mockResolvedValue({}) };
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        notificationsService as never,
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
        ticket: { id: 'ticket-1', status: 'PENDING', batchNo: 'TKT-001' },
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
      const notificationsService = {
        create: jest.fn().mockResolvedValue({}),
      };
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        notificationsService as never,
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
      const notificationsService = { create: jest.fn().mockResolvedValue({}) };
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        notificationsService as never,
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
      const notificationsService = { create: jest.fn() };
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        notificationsService as never,
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
      const notificationsService = {
        create: jest.fn().mockResolvedValue({}),
        sendEmail: jest.fn().mockResolvedValue({}),
      };
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        notificationsService as never,
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
      const notificationsService = { create: jest.fn().mockResolvedValue({}) };
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        notificationsService as never,
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
            case_type: 'civil',
            case_title: 'A vs B',
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
            case_type: 'civil',
            case_title: 'A vs B',
          },
        } as never,
        { actorUserId: 'admin-1', actorEmail: 'a@x.com' },
      );
      expect(created[0]?.data.createdBy).toBe('ADMIN_STAFF');
    });

    it('stamps createdBy=ADMIN_STAFF when no actor is supplied', async () => {
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
            case_type: 'civil',
            case_title: 'A vs B',
          },
        } as never,
      );
      expect(created[0]?.data.createdBy).toBe('ADMIN_STAFF');
    });
  });

  describe('Payment gate', () => {
    function buildGateHarness(ticket: {
      createdBy: 'CONSUMER' | 'ADMIN_STAFF';
      paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
    }) {
      const prisma = {
        ticket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tkt-1',
            status: 'PENDING',
            caseId: null,
            ...ticket,
          }),
          update: jest.fn().mockResolvedValue({
            id: 'tkt-1',
            status: 'ASSIGNED',
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
      const notificationsService = {
        create: jest.fn().mockResolvedValue({}),
        sendEmail: jest.fn().mockResolvedValue({}),
      };
      const service = new TicketsService(
        prisma as never,
        auditLogsService as never,
        pricingService as never,
        geoService as never,
        notificationsService as never,
      );
      return { service, prisma };
    }

    it('blocks PENDING → ASSIGNED for a CONSUMER ticket that is UNPAID', async () => {
      const { service, prisma } = buildGateHarness({
        createdBy: 'CONSUMER',
        paymentStatus: 'UNPAID',
      });
      await expect(
        service.updateStatus('tkt-1', 'ASSIGNED', undefined, {
          actorUserId: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('blocks PENDING → ASSIGNED for a CONSUMER ticket that is PARTIALLY_PAID', async () => {
      const { service, prisma } = buildGateHarness({
        createdBy: 'CONSUMER',
        paymentStatus: 'PARTIALLY_PAID',
      });
      await expect(
        service.updateStatus('tkt-1', 'ASSIGNED', undefined, {
          actorUserId: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('allows PENDING → ASSIGNED for ADMIN_STAFF ticket while UNPAID', async () => {
      const { service, prisma } = buildGateHarness({
        createdBy: 'ADMIN_STAFF',
        paymentStatus: 'UNPAID',
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

    it('allows PENDING → ASSIGNED for CONSUMER ticket once paymentStatus=PAID', async () => {
      const { service, prisma } = buildGateHarness({
        createdBy: 'CONSUMER',
        paymentStatus: 'PAID',
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
  });
});
