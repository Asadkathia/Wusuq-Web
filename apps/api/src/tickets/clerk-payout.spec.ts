import { jest } from '@jest/globals';
import { computeClerkEarningsBreakdown } from '@wusuq/shared';
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

async function captureSubmitData(
  updateMany: jest.Mock,
  dtoOverrides: Record<string, unknown>,
) {
  const { tx, prisma } = submitClerkPrisma();
  tx.ticket.updateMany = updateMany as never;
  const service = makeService(prisma);
  await service.submitClerkCosts('ticket-1', dtoOverrides as never, {
    actorUserId: 'rep-1',
    actorRole: 'representative',
  });
  const call = updateMany.mock.calls[0][0] as {
    data: Record<string, unknown>;
  };
  return call.data;
}

function redactForConsumer(ticket: Record<string, unknown>) {
  const service = makeService({});
  return (service as any).redactTicketForConsumer(ticket);
}

function redactForRepresentative(ticket: Record<string, unknown>) {
  const service = makeService({});
  return (service as any).redactTicketForRepresentative(ticket);
}

describe('clerk payout write boundary', () => {
  it('submitClerkCosts persists the clerk set alongside the working columns', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const data = await captureSubmitData(updateMany, {
      nonAttestedPages: 50,
      nonAttestedCostPerPage: 5,
      deliveryCharges: 200,
    });
    expect(data.nonAttestedCharges).toBe(250);
    expect(data.clerkNonAttestedCharges).toBe(250);
    expect(data.clerkDeliveryCharges).toBe(200);
  });

  it('an admin markup after submit does not raise clerk pay', () => {
    // Simulates post-finalize state: final columns marked up, clerk set intact.
    const b = computeClerkEarningsBreakdown({
      clerkCost: 400,
      nonAttestedCharges: 500, // admin's finalized value
      clerkNonAttestedCharges: 250, // clerk's submission, untouched
      deliveryCharges: 200,
      clerkDeliveryCharges: 200,
    });
    expect(b.total).toBe(850);
  });
});

describe('clerk-set redaction', () => {
  const CLERK_KEYS = [
    'clerkAttestedCharges',
    'clerkNonAttestedCharges',
    'clerkPrintingCharges',
    'clerkDeliveryCharges',
  ] as const;

  it('strips the clerk set for consumers', () => {
    const out = redactForConsumer({
      status: 'COMPLETED',
      clerkAttestedCharges: 100,
      clerkNonAttestedCharges: 250,
      clerkPrintingCharges: 0,
      clerkDeliveryCharges: 200,
    });
    for (const k of CLERK_KEYS) expect(out).not.toHaveProperty(k);
  });

  it('KEEPS the clerk set for representatives — a clerk sees their own figures', () => {
    const out = redactForRepresentative({
      clerkNonAttestedCharges: 250,
      clerkDeliveryCharges: 200,
    });
    expect(out.clerkNonAttestedCharges).toBe(250);
    expect(out.clerkDeliveryCharges).toBe(200);
  });
});
