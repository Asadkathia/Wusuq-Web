import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
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

function moneyTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    batchNo: 'B-1',
    consumerId: 'consumer-B',
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
    serviceCity: 'Lahore',
    caseType: 'Civil',
    intakeFlow: 'judicial_case_files',
    formPayload: {},
    status: 'COMPLETED',
    clerkApprovalStatus: 'SUBMITTED',
    clerkReceiptUrl: '/uploads/r.jpg',
    serviceCost: 2300,
    totalAmount: 3510,
    amountPaid: 1000,
    currency: 'PKR',
    createdBy: 'ADMIN_STAFF',
    deliveryStatus: 'PENDING',
    trackingNo: null,
    dispatchProofUrl: '/uploads/proof.jpg',
    clerkCost: 500,
    defaultClerkCost: 400,
    deliveryCharges: 400,
    printingCharges: 100,
    attestedCharges: 200,
    nonAttestedCharges: 0,
    additionalCharges: 0,
    additionalServiceCost: 0,
    discountPrice: 0,
    promoDiscount: 0,
    taxRate: 0.2,
    taxAmount: 510,
    remainderFinalizedAt: null,
    scheduledDate: null,
    nextDate: null,
    hearingType: null,
    case: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    assignments: [
      {
        status: 'ACCEPTED',
        representative: { id: 'rep-A', name: 'Rep A' },
      },
    ],
    history: [{ createdAt: new Date('2024-01-02') }],
    ...overrides,
  };
}

function findAllPrisma(row: Record<string, unknown>) {
  return {
    ticket: {
      findMany: jest.fn().mockResolvedValue([row]),
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn((arr: unknown) =>
      Promise.all(arr as Promise<unknown>[]),
    ),
  };
}

const baseQuery = { page: 1, limit: 200 } as never;

describe('Task 1.1 — findAll redaction by role', () => {
  it('hides consumer money from representatives but keeps their clerk cost', async () => {
    const service = makeService(findAllPrisma(moneyTicket()));
    const res = (await service.findAll(baseQuery, {
      forConsumer: true,
      forRepresentative: true,
    })) as { items: Array<Record<string, unknown>> };
    const item = res.items[0];
    expect(item).not.toHaveProperty('totalAmount');
    expect(item).not.toHaveProperty('amountPaid');
    expect(item).not.toHaveProperty('serviceCost');
    expect(item).not.toHaveProperty('deliveryCharges');
    expect(item).not.toHaveProperty('printingCharges');
    expect(item).not.toHaveProperty('attestedCharges');
    expect(item).not.toHaveProperty('additionalCharges');
    // Their own internal clerk cost is retained.
    expect(item.clerkCost).toBe(500);
  });

  it('keeps consumer money but hides clerk cost from consumers', async () => {
    const service = makeService(findAllPrisma(moneyTicket()));
    const res = (await service.findAll(baseQuery, {
      forConsumer: true,
    })) as { items: Array<Record<string, unknown>> };
    const item = res.items[0];
    expect(item.totalAmount).toBe(3510);
    expect(item.amountPaid).toBe(1000);
    expect(item).not.toHaveProperty('clerkCost');
  });

  it('keeps everything for staff', async () => {
    const service = makeService(findAllPrisma(moneyTicket()));
    const res = (await service.findAll(baseQuery, {})) as {
      items: Array<Record<string, unknown>>;
    };
    const item = res.items[0];
    expect(item.totalAmount).toBe(3510);
    expect(item.clerkCost).toBe(500);
  });
});

describe('Task 1.1 — findOne representative redaction', () => {
  it('strips consumer money + PII for the assigned rep, keeps clerk cost', async () => {
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(moneyTicket()) },
      assignment: { findFirst: jest.fn().mockResolvedValue({ id: 'asg-1' }) },
    };
    const service = makeService(prisma);
    const result = (await service.findOne('ticket-1', {
      role: 'representative',
      userId: 'rep-A',
    })) as Record<string, unknown>;

    expect(result).not.toHaveProperty('totalAmount');
    expect(result).not.toHaveProperty('amountPaid');
    expect(result).not.toHaveProperty('serviceCost');
    expect(result).not.toHaveProperty('attestedCharges');
    expect(result).not.toHaveProperty('taxAmount');
    expect(result.clerkCost).toBe(500);
    const consumer = result.consumer as Record<string, unknown>;
    expect(consumer.name).toBe('Owner');
    expect(consumer).not.toHaveProperty('email');
    expect(consumer).not.toHaveProperty('phone');
    expect(consumer).not.toHaveProperty('cnic');
  });
});

describe('Task 3.1 — pay-at-end assign from UNPAID', () => {
  function assignPrisma(status: string) {
    const tx = {
      ticket: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      assignment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'asg-1' }),
      },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    return {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          status,
          serviceCity: 'Lahore',
          serviceCost: 2300,
          deliveryCharges: 0,
          printingCharges: 0,
          attestedCharges: 0,
          nonAttestedCharges: 0,
          additionalCharges: 0,
          additionalServiceCost: 0,
          discountPrice: 0,
          service: { id: 'svc-1', category: 'judicial' },
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rep-A',
          role: 'representative',
          isActive: true,
          city: 'Lahore',
          courtCity: null,
        }),
      },
      assignment: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: unknown) =>
        (fn as (t: unknown) => unknown)(tx),
      ),
    };
  }

  it('assigns directly from UNPAID (no payment precondition)', async () => {
    const service = makeService(assignPrisma('UNPAID'));
    await expect(
      service.assign('ticket-1', { representativeId: 'rep-A' } as never, {}),
    ).resolves.toMatchObject({ assigned: true });
  });

  it('still blocks DELIVERED when the ticket is not fully paid', async () => {
    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          status: 'COMPLETED',
          intakeFlow: 'judicial_case_information',
          totalAmount: 1000,
          amountPaid: 0,
          deliveryStatus: 'PENDING',
        }),
      },
    };
    const service = makeService(prisma);
    await expect(
      service.updateStatus('ticket-1', 'DELIVERED' as never),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('Task 3.3 — representativeCandidates city scoping', () => {
  function repPrisma(reps: Array<Record<string, unknown>>) {
    return { user: { findMany: jest.fn().mockResolvedValue(reps) } };
  }
  const reps = [
    { id: 'r1', name: 'Isb Rep', city: 'Islamabad', courtCity: 'Islamabad' },
    { id: 'r2', name: 'Lhr Rep', city: 'Lahore', courtCity: 'Lahore' },
  ];

  it('returns only matching reps when a city is given', async () => {
    const service = makeService(repPrisma(reps));
    const res = (await service.representativeCandidates({
      city: 'Islamabad',
    })) as Array<{ id: string }>;
    expect(res.map((r) => r.id)).toEqual(['r1']);
  });

  it('returns all reps when no city is given', async () => {
    const service = makeService(repPrisma(reps));
    const res = (await service.representativeCandidates({})) as Array<{
      id: string;
    }>;
    expect(res.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('returns no reps when none serve the city (FE then offers Override)', async () => {
    // No full-pool fallback: assign() 409s a non-serving rep unless forceAssign,
    // so listing far-away reps would let the admin pick one and hit a confusing
    // failure. An empty result is the signal to tick "Override city restriction".
    const service = makeService(repPrisma(reps));
    const res = (await service.representativeCandidates({
      city: 'Quetta',
    })) as Array<{ id: string }>;
    expect(res).toEqual([]);
  });
});

describe('Task 4.1 — clerk page breakdown persisted', () => {
  function clerkPrisma() {
    const tx = {
      ticket: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    return {
      tx,
      prisma: {
        ticket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ticket-1',
            status: 'IN_PROGRESS',
            serviceCost: 1000,
            deliveryCharges: 0,
            printingCharges: 0,
            attestedCharges: 0,
            nonAttestedCharges: 0,
            additionalCharges: 0,
            additionalServiceCost: 0,
            discountPrice: 0,
            noOfPages: null,
            costPerPage: null,
            remainderFinalizedAt: null,
          }),
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ id: 'ticket-1', consumerId: 'c1' }),
        },
        assignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'asg',
            representativeId: 'rep-A',
            status: 'ACCEPTED',
          }),
        },
        ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
        ticketClerkReport: { upsert: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(async (fn: unknown) =>
          (fn as (t: unknown) => unknown)(tx),
        ),
      },
    };
  }

  it('persists noOfPages + costPerPage on submitClerkCosts', async () => {
    const { tx, prisma } = clerkPrisma();
    const service = makeService(prisma);
    await service.submitClerkCosts(
      'ticket-1',
      { noOfPages: 10, costPerPage: 5 } as never,
      { actorUserId: 'rep-A', actorRole: 'representative' },
    );
    const data = (tx.ticket.updateMany as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.data.noOfPages).toBe(10);
    expect(data.data.costPerPage).toBe(5);
    // printingCharges = pages × rate.
    expect(data.data.printingCharges).toBe(50);
  });
});

describe('recordNextHearing — clerk action scope (auth, review-3)', () => {
  function nextHearingPrisma(assignedRepId: string | null) {
    return {
      ticket: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'ticket-1', consumerId: 'c1' }),
        update: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
      },
      assignment: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            assignedRepId ? { representativeId: assignedRepId } : null,
          ),
      },
    };
  }

  it('rejects a representative not assigned to the ticket', async () => {
    const service = makeService(nextHearingPrisma('rep-OWNER'));
    await expect(
      service.recordNextHearing(
        'ticket-1',
        { scheduledDate: '2026-07-01' },
        { actorUserId: 'rep-INTRUDER', actorRole: 'representative' },
      ),
    ).rejects.toThrow(/assigned representative/i);
  });

  it('allows the assigned representative', async () => {
    const prisma = nextHearingPrisma('rep-OWNER');
    const service = makeService(prisma);
    await expect(
      service.recordNextHearing(
        'ticket-1',
        { scheduledDate: '2026-07-01' },
        { actorUserId: 'rep-OWNER', actorRole: 'representative' },
      ),
    ).resolves.toBeDefined();
    expect((prisma.ticket as { update: jest.Mock }).update).toHaveBeenCalled();
  });
});
