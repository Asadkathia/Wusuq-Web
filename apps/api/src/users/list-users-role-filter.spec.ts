import { jest } from '@jest/globals';
import { UsersService } from './users.service';

// UsersService constructor: (prisma, auditLogsService, dispatcher).
function makeService(prisma: any) {
  const audit = { create: jest.fn().mockResolvedValue(undefined) };
  const dispatcher = {
    authPasswordChanged: jest.fn().mockResolvedValue(undefined),
  };
  return new UsersService(prisma, audit as any, dispatcher as any);
}

describe('UsersService.findAll role filter (I1)', () => {
  it('filters the where clause to the requested role (mapped to the Prisma enum spelling)', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    } as any;

    await makeService(prisma).findAll({
      page: 1,
      limit: 200,
      role: 'consumer',
    } as any);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: 'consumer' }),
      }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: 'consumer' }),
      }),
    );
  });

  it('maps a hyphenated shared role (e.g. manager-admin) to its underscored Prisma enum value', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    } as any;

    await makeService(prisma).findAll({
      page: 1,
      limit: 200,
      role: 'manager-admin',
    } as any);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: 'manager_admin' }),
      }),
    );
  });

  it('returns every role (no role key in the where clause) when no role filter is given', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    } as any;

    await makeService(prisma).findAll({ page: 1, limit: 200 } as any);

    const call = prisma.user.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('role');
  });

  it('combines role + search into one where clause without dropping either', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    } as any;

    await makeService(prisma).findAll({
      page: 1,
      limit: 200,
      role: 'representative',
      search: 'ahmed',
    } as any);

    const call = prisma.user.findMany.mock.calls[0][0];
    expect(call.where.role).toBe('representative');
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { name: { contains: 'ahmed', mode: 'insensitive' } },
      ]),
    );
  });
});
