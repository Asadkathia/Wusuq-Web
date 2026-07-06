import { jest } from '@jest/globals';
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

function submitClerkPrisma(overrides: Record<string, unknown> = {}) {
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
          serviceCost: 800,
          totalAmount: 800,
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
          ...overrides,
        }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'ticket-1', consumerId: 'c1' }),
      },
      assignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'asg',
          representativeId: 'rep-1',
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

describe('submitClerkCosts — does not move the consumer total (B4)', () => {
  it('persists phase-2 charges + advances to WAITING_APPROVAL but leaves totalAmount unchanged', async () => {
    const { tx, prisma } = submitClerkPrisma({
      status: 'IN_PROGRESS',
      serviceCost: 800,
      totalAmount: 800,
    });
    const service = makeService(prisma);
    await service.submitClerkCosts(
      'ticket-1',
      {
        deliveryCharges: 300,
        printingCharges: 50,
        noOfPages: 10,
        costPerPage: 5,
      } as never,
      { actorUserId: 'rep-1', actorRole: 'representative' },
    );
    const data = (tx.ticket.updateMany as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.data.status).toBe('WAITING_APPROVAL');
    expect(data.data.clerkApprovalStatus).toBe('SUBMITTED');
    expect(data.data.deliveryCharges).toBe(300);
    expect(data.data.printingCharges).toBe(50);
    expect(data.data.noOfPages).toBe(10);
    expect(data.data.costPerPage).toBe(5);
    expect('totalAmount' in data.data).toBe(false);
  });
});
