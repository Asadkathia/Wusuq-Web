import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';

// Batch-9 Task 5 (§6.3): the representative had no way to correct a typo
// after "Update Payments" moved the ticket to WAITING_APPROVAL — the FE
// double-gated the button out (status === 'IN_PROGRESS' AND
// !hasSubmittedClerkCosts). The backend already accepted a WAITING_APPROVAL
// resubmit (see the status check in submitClerkCosts); this file proves that
// end-to-end: a second submit from WAITING_APPROVAL succeeds, transitions
// WAITING_APPROVAL -> WAITING_APPROVAL idempotently, and REWRITES the
// clerk*Charges snapshot columns to the representative's corrected figures
// (that is the point — it's their own declared value being corrected, not
// an admin markup; must not be routed through saveClerkCharges).

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
    ticketEdited: jest.fn(async () => undefined),
    ticketRegenerated: jest.fn().mockResolvedValue(undefined),
    ticketDispatched: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
    caseDriftDetected: jest.fn().mockResolvedValue(undefined),
  };
}

function makeTicketsService(ticketOverrides: Record<string, unknown> = {}) {
  const tx = {
    ticket: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  const ticket = {
    id: 'ticket-1',
    // Already moved to WAITING_APPROVAL by a FIRST submitClerkCosts call.
    status: 'WAITING_APPROVAL',
    serviceCost: 800,
    totalAmount: 800,
    deliveryCharges: 300,
    printingCharges: 0,
    attestedCharges: 500,
    nonAttestedCharges: 0,
    additionalCharges: 0,
    additionalServiceCost: 0,
    discountPrice: 0,
    noOfPages: null,
    costPerPage: null,
    attestedPages: 10,
    attestedCostPerPage: 50,
    nonAttestedPages: null,
    nonAttestedCostPerPage: null,
    dispatchProofUrl: null,
    trackingNo: null,
    remainderFinalizedAt: null,
    // First submission's snapshot — this is what a typo-correcting resubmit
    // must overwrite.
    clerkAttestedCharges: 500,
    clerkNonAttestedCharges: 0,
    clerkPrintingCharges: 0,
    clerkDeliveryCharges: 300,
    intakeFlow: 'judicial_case_files',
    ...ticketOverrides,
  };
  const prisma = {
    ticket: {
      findUnique: jest.fn().mockResolvedValue(ticket),
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
  };
  const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
  const service = new TicketsService(
    prisma as never,
    auditLogsService as never,
    { resolve: jest.fn() } as never,
    { resolveProvinceByCity: jest.fn() } as never,
    makeDispatcher() as never,
    { settleTicketsForUser: jest.fn().mockResolvedValue(undefined) } as never,
  );
  return {
    service,
    prisma,
    tx,
    updateSpy: tx.ticket.updateMany,
  };
}

function repActor() {
  return { actorUserId: 'rep-1', actorRole: 'representative' };
}

describe('submitClerkCosts — resubmission from WAITING_APPROVAL (§6.3)', () => {
  it('a second submit from WAITING_APPROVAL succeeds (no BadRequestException)', async () => {
    const { service } = makeTicketsService();
    await expect(
      service.submitClerkCosts(
        'ticket-1',
        {
          attestedPages: 12,
          attestedCostPerPage: 60,
        } as never,
        repActor(),
      ),
    ).resolves.toBeDefined();
  });

  it('transitions WAITING_APPROVAL -> WAITING_APPROVAL idempotently (conditional updateMany, audit-2.1 discipline)', async () => {
    const { service, updateSpy } = makeTicketsService();
    await service.submitClerkCosts(
      'ticket-1',
      { attestedPages: 12, attestedCostPerPage: 60 } as never,
      repActor(),
    );
    const call = updateSpy.mock.calls.at(-1) as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ];
    expect(call[0].where.status).toBe('WAITING_APPROVAL');
    expect(call[0].data.status).toBe('WAITING_APPROVAL');
  });

  it('rewrites the clerk*Charges snapshot columns to the corrected figures', async () => {
    const { service, updateSpy } = makeTicketsService();
    await service.submitClerkCosts(
      'ticket-1',
      {
        // Correcting a typo: attested was submitted as 10x50=500, the rep
        // meant 12x60=720. Delivery corrected from 300 to 250.
        attestedPages: 12,
        attestedCostPerPage: 60,
        deliveryCharges: 250,
      } as never,
      repActor(),
    );
    const data = (
      updateSpy.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(Number(data.attestedCharges)).toBe(720);
    expect(Number(data.clerkAttestedCharges)).toBe(720);
    expect(Number(data.deliveryCharges)).toBe(250);
    expect(Number(data.clerkDeliveryCharges)).toBe(250);
  });

  it('still rejects a resubmit once the remainder has been finalized (post-finalize edit stays blocked)', async () => {
    const { service } = makeTicketsService({
      remainderFinalizedAt: new Date('2026-09-20T00:00:00Z'),
    });
    await expect(
      service.submitClerkCosts(
        'ticket-1',
        { attestedPages: 12, attestedCostPerPage: 60 } as never,
        repActor(),
      ),
    ).rejects.toThrow(/finalized/i);
  });
});
