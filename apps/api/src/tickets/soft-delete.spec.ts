import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';

function makeDispatcher() {
  return {
    ticketCreated: jest.fn().mockResolvedValue(undefined),
    ticketStatusChanged: jest.fn().mockResolvedValue(undefined),
    ticketDispatched: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
  };
}

// Audit 4.2: bulk "delete" must soft-archive (hard deleteMany 500'd on
// ON DELETE RESTRICT children, and would orphan WalletTransaction rows via
// SET NULL if it ever succeeded). Archived tickets vanish from lists and
// stop counting toward wallet dues.
describe('ticket soft delete (audit 4.2)', () => {
  it('bulk delete archives instead of hard-deleting', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const deleteMany = jest.fn();
    const prisma = {
      ticket: { updateMany, deleteMany },
    };
    const service = new TicketsService(
      prisma as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      { resolve: jest.fn() } as never,
      { resolveProvinceByCity: jest.fn() } as never,
      makeDispatcher() as never,
      { settleTicketsForUser: jest.fn() } as never,
    );

    await service.bulkAction(
      { action: 'delete', ticketIds: ['t-1', 't-2'] } as never,
      { actorUserId: 'admin-1' },
    );

    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['t-1', 't-2'] } }),
        data: { archivedAt: expect.any(Date) },
      }),
    );
  });

  it('findAll excludes archived tickets', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      ticket: { findMany, count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
    };
    const service = new TicketsService(
      prisma as never,
      { create: jest.fn() } as never,
      { resolve: jest.fn() } as never,
      { resolveProvinceByCity: jest.fn() } as never,
      makeDispatcher() as never,
      { settleTicketsForUser: jest.fn() } as never,
    );

    await service.findAll({ page: 1, limit: 10 } as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: null }),
      }),
    );
  });

  it('wallet dues ignore archived tickets', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'u-1',
          name: 'U',
          email: 'u@x.com',
          walletBalance: 100,
        }),
      },
      walletTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      ticket: { findMany },
    };
    const service = new WalletService(
      prisma as never,
      { create: jest.fn() } as never,
      {} as never,
    );

    await service.getMyWallet('u-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: null }),
      }),
    );
  });
});

// Audit 4.4 / 3.4: mark-notification-read scoped to the owner.
describe('notification markRead scoping', () => {
  it('only marks the notification when it belongs to the caller', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = new NotificationsService(
      { notification: { updateMany } } as never,
      {} as never,
      {} as never,
    );

    const result = await service.markRead('n-1', 'user-A');

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n-1', userId: 'user-A' },
        data: { isRead: true },
      }),
    );
    expect(result).toEqual({ updated: false });
  });
});
