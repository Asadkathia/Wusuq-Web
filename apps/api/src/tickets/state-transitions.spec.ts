import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
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

const STAFF = { actorUserId: 'admin-1', actorRole: 'staff-admin' };

function baseTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tkt-1',
    batchNo: 'TKT-1',
    consumerId: 'c-1',
    status: 'WAITING_APPROVAL',
    clerkApprovalStatus: 'SUBMITTED',
    deliveryStatus: 'PENDING',
    intakeFlow: 'judicial_case_information',
    serviceCost: 1000,
    clerkCost: 0,
    attestedCharges: 0,
    nonAttestedCharges: 0,
    printingCharges: 0,
    deliveryCharges: 0,
    additionalCharges: 0,
    additionalServiceCost: 0,
    discountPrice: 0,
    totalAmount: 1000,
    amountPaid: 1000,
    remainderFinalizedAt: null,
    dispatchProofUrl: null,
    trackingNo: null,
    caseId: null,
    consumer: { id: 'c-1', name: 'C', phone: null, email: null },
    service: { id: 'svc-1', name: 'Svc' },
    documents: [],
    assignments: [],
    history: [],
    clerkReport: null,
    ...overrides,
  };
}

function buildHarness(opts: {
  ticket?: Record<string, unknown>;
  updateManyCount?: number;
}) {
  const ticket = baseTicket(opts.ticket ?? {});
  const updateMany = jest
    .fn()
    .mockResolvedValue({ count: opts.updateManyCount ?? 1 });
  const prisma: Record<string, any> = {
    $executeRaw: jest.fn(),
    ticket: {
      findUnique: jest.fn().mockResolvedValue(ticket),
      findUniqueOrThrow: jest.fn().mockResolvedValue(ticket),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(ticket),
      updateMany,
    },
    ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    ticketDocument: { findMany: jest.fn().mockResolvedValue([]) },
    caseEvent: { create: jest.fn().mockResolvedValue({}) },
    assignment: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'asg-1',
        representativeId: 'rep-1',
        status: 'ACTIVE',
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'rep-1',
        role: 'representative',
        isActive: true,
        city: null,
        courtCity: null,
      }),
    },
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  const service = new TicketsService(
    prisma as never,
    { create: jest.fn().mockResolvedValue({}) } as never,
    { resolve: jest.fn() } as never,
    { resolveProvinceByCity: jest.fn() } as never,
    makeDispatcher() as never,
    { settleTicketsForUser: jest.fn().mockResolvedValue(undefined) } as never,
  );
  return { service, prisma, updateMany };
}

// Audit 2.1: every ticket transition was an unguarded read-then-write — two
// concurrent admin actions both passed validation and the last write won,
// producing contradictory states. Transitions must be conditional updateMany
// on the expected `from` status, with count 0 → 409.
describe('conditional ticket transitions (audit 2.1)', () => {
  it('updateStatus 409s when the ticket left the expected status concurrently', async () => {
    const { service } = buildHarness({
      ticket: { status: 'COMPLETED', deliveryStatus: 'DISPATCHED' },
      updateManyCount: 0,
    });
    await expect(
      service.updateStatus('tkt-1', 'DELIVERED', undefined, STAFF),
    ).rejects.toThrow(ConflictException);
  });

  it('sendBackToClerk 409s when it loses the race', async () => {
    const { service } = buildHarness({ updateManyCount: 0 });
    await expect(
      service.sendBackToClerk('tkt-1', 'redo', STAFF),
    ).rejects.toThrow(ConflictException);
  });

  it('reviewAndComplete 409s when the complete step loses the race', async () => {
    const { service } = buildHarness({ updateManyCount: 0 });
    await expect(
      service.reviewAndComplete('tkt-1', {} as never, STAFF),
    ).rejects.toThrow(ConflictException);
  });

  it('dispatchDelivery 409s when the ticket is already dispatched', async () => {
    const { service } = buildHarness({
      ticket: {
        status: 'COMPLETED',
        intakeFlow: 'judicial_case_files',
        deliveryStatus: 'PENDING', // stale read — concurrent dispatch won
      },
      updateManyCount: 0,
    });
    await expect(
      service.dispatchDelivery('tkt-1', { trackingNo: 'T' }, STAFF),
    ).rejects.toThrow(ConflictException);
  });

  it('acceptAssignment 409s when the ticket is no longer ASSIGNED', async () => {
    const { service } = buildHarness({
      ticket: { status: 'ASSIGNED' },
      updateManyCount: 0,
    });
    await expect(
      service.acceptAssignment('tkt-1', { actorUserId: 'rep-1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejectAssignment 409s when the ticket is no longer ASSIGNED', async () => {
    const { service } = buildHarness({
      ticket: { status: 'ASSIGNED' },
      updateManyCount: 0,
    });
    await expect(
      service.rejectAssignment('tkt-1', 'cannot do it', STAFF),
    ).rejects.toThrow(ConflictException);
  });

  it('submitClerkCosts 409s when it loses the race', async () => {
    const { service } = buildHarness({
      ticket: { status: 'IN_PROGRESS', intakeFlow: 'judicial_case_files' },
      updateManyCount: 0,
    });
    await expect(
      service.submitClerkCosts('tkt-1', { deliveryCharges: 10 }, STAFF),
    ).rejects.toThrow(ConflictException);
  });

  it('assign 409s when the ticket leaves PAID concurrently', async () => {
    const { service } = buildHarness({
      ticket: { status: 'PAID', serviceCity: null },
      updateManyCount: 0,
    });
    await expect(
      service.assign('tkt-1', { representativeId: 'rep-1' }, STAFF),
    ).rejects.toThrow(ConflictException);
  });

  it('submitClerkReceipt 409s when the ticket is not accepting a receipt', async () => {
    const { service } = buildHarness({
      ticket: { status: 'COMPLETED' },
      updateManyCount: 0,
    });
    await expect(
      service.submitClerkReceipt('tkt-1', '/r.jpg', STAFF),
    ).rejects.toThrow(ConflictException);
  });
});

// Audit 2.2: overrideStatus bypassed every DELIVERED gate — an override to
// DELIVERED on an unpaid/undispatched ticket also silently erased the
// consumer's outstanding due from the wallet net balance.
describe('overrideStatus DELIVERED gates (audit 2.2)', () => {
  it('rejects override to DELIVERED when not fully paid', async () => {
    const { service } = buildHarness({
      ticket: { status: 'COMPLETED', totalAmount: 1000, amountPaid: 200 },
    });
    await expect(
      service.overrideStatus('tkt-1', 'DELIVERED', STAFF),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects override to DELIVERED on an undispatched physical ticket', async () => {
    const { service } = buildHarness({
      ticket: {
        status: 'COMPLETED',
        intakeFlow: 'judicial_case_files',
        deliveryStatus: 'PENDING',
      },
    });
    await expect(
      service.overrideStatus('tkt-1', 'DELIVERED', STAFF),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows override to DELIVERED when paid and dispatched', async () => {
    const { service, updateMany } = buildHarness({
      ticket: {
        status: 'COMPLETED',
        intakeFlow: 'judicial_case_files',
        deliveryStatus: 'DISPATCHED',
      },
    });
    await service.overrideStatus('tkt-1', 'DELIVERED', STAFF);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'tkt-1' }),
        data: expect.objectContaining({ status: 'DELIVERED' }),
      }),
    );
  });

  it('super-admin may bypass the DELIVERED gates explicitly', async () => {
    // Owner decision 2026-06-12: the escape hatch is super-admin-only; every
    // other staff role keeps the money/dispatch gates.
    const { service, updateMany } = buildHarness({
      ticket: {
        status: 'COMPLETED',
        intakeFlow: 'judicial_case_files',
        deliveryStatus: 'PENDING',
        totalAmount: 1000,
        amountPaid: 0,
      },
    });
    await service.overrideStatus('tkt-1', 'DELIVERED', {
      actorUserId: 'root-1',
      actorRole: 'super-admin',
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED' }),
      }),
    );
  });

  it('override is itself conditional — 409 when the row moved', async () => {
    const { service } = buildHarness({
      ticket: { status: 'PAID' },
      updateManyCount: 0,
    });
    await expect(
      service.overrideStatus('tkt-1', 'IN_PROGRESS', STAFF),
    ).rejects.toThrow(ConflictException);
  });
});
