import { jest } from '@jest/globals';
import { FinanceService } from './finance.service';

describe('FinanceService.reconcilePayment — receiptUrl', () => {
  it('persists receiptUrl on the WalletTransaction when provided', async () => {
    let capturedCreateData: Record<string, unknown> | null = null;

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'ticket-1' }]),
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          consumerId: 'user-1',
          totalAmount: 500,
          amountPaid: 0,
          serviceCost: 500,
          status: 'UNPAID',
        }),
        update: jest
          .fn()
          .mockImplementation((args) =>
            Promise.resolve({ ...args.data, id: 'ticket-1' }),
          ),
      },
      walletTransaction: {
        create: jest.fn().mockImplementation((args) => {
          capturedCreateData = args.data as Record<string, unknown>;
          return Promise.resolve({ id: 'txn-1', ...args.data });
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (cb: (tx: typeof tx) => Promise<unknown>) =>
        cb(tx),
      ),
    };

    const auditLogsService = { create: jest.fn().mockResolvedValue(undefined) };

    const service = new FinanceService(
      prisma as never,
      auditLogsService as never,
    );

    await service.reconcilePayment('ticket-1', {
      amount: 200,
      paymentMode: 'BANK_TRANSFER',
      receiptUrl: '/uploads/wallet-receipts/x.png',
    });

    expect(capturedCreateData).not.toBeNull();
    expect((capturedCreateData as Record<string, unknown>).receiptUrl).toBe(
      '/uploads/wallet-receipts/x.png',
    );
  });

  it('sets receiptUrl to null when not provided', async () => {
    let capturedCreateData: Record<string, unknown> | null = null;

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'ticket-2' }]),
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-2',
          consumerId: 'user-2',
          totalAmount: 300,
          amountPaid: 0,
          serviceCost: 300,
          status: 'UNPAID',
        }),
        update: jest
          .fn()
          .mockImplementation((args) =>
            Promise.resolve({ ...args.data, id: 'ticket-2' }),
          ),
      },
      walletTransaction: {
        create: jest.fn().mockImplementation((args) => {
          capturedCreateData = args.data as Record<string, unknown>;
          return Promise.resolve({ id: 'txn-2', ...args.data });
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (cb: (tx: typeof tx) => Promise<unknown>) =>
        cb(tx),
      ),
    };

    const auditLogsService = { create: jest.fn().mockResolvedValue(undefined) };

    const service = new FinanceService(
      prisma as never,
      auditLogsService as never,
    );

    await service.reconcilePayment('ticket-2', {
      amount: 150,
      paymentMode: 'CASH',
    });

    expect(capturedCreateData).not.toBeNull();
    expect(
      (capturedCreateData as Record<string, unknown>).receiptUrl,
    ).toBeNull();
  });
});
