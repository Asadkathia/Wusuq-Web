import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
    ticketDispatched: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
    caseDriftDetected: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(prisma: Record<string, unknown>) {
  const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
  return new TicketsService(
    prisma as never,
    auditLogsService as never,
    { resolve: jest.fn() } as never,
    { resolveProvinceByCity: jest.fn() } as never,
    makeDispatcher() as never,
    { settleTicketsForUser: jest.fn().mockResolvedValue(undefined) } as never,
  );
}

function fullTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    consumerId: 'consumer-B',
    status: 'COMPLETED',
    intakeFlow: 'judicial_case_files',
    clerkCost: 500,
    defaultClerkCost: 400,
    dispatchProofUrl: '/uploads/proof.jpg',
    clerkReport: { id: 'report-1', attestedAvailable: true },
    consumer: {
      id: 'consumer-B',
      name: 'Owner',
      email: 'b@example.com',
      phone: '+923001234567',
      cnic: '12345-1234567-1',
      address: 'B street',
      province: 'Punjab',
      district: 'Lahore',
      city: 'Lahore',
    },
    service: {
      id: 'svc-1',
      name: 'Case Files',
      category: 'judicial',
      type: 'x',
    },
    assignments: [
      {
        id: 'asg-1',
        representativeId: 'rep-A',
        representative: {
          id: 'rep-A',
          name: 'Rep A',
          phone: '+923009999999',
          city: 'Lahore',
          district: 'Lahore',
          court: 'High Court',
        },
      },
    ],
    documents: [
      { id: 'doc-1', visibleToConsumer: true, name: 'deliverable.pdf' },
      { id: 'doc-2', visibleToConsumer: false, name: 'internal.pdf' },
    ],
    history: [],
    ...overrides,
  };
}

describe('findOne ownership scoping (report 3.1)', () => {
  it('returns 404 when a consumer fetches another consumer ticket', async () => {
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(fullTicket()) },
    };
    const service = makeService(prisma);

    await expect(
      service.findOne('ticket-1', { role: 'consumer', userId: 'consumer-A' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('strips internal clerk fields and rep phone for the owning consumer', async () => {
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(fullTicket()) },
    };
    const service = makeService(prisma);

    const result = (await service.findOne('ticket-1', {
      role: 'consumer',
      userId: 'consumer-B',
    })) as Record<string, unknown>;

    expect(result).not.toHaveProperty('clerkCost');
    expect(result).not.toHaveProperty('defaultClerkCost');
    expect(result).not.toHaveProperty('clerkReport');
    expect(result).not.toHaveProperty('dispatchProofUrl');
    const assignments = result.assignments as Array<{
      representative: Record<string, unknown>;
    }>;
    expect(assignments[0].representative).not.toHaveProperty('phone');
    // COMPLETED ticket → only consumer-visible documents.
    const docs = result.documents as Array<{ id: string }>;
    expect(docs.map((d) => d.id)).toEqual(['doc-1']);
  });

  it('hides all documents from the owner before completion', async () => {
    const prisma = {
      ticket: {
        findUnique: jest
          .fn()
          .mockResolvedValue(fullTicket({ status: 'IN_PROGRESS' })),
      },
    };
    const service = makeService(prisma);

    const result = (await service.findOne('ticket-1', {
      role: 'consumer',
      userId: 'consumer-B',
    })) as Record<string, unknown>;
    expect(result.documents).toEqual([]);
  });

  it('keeps documents visible to the owner at DELIVERED (terminal state)', async () => {
    const prisma = {
      ticket: {
        findUnique: jest
          .fn()
          .mockResolvedValue(fullTicket({ status: 'DELIVERED' })),
      },
    };
    const service = makeService(prisma);

    const result = (await service.findOne('ticket-1', {
      role: 'consumer',
      userId: 'consumer-B',
    })) as Record<string, unknown>;
    const docs = result.documents as Array<{ id: string }>;
    // Auto-deliver / delivery confirmation must not lock the consumer out of
    // the deliverables they paid for.
    expect(docs.map((d) => d.id)).toEqual(['doc-1']);
  });

  it('allows the owner to download a visible document at DELIVERED', async () => {
    const service = makeService({
      ticketDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'doc-1',
          fileUrl: '/x',
          name: 'n',
          type: 'application/pdf',
          visibleToConsumer: true,
          ticket: { consumerId: 'consumer-A', status: 'DELIVERED' },
        }),
      },
    });

    await expect(
      service.resolveDocumentDownload('ticket-1', 'doc-1', {
        userId: 'consumer-A',
        role: 'consumer',
        consumerId: 'consumer-A',
      }),
    ).resolves.toMatchObject({ filePath: '/x' });
  });

  it('consumers can upload to their own ticket but not to others', async () => {
    const makeUploadPrisma = (consumerId: string) => ({
      ticket: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ticket-1', consumerId }),
      },
      ticketDocument: {
        create: jest.fn().mockResolvedValue({
          id: 'doc-1',
          visibleToConsumer: false,
        }),
      },
      assignment: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const file = {
      filename: 'a.pdf',
      mimetype: 'application/pdf',
      path: '/uploads/a.pdf',
    };

    const own = makeService(makeUploadPrisma('consumer-A'));
    await expect(
      own.uploadDocument('ticket-1', file, {
        actorUserId: 'consumer-A',
        actorRole: 'consumer',
      }),
    ).resolves.toBeDefined();

    const foreign = makeService(makeUploadPrisma('consumer-B'));
    await expect(
      foreign.uploadDocument('ticket-1', file, {
        actorUserId: 'consumer-A',
        actorRole: 'consumer',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('keeps internal fields for staff callers', async () => {
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(fullTicket()) },
    };
    const service = makeService(prisma);

    const result = (await service.findOne('ticket-1', {
      role: 'staff-admin',
      userId: 'admin-1',
    })) as Record<string, unknown>;
    expect(result.clerkCost).toBe(500);
    expect(result).toHaveProperty('clerkReport');
  });

  it('returns 404 when a representative fetches a ticket they are not assigned to', async () => {
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(fullTicket()) },
      assignment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = makeService(prisma);

    await expect(
      service.findOne('ticket-1', { role: 'representative', userId: 'rep-Z' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('resolveDocumentDownload consumer guards (report 3.1)', () => {
  function docPrisma(doc: Record<string, unknown>) {
    return {
      ticketDocument: { findFirst: jest.fn().mockResolvedValue(doc) },
    };
  }

  it('forbids a consumer downloading a document from another consumer ticket', async () => {
    const service = makeService(
      docPrisma({
        id: 'doc-1',
        fileUrl: '/x',
        name: 'n',
        type: 'application/pdf',
        visibleToConsumer: true,
        ticket: { consumerId: 'consumer-B', status: 'COMPLETED' },
      }),
    );

    await expect(
      service.resolveDocumentDownload('ticket-1', 'doc-1', {
        userId: 'consumer-A',
        role: 'consumer',
        consumerId: 'consumer-A',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids a consumer downloading an internal work document on their own ticket', async () => {
    const service = makeService(
      docPrisma({
        id: 'doc-2',
        fileUrl: '/x',
        name: 'n',
        type: 'application/pdf',
        visibleToConsumer: false,
        ticket: { consumerId: 'consumer-A', status: 'COMPLETED' },
      }),
    );

    await expect(
      service.resolveDocumentDownload('ticket-1', 'doc-2', {
        userId: 'consumer-A',
        role: 'consumer',
        consumerId: 'consumer-A',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids a representative downloading documents from an unassigned ticket', async () => {
    const prisma = {
      ticketDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'doc-1',
          fileUrl: '/x',
          name: 'n',
          type: 'application/pdf',
          visibleToConsumer: false,
          ticket: { consumerId: 'consumer-A', status: 'COMPLETED' },
        }),
      },
      assignment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = makeService(prisma);

    await expect(
      service.resolveDocumentDownload('ticket-1', 'doc-1', {
        userId: 'rep-Z',
        role: 'representative',
        consumerId: 'rep-Z',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('clerk actions bound to the active assignee (report 3.3e)', () => {
  function clerkPrisma(overrides: Record<string, unknown> = {}) {
    return {
      ticket: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue(fullTicket({ status: 'WAITING_APPROVAL' })),
        findUnique: jest.fn().mockResolvedValue(
          fullTicket({
            status: 'IN_PROGRESS',
            deliveryStatus: 'PENDING',
            deliveryCharges: 0,
            printingCharges: 0,
            attestedCharges: 0,
            nonAttestedCharges: 0,
            additionalCharges: 0,
            additionalServiceCost: 0,
            discountPrice: 0,
            serviceCost: 1000,
            trackingNo: null,
          }),
        ),
        update: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      assignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'asg-1',
          representativeId: 'rep-A',
          status: 'ACCEPTED',
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticketClerkReport: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(clerkTx)
          : Promise.all(arg as Promise<unknown>[]),
      ),
      ...overrides,
    };
  }
  // tx proxy shared with $transaction(fn) callers — filled in below per test.
  let clerkTx: Record<string, unknown>;

  const repB = { actorUserId: 'rep-B', actorRole: 'representative' as const };
  const admin = { actorUserId: 'admin-1', actorRole: 'staff-admin' as const };

  it('forbids submitClerkReceipt by a rep who does not own the assignment', async () => {
    const prisma = clerkPrisma();
    clerkTx = prisma;
    const service = makeService(prisma);
    await expect(
      service.submitClerkReceipt('ticket-1', '/uploads/r.jpg', repB),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows submitClerkReceipt by staff regardless of assignment', async () => {
    const prisma = clerkPrisma();
    clerkTx = prisma;
    const service = makeService(prisma);
    await expect(
      service.submitClerkReceipt('ticket-1', '/uploads/r.jpg', admin),
    ).resolves.toBeDefined();
  });

  it('forbids submitClerkCosts by a rep who does not own the assignment', async () => {
    const prisma = clerkPrisma();
    clerkTx = prisma;
    const service = makeService(prisma);
    await expect(
      service.submitClerkCosts('ticket-1', { deliveryCharges: 10 }, repB),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids saveClerkCharges by a rep who does not own the assignment', async () => {
    const prisma = clerkPrisma();
    clerkTx = prisma;
    const service = makeService(prisma);
    await expect(
      service.saveClerkCharges('ticket-1', { deliveryCharges: 10 }, repB),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids dispatchDelivery by a rep who does not own the assignment', async () => {
    const prisma = clerkPrisma({
      ticket: {
        findUnique: jest.fn().mockResolvedValue(
          fullTicket({
            status: 'COMPLETED',
            deliveryStatus: 'PENDING',
            trackingNo: null,
          }),
        ),
        update: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    clerkTx = prisma;
    const service = makeService(prisma);
    await expect(
      service.dispatchDelivery('ticket-1', { trackingNo: 'TRK' }, repB),
    ).rejects.toThrow(ForbiddenException);
  });

  it('forbids rejectAssignment by a rep who does not own the assignment', async () => {
    const prisma = clerkPrisma({
      ticket: {
        findUnique: jest
          .fn()
          .mockResolvedValue(fullTicket({ status: 'ASSIGNED' })),
        update: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      assignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'asg-1',
          representativeId: 'rep-A',
          status: 'ACTIVE',
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    clerkTx = prisma;
    const service = makeService(prisma);
    await expect(
      service.rejectAssignment('ticket-1', 'cannot do this one', repB),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('findOne consumer redaction — history notes', () => {
  it('strips history note from the consumer view while keeping from/to/createdAt', async () => {
    const ticketWithNotes = {
      ...fullTicket(),
      history: [
        {
          id: 'h1',
          from: 'PAID',
          to: 'ASSIGNED',
          note: 'Assigned to Rep A',
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'h2',
          from: 'ASSIGNED',
          to: 'IN_PROGRESS',
          note: null,
          createdAt: new Date('2024-01-02'),
        },
      ],
    };
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(ticketWithNotes) },
    };
    const service = makeService(prisma);

    const result = (await service.findOne('ticket-1', {
      role: 'consumer',
      userId: 'consumer-B',
    })) as Record<string, unknown>;

    const history = result.history as Array<Record<string, unknown>>;
    expect(history).toHaveLength(2);
    // note must not be present on ANY row, regardless of original value.
    history.forEach((row) => {
      expect(row).not.toHaveProperty('note');
    });
    // from/to/createdAt must be preserved.
    expect(history[0]).toMatchObject({ from: 'PAID', to: 'ASSIGNED' });
    expect(history[1]).toMatchObject({ from: 'ASSIGNED', to: 'IN_PROGRESS' });
  });

  it('returns history notes intact for staff callers', async () => {
    const ticketWithNotes = {
      ...fullTicket(),
      history: [
        {
          id: 'h1',
          from: 'PAID',
          to: 'ASSIGNED',
          note: 'Assigned to Rep A',
          createdAt: new Date('2024-01-01'),
        },
      ],
    };
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(ticketWithNotes) },
    };
    const service = makeService(prisma);

    const result = (await service.findOne('ticket-1', {
      role: 'staff-admin',
      userId: 'admin-1',
    })) as Record<string, unknown>;

    const history = result.history as Array<Record<string, unknown>>;
    // Staff must still see the note.
    expect(history[0]).toHaveProperty('note', 'Assigned to Rep A');
  });
});
