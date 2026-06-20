import { jest } from '@jest/globals';

// Mock @wusuq/shared (ESM package; Jest runs CJS)
jest.mock('@wusuq/shared', () => ({
  CONSUMER_KINDS: ['LAWYER', 'NON_LAWYER', 'CORPORATE'],
  mapPrismaRoleToShared: jest.fn((r: string) => r.toLowerCase()),
}));

// Stub heavy deps so we don't need a full NestJS module
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('../audit-logs/audit-logs.service', () => ({
  AuditLogsService: class {},
}));
jest.mock('../notifications/notification-dispatcher.service', () => ({
  NotificationDispatcher: class {},
}));
jest.mock('../users/user-role.mapper', () => ({
  mapPrismaRoleToShared: jest.fn((r: string) => r.toLowerCase()),
}));

import { AuthService } from './auth.service';

function makeMinimalPrisma() {
  return {
    user: {
      update: jest.fn(),
    },
  };
}

describe('AuthService.completeProfile — address fields', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof makeMinimalPrisma>;

  beforeEach(() => {
    prisma = makeMinimalPrisma();
    // Instantiate directly: constructor(jwtService, configService, prisma,
    // auditLogsService, dispatcher)
    service = new AuthService(
      {} as never,
      {} as never,
      prisma as never,
      {} as never,
      {} as never,
    );
  });

  it('persists address, province, district, and postalCode on the User row', async () => {
    const updatedUser = {
      id: 'u1',
      name: 'Ali Raza',
      email: null,
      role: 'CONSUMER',
      city: 'Lahore',
      consumerKind: null,
      address: '12 Main Street, Gulberg',
      province: 'Punjab',
      district: 'Lahore',
      postalCode: '54000',
    };
    (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

    await service.completeProfile('u1', {
      name: 'Ali Raza',
      cityName: 'Lahore',
      address: '12 Main Street, Gulberg',
      province: 'Punjab',
      district: 'Lahore',
      postalCode: '54000',
    });

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const callArg = (prisma.user.update as jest.Mock).mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };

    expect(callArg.where).toEqual({ id: 'u1' });
    expect(callArg.data).toMatchObject({
      address: '12 Main Street, Gulberg',
      province: 'Punjab',
      district: 'Lahore',
      postalCode: '54000',
    });
  });

  it('omits address fields from update data when not provided', async () => {
    const updatedUser = {
      id: 'u2',
      name: 'Fatima',
      email: null,
      role: 'CONSUMER',
      city: null,
      consumerKind: null,
    };
    (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

    await service.completeProfile('u2', { name: 'Fatima' });

    const callArg = (prisma.user.update as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(callArg.data).not.toHaveProperty('address');
    expect(callArg.data).not.toHaveProperty('province');
    expect(callArg.data).not.toHaveProperty('district');
    expect(callArg.data).not.toHaveProperty('postalCode');
  });
});
