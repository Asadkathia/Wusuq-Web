import { jest } from '@jest/globals';
import { BadRequestException, ConflictException } from '@nestjs/common';
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

// Audit 1.5: finalizeRemainder used `dto.x ?? 0` (an empty admin body zeroed
// the clerk's persisted charges and silently lowered totalAmount), had no
// total >= amountPaid guard (no refund path exists — surplus was kept), no
// status precondition on the direct endpoint, and no transaction/lock.
describe('finalizeRemainder guards (audit 1.5)', () => {
  function buildHarness(ticketOverrides: Record<string, unknown> = {}) {
    const ticket = {
      id: 'tkt-1',
      consumerId: 'c-1',
      status: 'WAITING_APPROVAL',
      deliveryStatus: 'PENDING',
      intakeFlow: 'judicial_case_files',
      serviceCost: 3000,
      clerkCost: 0,
      attestedCharges: 400,
      nonAttestedCharges: 0,
      printingCharges: 150,
      deliveryCharges: 250,
      additionalCharges: 0,
      additionalServiceCost: 0,
      discountPrice: 0,
      amountPaid: 3000,
      remainderFinalizedAt: null,
      ...ticketOverrides,
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const userUpdate = jest.fn().mockResolvedValue({ id: 'c-1' });
    const walletTxnCreate = jest.fn().mockResolvedValue({ id: 'wtx-1' });
    const prisma: Record<string, unknown> = {
      $executeRaw: jest.fn(),
      ticket: {
        findUnique: jest.fn().mockResolvedValue(ticket),
        update: jest.fn().mockResolvedValue(ticket),
        updateMany,
      },
      user: { update: userUpdate },
      walletTransaction: { create: walletTxnCreate },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
      assignment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const wallet = {
      settleTicketsForUser: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TicketsService(
      prisma as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      { resolve: jest.fn() } as never,
      { resolveProvinceByCity: jest.fn() } as never,
      makeDispatcher() as never,
      wallet as never,
    );
    // findOne (the return value) re-reads the ticket with includes — give it
    // the same row.
    return {
      service,
      prisma,
      updateMany,
      ticket,
      wallet,
      userUpdate,
      walletTxnCreate,
    };
  }

  const actor = { actorUserId: 'admin-1', actorEmail: 'a@x.com' };

  it('an empty body preserves the clerk-entered persisted charges', async () => {
    const { service, updateMany } = buildHarness();

    await service.finalizeRemainder('tkt-1', {}, actor);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'tkt-1',
          remainderFinalizedAt: null,
        }),
        data: expect.objectContaining({
          attestedCharges: 400,
          nonAttestedCharges: 0,
          printingCharges: 150,
          deliveryCharges: 250,
          // 3,000 base + 400 + 150 + 250
          totalAmount: 3800,
        }),
      }),
    );
  });

  it('explicit dto values still override the persisted charges', async () => {
    const { service, updateMany } = buildHarness();

    await service.finalizeRemainder(
      'tkt-1',
      { attestedCharges: 1000, deliveryCharges: 0 },
      actor,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attestedCharges: 1000,
          deliveryCharges: 0,
          printingCharges: 150,
          totalAmount: 3000 + 1000 + 150,
        }),
      }),
    );
  });

  it('double-finalize is rejected with a conflict', async () => {
    const { service, updateMany } = buildHarness({
      remainderFinalizedAt: new Date('2026-06-01'),
    });

    await expect(service.finalizeRemainder('tkt-1', {}, actor)).rejects.toThrow(
      ConflictException,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('a concurrent finalize losing the conditional update is rejected', async () => {
    const { service, updateMany } = buildHarness();
    updateMany.mockResolvedValue({ count: 0 });

    await expect(service.finalizeRemainder('tkt-1', {}, actor)).rejects.toThrow(
      ConflictException,
    );
  });

  it('auto-credits the surplus to the wallet when the total drops below amountPaid', async () => {
    // Owner decision 2026-06-12: instead of blocking review, the
    // over-collected amount goes back to the consumer's wallet as a recorded
    // ADMIN_ADJUSTMENT and the ticket finalizes exactly fully paid.
    const { service, updateMany, userUpdate, walletTxnCreate } = buildHarness({
      amountPaid: 5000,
    });

    await service.finalizeRemainder(
      'tkt-1',
      {
        attestedCharges: 0,
        nonAttestedCharges: 0,
        printingCharges: 0,
        deliveryCharges: 0,
      },
      actor,
    );

    // New total = base 3,000; surplus = 5,000 − 3,000 = 2,000.
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c-1' },
        data: { walletBalance: { increment: 2000 } },
      }),
    );
    expect(walletTxnCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'c-1',
          ticketId: 'tkt-1',
          amount: 2000,
          type: 'ADMIN_ADJUSTMENT',
          status: 'VERIFIED',
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 3000,
          // amountPaid steps down to the new total — the surplus now lives in
          // the wallet, not on the ticket.
          amountPaid: 3000,
        }),
      }),
    );
  });

  it('does not touch the wallet when the total stays at or above amountPaid', async () => {
    const { service, userUpdate, walletTxnCreate } = buildHarness();

    await service.finalizeRemainder('tkt-1', {}, actor);

    expect(userUpdate).not.toHaveBeenCalled();
    expect(walletTxnCreate).not.toHaveBeenCalled();
  });

  it('rejects finalize before the ticket reaches the review queue', async () => {
    const { service } = buildHarness({ status: 'IN_PROGRESS' });

    await expect(service.finalizeRemainder('tkt-1', {}, actor)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('still allows finalize on a COMPLETED, not-yet-dispatched ticket (direct endpoint)', async () => {
    const { service, updateMany } = buildHarness({
      status: 'COMPLETED',
      deliveryStatus: 'PENDING',
    });

    await service.finalizeRemainder('tkt-1', {}, actor);
    expect(updateMany).toHaveBeenCalled();
  });
});
