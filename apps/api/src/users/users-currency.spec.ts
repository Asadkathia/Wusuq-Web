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

describe('UsersService currency derivation', () => {
  it('create() derives PKR for a +92 phone', async () => {
    const prisma = {
      user: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
      },
    } as any;
    await makeService(prisma).create({
      name: 'A',
      email: 'a@x.com',
      password: 'password1',
      role: 'consumer',
      phone: '+923001234567',
    } as any);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'PKR' }),
      }),
    );
  });

  it('create() derives USD for a non-PK phone', async () => {
    const prisma = {
      user: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
      },
    } as any;
    await makeService(prisma).create({
      name: 'A',
      email: 'a@x.com',
      password: 'password1',
      role: 'consumer',
      phone: '+447911123456',
    } as any);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'USD' }),
      }),
    );
  });

  it('create() defaults to PKR with no phone', async () => {
    const prisma = {
      user: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
      },
    } as any;
    await makeService(prisma).create({
      name: 'A',
      email: 'a@x.com',
      password: 'password1',
      role: 'consumer',
    } as any);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'PKR' }),
      }),
    );
  });

  it('createRepresentative() derives USD for a non-PK phone', async () => {
    const prisma = {
      user: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
      },
    } as any;
    await makeService(prisma).createRepresentative({
      name: 'Rep',
      email: 'rep@x.com',
      password: 'password1',
      phone: '+12025550123',
    } as any);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'USD' }),
      }),
    );
  });

  it('update() re-derives currency while the account is inactive', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u1', phone: null, walletBalance: 0 }),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
      },
      ticket: { count: jest.fn().mockResolvedValue(0) },
    } as any;
    await makeService(prisma).update('u1', {
      phone: '+447911123456',
    } as any);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'USD' }),
      }),
    );
  });

  it('update() keeps currency locked once the account has a ticket', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u1', phone: '+923001234567', walletBalance: 0 }),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
      },
      ticket: { count: jest.fn().mockResolvedValue(1) },
    } as any;
    await makeService(prisma).update('u1', {
      phone: '+447911123456',
    } as any);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.currency).toBeUndefined();
  });

  it('update() keeps currency locked when the wallet balance is non-zero', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u1', phone: null, walletBalance: 500 }),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
      },
      ticket: { count: jest.fn().mockResolvedValue(0) },
    } as any;
    await makeService(prisma).update('u1', {
      phone: '+447911123456',
    } as any);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.currency).toBeUndefined();
  });
});
