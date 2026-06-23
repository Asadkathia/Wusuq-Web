import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

// AuthService constructor: (jwtService, configService, prisma, auditLogsService, dispatcher).
// signup() only touches `this.prisma`, so the other deps can be empty stubs.
function makeService(prisma: any) {
  return new AuthService({} as any, {} as any, prisma, {} as any, {} as any);
}

function signupPrisma() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
    },
  } as any;
}

describe('AuthService currency derivation', () => {
  it('signup stores currency=USD + country for a non-PK phone', async () => {
    const prisma = signupPrisma();
    await makeService(prisma).signup({
      name: 'A',
      email: 'a@x.com',
      password: 'password1',
      phone: '+447911123456',
      country: 'GB',
    } as any);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'USD', country: 'GB' }),
      }),
    );
  });

  it('signup stores currency=PKR for a +92 phone', async () => {
    const prisma = signupPrisma();
    await makeService(prisma).signup({
      name: 'A',
      email: 'a@x.com',
      password: 'password1',
      phone: '+923001234567',
      country: 'PK',
    } as any);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'PKR' }),
      }),
    );
  });

  it('completeProfile re-derives currency when the account is inactive (no tickets, zero balance)', async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ walletBalance: 0, phone: '+447911123456' }),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
      },
      ticket: { count: jest.fn().mockResolvedValue(0) },
    } as any;
    await makeService(prisma).completeProfile('u1', {
      name: 'A',
      country: 'GB',
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'USD', country: 'GB' }),
      }),
    );
  });

  it('completeProfile keeps currency locked once the account has a ticket', async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ walletBalance: 0, phone: '+923001234567' }),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
      },
      ticket: { count: jest.fn().mockResolvedValue(1) },
    } as any;
    await makeService(prisma).completeProfile('u1', {
      name: 'A',
      country: 'GB',
    });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.country).toBe('GB'); // contact info still updates
    expect(data.currency).toBeUndefined(); // billing currency stays locked
  });
});
