import { jest } from '@jest/globals';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import type { FilterTicketsDto } from './dto/filter-tickets.dto';
import type { JwtUser } from '../auth/types/jwt-user.type';

function makeDispatcher() {
  return {
    ticketCreated: jest.fn().mockResolvedValue(undefined),
    ticketStatusChanged: jest.fn().mockResolvedValue(undefined),
    ticketDispatched: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
  };
}

// Restore/unarchive follow-up to audit 4.2: archived tickets had no way back
// into the active workflow. Bulk 'restore' clears archivedAt (conditional
// updateMany, mirroring 'delete'); the `archived` filter surfaces ONLY
// archived tickets so the admin Archived view has something to act on.
describe('ticket restore (unarchive follow-up)', () => {
  it('bulk restore clears archivedAt on archived tickets only', async () => {
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
      { action: 'restore', ticketIds: ['t-1', 't-2'] } as never,
      { actorUserId: 'admin-1' },
    );

    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['t-1', 't-2'] },
          archivedAt: { not: null },
        }),
        data: { archivedAt: null },
      }),
    );
  });

  it('findAll with archived:true returns only archived tickets', async () => {
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

    await service.findAll({ page: 1, limit: 10, archived: true } as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: { not: null } }),
      }),
    );
  });

  it('findAll without archived still excludes archived tickets (default unchanged)', async () => {
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
});

// The Archived view is staff-only; the controller must strip a
// client-supplied `archived=true` for consumer/representative callers
// regardless of what the query string carries.
describe('TicketsController.findAll archived scoping', () => {
  it('strips archived for a consumer caller', async () => {
    const findAll = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const controller = new TicketsController({ findAll } as never);
    const query = { archived: true } as FilterTicketsDto;
    const user = { sub: 'c-1', role: 'consumer' } as JwtUser;

    void controller.findAll(query, user);

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ archived: false, consumerId: 'c-1' }),
      { forConsumer: true, forRepresentative: false },
    );
  });

  it('strips archived for a representative caller', async () => {
    const findAll = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const controller = new TicketsController({ findAll } as never);
    const query = { archived: true } as FilterTicketsDto;
    const user = { sub: 'r-1', role: 'representative' } as JwtUser;

    void controller.findAll(query, user);

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ archived: false, representativeId: 'r-1' }),
      { forConsumer: true, forRepresentative: true },
    );
  });

  it('allows archived=true through for a staff caller', async () => {
    const findAll = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const controller = new TicketsController({ findAll } as never);
    const query = { archived: true } as FilterTicketsDto;
    const user = { sub: 'a-1', role: 'super-admin' } as JwtUser;

    void controller.findAll(query, user);

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ archived: true }),
      { forConsumer: false, forRepresentative: false },
    );
  });
});
