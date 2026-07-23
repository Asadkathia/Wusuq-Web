import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

// AuthService constructor: (jwtService, configService, prisma, auditLogsService, dispatcher).
// signup() only touches `this.prisma`, so the other deps can be empty stubs
// (mirrors auth-currency.spec.ts, which exercises the real @wusuq/shared
// deriveCurrency rather than mocking it).
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

describe('AuthService.signup — phone normalization (H3)', () => {
  it('normalizes a local PK number (03XXXXXXXXX) to E.164 +92 and still derives PKR', async () => {
    const prisma = signupPrisma();
    await makeService(prisma).signup({
      name: 'Ali',
      email: 'ali@x.com',
      password: 'password1',
      phone: '03001234567',
      country: 'PK',
      consumerKind: 'NON_LAWYER',
    } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '+923001234567',
          currency: 'PKR',
        }),
      }),
    );
  });

  it('normalizes a PK number with a bare 92 prefix (no +) to E.164', async () => {
    const prisma = signupPrisma();
    await makeService(prisma).signup({
      name: 'Ali',
      email: 'ali2@x.com',
      password: 'password1',
      phone: '923001234567',
      country: 'PK',
      consumerKind: 'NON_LAWYER',
    } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '+923001234567',
          currency: 'PKR',
        }),
      }),
    );
  });

  it('preserves a genuinely international (+971) number unmangled and still derives USD', async () => {
    const prisma = signupPrisma();
    await makeService(prisma).signup({
      name: 'Fatima',
      email: 'fatima@x.com',
      password: 'password1',
      phone: '+971501234567',
      country: 'AE',
      consumerKind: 'NON_LAWYER',
    } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '+971501234567',
          currency: 'USD',
        }),
      }),
    );
  });
});
