import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';

function makeDispatcher() {
  return {
    walletTopupCreated: jest.fn().mockResolvedValue(undefined),
    walletTopupDecided: jest.fn().mockResolvedValue(undefined),
    walletReceiptUploaded: jest.fn().mockResolvedValue(undefined),
    paymentSubmitted: jest.fn().mockResolvedValue(undefined),
    paymentDecided: jest.fn().mockResolvedValue(undefined),
  };
}

function buildService(overrides: Record<string, unknown> = {}) {
  const auditLogsService = { create: jest.fn() };

  // Defaults — individual tests override the bits they need.
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u-1', isActive: true }),
      ...((overrides.user as object) ?? {}),
    },
    walletTransaction: {
      create: jest.fn().mockResolvedValue({ id: 'wtx-1' }),
      findUnique: jest.fn(),
      ...((overrides.walletTransaction as object) ?? {}),
    },
    $transaction: jest.fn(),
  };

  const dispatcher = makeDispatcher();
  const service = new WalletService(
    prisma as never,
    auditLogsService as never,
    dispatcher as never,
  );
  return { service, prisma, auditLogsService, dispatcher };
}

describe('WalletService.topup', () => {
  it('rejects when user does not exist', async () => {
    const { service, prisma } = buildService({
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.topup({
        userId: 'missing',
        amount: 100,
        paymentMode: 'BANK_TRANSFER',
        currency: 'PKR',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects when user is inactive', async () => {
    const { service } = buildService({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u-1', isActive: false }),
      },
    });

    await expect(
      service.topup({
        userId: 'u-1',
        amount: 100,
        paymentMode: 'BANK_TRANSFER',
        currency: 'PKR',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when no userId resolved', async () => {
    const { service } = buildService();
    await expect(
      service.topup({
        amount: 100,
        paymentMode: 'BANK_TRANSFER',
        currency: 'PKR',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WalletService.verifyTopup double-credit guard', () => {
  it('returns alreadyProcessed and skips credit when conditional update affects 0 rows', async () => {
    const userUpdate = jest.fn();
    const walletTransactionCreate = jest.fn();

    const tx = {
      $executeRaw: jest.fn(),
      walletTransaction: {
        // Lock-time read sees PENDING — race not yet observable.
        findUnique: jest.fn().mockResolvedValue({
          id: 'wtx-1',
          userId: 'u-1',
          amount: 100,
          paymentMode: 'BANK_TRANSFER',
          status: 'PENDING_VERIFICATION',
        }),
        // But by the time we attempt to flip the row another caller already
        // verified it — the conditional updateMany matches 0 rows.
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'wtx-1',
          userId: 'u-1',
          status: 'VERIFIED',
        }),
      },
      user: { update: userUpdate },
      ticket: { findMany: jest.fn(), update: jest.fn() },
    };

    const prisma: any = {
      $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)),
    };
    const auditLogsService = { create: jest.fn() };
    const service = new WalletService(
      prisma as never,
      auditLogsService as never,
      makeDispatcher() as never,
    );

    const result: any = await service.verifyTopup('wtx-1', {});

    expect(result.alreadyProcessed).toBe(true);
    // Crucially, no credit / settlement / audit side-effects occurred.
    expect(userUpdate).not.toHaveBeenCalled();
    expect(walletTransactionCreate).not.toHaveBeenCalled();
    expect(auditLogsService.create).not.toHaveBeenCalled();
  });
});

// ─── Task 1.5: adjustWallet ───────────────────────────────────────────────────

describe('WalletService.adjustWallet (Task 1.5)', () => {
  it('increments walletBalance, writes ADMIN_ADJUSTMENT transaction, and settles tickets on positive amount', async () => {
    const ticketFindMany = jest.fn().mockResolvedValue([]);
    const userUpdate = jest
      .fn()
      .mockResolvedValueOnce({ id: 'u-1', walletBalance: 1500 }) // after increment
      .mockResolvedValue({ id: 'u-1', walletBalance: 1500 }); // after settlement balance write-back
    const walletTransactionCreate = jest
      .fn()
      .mockResolvedValue({ id: 'wtx-adj' });

    const tx: any = {
      $executeRaw: jest.fn(),
      user: {
        update: userUpdate,
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u-1', walletBalance: 500 }),
      },
      walletTransaction: { create: walletTransactionCreate },
      ticket: {
        findMany: ticketFindMany,
        findUnique: jest.fn().mockResolvedValue({
          id: 't-1',
          batchNo: 'B-1',
          totalAmount: 0,
          amountPaid: 0,
          serviceCost: 0,
          status: 'UNPAID',
        }),
        update: jest.fn(),
      },
    };

    const prisma: any = {
      $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)),
    };

    const auditLogsService = { create: jest.fn() };
    const service = new WalletService(
      prisma as never,
      auditLogsService as never,
      makeDispatcher() as never,
    );

    await service.adjustWallet('u-1', 1000, 'Admin credit', 'admin-1');

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: { walletBalance: { increment: 1000 } },
      }),
    );
    expect(walletTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u-1',
          amount: 1000,
          status: 'VERIFIED',
          type: 'ADMIN_ADJUSTMENT',
          note: 'Admin credit',
          reviewedByUserId: 'admin-1',
        }),
      }),
    );
    // Positive amount triggers settlement
    expect(ticketFindMany).toHaveBeenCalled();
  });

  it('decrements walletBalance and does NOT settle on negative adjustment', async () => {
    const ticketFindMany = jest.fn().mockResolvedValue([]);
    const userUpdate = jest
      .fn()
      .mockResolvedValueOnce({ id: 'u-1', walletBalance: 200 });
    const walletTransactionCreate = jest
      .fn()
      .mockResolvedValue({ id: 'wtx-adj' });

    const tx: any = {
      $executeRaw: jest.fn(),
      user: {
        update: userUpdate,
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u-1', walletBalance: 500 }),
      },
      walletTransaction: { create: walletTransactionCreate },
      ticket: { findMany: ticketFindMany },
    };

    const prisma: any = {
      $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)),
    };

    const service = new WalletService(
      prisma as never,
      { create: jest.fn() } as never,
      makeDispatcher() as never,
    );

    await service.adjustWallet('u-1', -300, 'Admin debit', 'admin-1');

    expect(walletTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: -300,
          type: 'ADMIN_ADJUSTMENT',
        }),
      }),
    );
    // Negative amount must NOT trigger clearPendingTickets
    expect(ticketFindMany).not.toHaveBeenCalled();
  });
});

describe('WalletService.applyPaymentToTicket type tagging (Task 1.5)', () => {
  it('tags auto-deduction debit entries with type TICKET_DEBIT', async () => {
    const walletTransactionCreate = jest.fn().mockResolvedValue({});
    const tx: any = {
      $executeRaw: jest.fn(),
      ticket: {
        findMany: jest.fn().mockResolvedValue([{ id: 't-1' }]),
        findUnique: jest.fn().mockResolvedValue({
          id: 't-1',
          batchNo: 'B-1',
          totalAmount: 500,
          amountPaid: 0,
          serviceCost: 500,
          status: 'UNPAID',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      walletTransaction: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wtx-1',
          userId: 'u-1',
          amount: 500,
          paymentMode: 'BANK_TRANSFER',
          status: 'PENDING_VERIFICATION',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'wtx-1', status: 'VERIFIED' }),
        create: walletTransactionCreate,
      },
      user: {
        update: jest
          .fn()
          .mockResolvedValueOnce({ id: 'u-1', walletBalance: 500 })
          .mockResolvedValue({}),
      },
    };

    const prisma: any = {
      $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)),
    };

    const service = new WalletService(
      prisma as never,
      { create: jest.fn() } as never,
      makeDispatcher() as never,
    );

    await service.verifyTopup('wtx-1', {});

    // The wallet transaction created for the auto-deduction should be TICKET_DEBIT
    const debitCall = walletTransactionCreate.mock.calls[0]?.[0];
    expect(debitCall?.data?.type).toBe('TICKET_DEBIT');
  });
});

describe('WalletService.verifyTopup auto-deduction', () => {
  function runVerify(opts: {
    paymentMode?: string;
    tickets: Array<{
      id: string;
      batchNo: string;
      totalAmount: number;
      amountPaid: number;
      serviceCost?: number;
    }>;
    initialBalance: number;
  }) {
    // After lock, re-read each ticket from a stable map keyed by id so the
    // service's `findUnique` returns the current state of the test fixture.
    const ticketState = new Map(
      opts.tickets.map((t) => [
        t.id,
        {
          ...t,
          status: 'UNPAID' as const,
          serviceCost: t.serviceCost ?? t.totalAmount,
        },
      ]),
    );
    const tx: any = {
      $executeRaw: jest.fn(),
      ticket: {
        findMany: jest
          .fn()
          .mockResolvedValue(opts.tickets.map((t) => ({ id: t.id }))),
        findUnique: jest
          .fn()
          .mockImplementation(
            async ({ where: { id } }: { where: { id: string } }) => {
              const t = ticketState.get(id);
              return t
                ? {
                    id: t.id,
                    batchNo: t.batchNo,
                    totalAmount: t.totalAmount,
                    amountPaid: t.amountPaid,
                    serviceCost: t.serviceCost,
                    status: t.status,
                  }
                : null;
            },
          ),
        update: jest.fn().mockResolvedValue({}),
      },
      walletTransaction: {
        // Locked re-read returns PENDING — verify proceeds.
        findUnique: jest.fn().mockResolvedValue({
          id: 'wtx-1',
          userId: 'u-1',
          amount: opts.initialBalance,
          paymentMode: opts.paymentMode ?? 'JAZZ_CASH',
          status: 'PENDING_VERIFICATION',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'wtx-1', status: 'VERIFIED' }),
        create: jest.fn().mockResolvedValue({}),
      },
      user: {
        update: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'u-1',
            walletBalance: opts.initialBalance,
          })
          .mockResolvedValue({}),
      },
    };

    const prisma: any = {
      $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)),
    };

    const service = new WalletService(
      prisma as never,
      {
        create: jest.fn(),
      } as never,
      makeDispatcher() as never,
    );

    return { service, prisma, tx };
  }

  it('skips tickets with totalAmount <= 0 and never marks them paid', async () => {
    const { service, tx } = runVerify({
      paymentMode: 'JAZZ_CASH',
      initialBalance: 1_000,
      tickets: [
        { id: 't-zero', batchNo: 'B-0', totalAmount: 0, amountPaid: 0 },
        { id: 't-priced', batchNo: 'B-1', totalAmount: 200, amountPaid: 0 },
      ],
    });

    await service.verifyTopup('wtx-1', {});

    // Ticket update only fired for the priced ticket.
    const updateCalls = tx.ticket.update.mock.calls.map((c: any) => c[0]);
    const updatedIds = updateCalls.map((arg: any) => arg.where.id);
    expect(updatedIds).toEqual(['t-priced']);

    const settlement = tx.walletTransaction.create.mock.calls.map(
      (c: any) => c[0],
    );
    expect(settlement).toHaveLength(1);
    expect(settlement[0].data.ticketId).toBe('t-priced');
    expect(settlement[0].data.paymentMode).toBe('JAZZ_CASH');
    expect(settlement[0].data.amount).toBe(200);
  });

  it('preserves the original top-up payment mode on settlement transactions', async () => {
    const { service, tx } = runVerify({
      paymentMode: 'EASY_PAISA',
      initialBalance: 500,
      tickets: [
        { id: 't-1', batchNo: 'B-1', totalAmount: 300, amountPaid: 0 },
        { id: 't-2', batchNo: 'B-2', totalAmount: 800, amountPaid: 100 },
      ],
    });

    await service.verifyTopup('wtx-1', {});

    const modes = tx.walletTransaction.create.mock.calls.map(
      (c: any) => c[0].data.paymentMode,
    );
    expect(modes.every((m: string) => m === 'EASY_PAISA')).toBe(true);
  });
});

describe('WalletService.getMyWallet — dynamic net balance', () => {
  function build(
    walletBalance: number,
    tickets: Array<{
      totalAmount: number;
      amountPaid: number;
      status?: string;
    }>,
  ) {
    const auditLogsService = { create: jest.fn() };
    const prisma: any = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'u-1',
          name: 'C',
          email: 'c@x.com',
          walletBalance,
        }),
      },
      walletTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      ticket: {
        findMany: jest.fn().mockResolvedValue(
          tickets.map((t) => ({
            totalAmount: t.totalAmount,
            amountPaid: t.amountPaid,
          })),
        ),
      },
    };
    const service = new WalletService(
      prisma as never,
      auditLogsService as never,
      makeDispatcher() as never,
    );
    return { service, prisma };
  }

  it('net = credit − outstanding dues; goes negative when owing', async () => {
    const { service } = build(0, [{ totalAmount: 3300, amountPaid: 0 }]);
    const res = await service.getMyWallet('u-1');
    expect(res.credit).toBe(0);
    expect(res.due).toBe(3300);
    expect(res.balance).toBe(-3300);
  });

  it('prepaid credit offsets dues', async () => {
    const { service } = build(5000, [
      { totalAmount: 3300, amountPaid: 0 },
      { totalAmount: 1000, amountPaid: 400 }, // remaining 600
    ]);
    const res = await service.getMyWallet('u-1');
    expect(res.due).toBe(3900); // 3300 + 600
    expect(res.balance).toBe(1100); // 5000 − 3900
  });

  it('excludes zero-priced tickets and only counts positive remainders', async () => {
    const { service, prisma } = build(0, [
      { totalAmount: 0, amountPaid: 0 }, // free → ignored
      { totalAmount: 2000, amountPaid: 2000 }, // fully paid → 0
      { totalAmount: 1500, amountPaid: 0 }, // owed
    ]);
    const res = await service.getMyWallet('u-1');
    expect(res.due).toBe(1500);
    expect(res.balance).toBe(-1500);
    // DELIVERED tickets are excluded at the query level.
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          consumerId: 'u-1',
          status: { not: 'DELIVERED' },
          archivedAt: null,
        },
      }),
    );
  });
});
