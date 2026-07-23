import { jest } from '@jest/globals';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';

// AuthService constructor: (jwtService, configService, prisma, auditLogsService, dispatcher).
function makeService(prisma: any) {
  return new AuthService({} as any, {} as any, prisma, {} as any, {} as any);
}

describe('AuthService.completeProfile — phone/cnic/dob (H1)', () => {
  function makePrisma(existing: {
    walletBalance?: number;
    phone?: string | null;
    country?: string | null;
  }) {
    return {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          walletBalance: existing.walletBalance ?? 0,
          phone: existing.phone ?? null,
          country: existing.country ?? null,
        }),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
      },
      ticket: { count: jest.fn().mockResolvedValue(0) },
    } as any;
  }

  it('persists phone, cnic and dateOfBirth on the User row', async () => {
    const prisma = makePrisma({ phone: '+923001234567' });

    await makeService(prisma).completeProfile('u1', {
      name: 'Ali Raza',
      phone: '+923009999999',
      cnic: '35202-1234567-1',
      dateOfBirth: '1990-05-20',
    });

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.phone).toBe('+923009999999');
    expect(data.cnic).toBe('35202-1234567-1');
    expect(data.dateOfBirth).toEqual(new Date('1990-05-20'));
  });

  it('omits phone/cnic/dateOfBirth from the update when not provided', async () => {
    const prisma = makePrisma({ phone: '+923001234567' });

    await makeService(prisma).completeProfile('u1', { name: 'Ali Raza' });

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('phone');
    expect(data).not.toHaveProperty('cnic');
    expect(data).not.toHaveProperty('dateOfBirth');
  });

  it('re-derives currency from an edited phone when the account is unlocked', async () => {
    const prisma = makePrisma({ phone: '+923001234567', country: 'PK' });

    await makeService(prisma).completeProfile('u1', {
      name: 'Ali Raza',
      phone: '+971501234567',
    });

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.currency).toBe('USD');
  });

  it('does NOT re-derive currency from an edited phone once the account is locked (has a ticket)', async () => {
    const prisma = makePrisma({ phone: '+923001234567', country: 'PK' });
    prisma.ticket.count.mockResolvedValue(1);

    await makeService(prisma).completeProfile('u1', {
      name: 'Ali Raza',
      phone: '+971501234567',
    });

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.currency).toBeUndefined();
    // phone (contact info) still updates even though currency stays locked.
    expect(data.phone).toBe('+971501234567');
  });
});

describe('AuthService.login / impersonate — consumerKind & city passthrough (H5)', () => {
  it('login returns consumerKind and city so the frontend banner can see them', async () => {
    const passwordHash = await hash('whatever', 10);
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@x.com',
          role: 'consumer',
          isActive: true,
          passwordHash,
          verified: true,
          currency: 'PKR',
          country: 'PK',
          city: 'Lahore',
          consumerKind: 'NON_LAWYER',
          name: 'Ali',
        }),
        update: jest.fn(),
      },
    } as any;

    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('token'),
    } as any;
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('secret'),
    } as any;
    const audit = { create: jest.fn() } as any;
    const service = new AuthService(
      jwtService,
      configService,
      prisma,
      audit,
      {} as any,
    );

    const result = await service.login({
      identifier: 'a@x.com',
      password: 'whatever',
    } as any);

    expect(result.user).toMatchObject({
      city: 'Lahore',
      consumerKind: 'NON_LAWYER',
    });
  });

  it('impersonate returns consumerKind and city for the target user', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'target',
          email: 'target@x.com',
          role: 'consumer',
          isActive: true,
          name: 'Target',
          verified: true,
          city: 'Karachi',
          consumerKind: 'LAWYER',
        }),
        update: jest.fn(),
      },
    } as any;

    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('token'),
    } as any;
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('secret'),
    } as any;
    const audit = { create: jest.fn() } as any;
    const service = new AuthService(
      jwtService,
      configService,
      prisma,
      audit,
      {} as any,
    );

    const result = await service.impersonate('target', {
      sub: 'admin',
      email: 'admin@x.com',
      role: 'super-admin',
    } as any);

    expect(result.user).toMatchObject({
      city: 'Karachi',
      consumerKind: 'LAWYER',
    });
  });
});
