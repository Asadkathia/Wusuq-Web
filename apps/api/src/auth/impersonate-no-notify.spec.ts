import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

// AuthService constructor: (jwtService, configService, prisma, auditLogsService, dispatcher).
// impersonate() touches jwtService (issueTokens), configService (getOrThrow),
// prisma (findUnique/update), auditLogsService (create) and — before the fix —
// dispatcher.authImpersonationStarted.
function makeService(prisma: any, audit: any, dispatcher: any) {
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('token'),
  } as any;
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('secret'),
  } as any;
  return new AuthService(jwtService, configService, prisma, audit, dispatcher);
}

describe('AuthService.impersonate notification suppression', () => {
  function impersonatePrisma() {
    return {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'target',
          email: 'target@x.com',
          role: 'consumer',
          isActive: true,
          name: 'Target',
          verified: true,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
  }

  it('does NOT notify the impersonated user', async () => {
    const prisma = impersonatePrisma();
    const audit = { create: jest.fn().mockResolvedValue(undefined) };
    const dispatcher = {
      authImpersonationStarted: jest.fn().mockResolvedValue(undefined),
    };

    await makeService(prisma, audit, dispatcher).impersonate('target', {
      sub: 'admin',
      email: 'admin@x.com',
      role: 'super-admin',
    } as any);

    expect(dispatcher.authImpersonationStarted).not.toHaveBeenCalled();
  });

  it('still writes the AUTH_IMPERSONATE audit trail', async () => {
    const prisma = impersonatePrisma();
    const audit = { create: jest.fn().mockResolvedValue(undefined) };
    const dispatcher = {
      authImpersonationStarted: jest.fn().mockResolvedValue(undefined),
    };

    await makeService(prisma, audit, dispatcher).impersonate('target', {
      sub: 'admin',
      email: 'admin@x.com',
      role: 'super-admin',
    } as any);

    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUTH_IMPERSONATE',
        entityId: 'target',
        actorUserId: 'admin',
      }),
    );
  });
});
