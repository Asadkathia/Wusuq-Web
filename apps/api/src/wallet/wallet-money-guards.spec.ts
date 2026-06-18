import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';

function makeDispatcher() {
  return {
    walletTopupCreated: jest.fn().mockResolvedValue(undefined),
    walletTopupDecided: jest.fn().mockResolvedValue(undefined),
    paymentSubmitted: jest.fn().mockResolvedValue(undefined),
    paymentDecided: jest.fn().mockResolvedValue(undefined),
    ticketPaid: jest.fn().mockResolvedValue(undefined),
  };
}

// Audit 1.1: rejectTopup had no status guard — a VERIFIED (already credited
// and possibly spent) top-up could be flipped to REJECTED with the money
// still applied. It must mirror verifyTopup: lock + conditional update,
// alreadyProcessed result when the row is no longer PENDING_VERIFICATION.
describe('WalletService.rejectTopup status guard (audit 1.1)', () => {
  function buildHarness(lockedTransaction: Record<string, unknown>) {
    const updateMany = jest.fn().mockResolvedValue({
      count: lockedTransaction.status === 'PENDING_VERIFICATION' ? 1 : 0,
    });
    const tx = {
      $executeRaw: jest.fn(),
      walletTransaction: {
        findUnique: jest.fn().mockResolvedValue(lockedTransaction),
        findUniqueOrThrow: jest.fn().mockResolvedValue(lockedTransaction),
        updateMany,
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    const dispatcher = makeDispatcher();
    const service = new WalletService(
      prisma as never,
      auditLogsService as never,
      dispatcher as never,
    );
    return { service, tx, updateMany, auditLogsService, dispatcher };
  }

  it('reject after verify → alreadyProcessed, row untouched, no audit row', async () => {
    const { service, updateMany, auditLogsService, dispatcher } = buildHarness({
      id: 'wtx-1',
      userId: 'u-1',
      amount: 1000,
      status: 'VERIFIED',
      type: 'TOPUP',
    });

    const result = (await service.rejectTopup('wtx-1', {})) as {
      alreadyProcessed?: boolean;
      transaction: { status: string };
    };

    expect(result.alreadyProcessed).toBe(true);
    expect(result.transaction.status).toBe('VERIFIED');
    // The conditional update never matched (or was never attempted) — either
    // way the row must not have been mutated unconditionally.
    for (const call of updateMany.mock.calls) {
      expect((call[0] as { where: { status: string } }).where).toMatchObject({
        status: 'PENDING_VERIFICATION',
      });
    }
    expect(auditLogsService.create).not.toHaveBeenCalled();
    expect(dispatcher.walletTopupDecided).not.toHaveBeenCalled();
  });

  it('rejects a PENDING_VERIFICATION top-up via a conditional update', async () => {
    const { service, updateMany, auditLogsService } = buildHarness({
      id: 'wtx-2',
      userId: 'u-1',
      amount: 1000,
      status: 'PENDING_VERIFICATION',
      type: 'TOPUP',
    });

    const result = (await service.rejectTopup('wtx-2', {
      note: 'fake receipt',
    })) as { alreadyProcessed?: boolean };

    expect(result.alreadyProcessed ?? false).toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'wtx-2',
          status: 'PENDING_VERIFICATION',
        }),
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
    expect(auditLogsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'WALLET_TOPUP_REJECTED' }),
    );
  });
});

// Audit 1.7: adjustWallet could store a negative walletBalance, violating the
// documented "credit >= 0" invariant. The user row must be locked and the
// resulting balance validated before the increment is applied.
describe('WalletService.adjustWallet negative floor (audit 1.7)', () => {
  it('rejects an adjustment that would take the balance below zero', async () => {
    const userUpdate = jest.fn();
    const tx = {
      $executeRaw: jest.fn(),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u-1', walletBalance: 2000 }),
        update: userUpdate,
      },
      walletTransaction: { create: jest.fn() },
      ticket: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const auditLogsService = { create: jest.fn() };
    const service = new WalletService(
      prisma as never,
      auditLogsService as never,
      makeDispatcher() as never,
    );

    await expect(
      service.adjustWallet('u-1', -5000, 'oops', 'admin-1'),
    ).rejects.toThrow(BadRequestException);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(auditLogsService.create).not.toHaveBeenCalled();
  });

  it('allows a negative adjustment that keeps the balance at zero or above', async () => {
    const userUpdate = jest
      .fn()
      .mockResolvedValue({ id: 'u-1', walletBalance: 0 });
    const tx = {
      $executeRaw: jest.fn(),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u-1', walletBalance: 2000 }),
        update: userUpdate,
      },
      walletTransaction: { create: jest.fn().mockResolvedValue({ id: 'w' }) },
      ticket: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const service = new WalletService(
      prisma as never,
      { create: jest.fn() } as never,
      makeDispatcher() as never,
    );

    await service.adjustWallet('u-1', -2000, 'refund correction', 'admin-1');

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { walletBalance: { increment: -2000 } },
      }),
    );
  });
});
