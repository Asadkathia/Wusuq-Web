import { jest } from '@jest/globals';
import { isStaffRole, ROLE_PERMISSIONS, USER_ROLES } from '@wusuq/shared';
import { UsersService } from './users.service';

// UsersService constructor: (prisma, auditLogsService, dispatcher).
function makeService(prisma: any) {
  const audit = { create: jest.fn().mockResolvedValue(undefined) };
  const dispatcher = {
    authPasswordChanged: jest.fn().mockResolvedValue(undefined),
  };
  return new UsersService(prisma, audit as any, dispatcher as any);
}

describe('Representative courtLevel + payout fields (C4/C5)', () => {
  it('createRepresentative() persists courtLevel + payout fields in the create data', async () => {
    const prisma = {
      user: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'rep1', ...data })),
      },
    } as any;

    await makeService(prisma).createRepresentative({
      name: 'Rep One',
      email: 'rep1@x.com',
      password: 'password1',
      courtLevel: 'high',
      payoutMethod: 'BANK_TRANSFER',
      payoutBankName: 'Allied',
      payoutAccountTitle: 'Rep One',
      payoutAccountNumber: '123',
    } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courtLevel: 'high',
          payoutMethod: 'BANK_TRANSFER',
          payoutBankName: 'Allied',
          payoutAccountTitle: 'Rep One',
          payoutAccountNumber: '123',
        }),
      }),
    );
  });

  it('createRepresentative() persists JazzCash/EasyPaisa payout numbers too', async () => {
    const prisma = {
      user: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'rep2', ...data })),
      },
    } as any;

    await makeService(prisma).createRepresentative({
      name: 'Rep Two',
      email: 'rep2@x.com',
      password: 'password1',
      courtLevel: 'lower',
      payoutMethod: 'JAZZ_CASH',
      payoutJazzCash: '03001234567',
    } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courtLevel: 'lower',
          payoutMethod: 'JAZZ_CASH',
          payoutJazzCash: '03001234567',
        }),
      }),
    );
  });

  it('update() persists courtLevel + payout fields in the update data', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'rep1', phone: null, walletBalance: 0 }),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'rep1', ...data })),
      },
      ticket: { count: jest.fn().mockResolvedValue(0) },
    } as any;

    await makeService(prisma).update('rep1', {
      courtLevel: 'special',
      payoutMethod: 'EASY_PAISA',
      payoutEasyPaisa: '03111234567',
    } as any);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courtLevel: 'special',
          payoutMethod: 'EASY_PAISA',
          payoutEasyPaisa: '03111234567',
        }),
      }),
    );
  });

  it('serializeUser (via findOne) returns the payout fields on the persisted row', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rep1',
          name: 'Rep One',
          email: 'rep1@x.com',
          role: 'REPRESENTATIVE',
          courtLevel: 'high',
          payoutMethod: 'BANK_TRANSFER',
          payoutBankName: 'Allied',
          payoutAccountTitle: 'Rep One',
          payoutAccountNumber: '123',
          payoutJazzCash: null,
          payoutEasyPaisa: null,
        }),
      },
    } as any;

    const result = await makeService(prisma).findOne('rep1');

    expect(result).toEqual(
      expect.objectContaining({
        courtLevel: 'high',
        payoutMethod: 'BANK_TRANSFER',
        payoutBankName: 'Allied',
        payoutAccountTitle: 'Rep One',
        payoutAccountNumber: '123',
      }),
    );
  });

  // The redaction guarantee for this feature is the route guard, not a
  // per-call serializer flag: every UsersController endpoint that can return
  // a serializeUser() payload (GET /users, GET /users/:id, POST
  // /users/representatives, PATCH /users/:id) is decorated with
  // `@RequirePermissions('users.read' | 'users.write')`
  // (apps/api/src/users/users.controller.ts). Assert here that those two
  // permissions are staff-only in the shared RBAC map, so no consumer-class
  // role or `representative` can ever reach a payload containing payout
  // fields — about themselves or (worse) about another rep.
  it('users.read / users.write are held only by staff roles (redaction guarantee)', () => {
    for (const role of USER_ROLES) {
      const perms = ROLE_PERMISSIONS[role];
      const hasUsersPermission =
        perms.includes('users.read') || perms.includes('users.write');
      if (hasUsersPermission) {
        expect(isStaffRole(role)).toBe(true);
      }
    }
    // Explicitly confirm the two roles that can actually touch a rep's
    // payout fields (representative himself, and any consumer-class role)
    // hold neither permission.
    expect(ROLE_PERMISSIONS.representative).not.toContain('users.read');
    expect(ROLE_PERMISSIONS.representative).not.toContain('users.write');
    expect(ROLE_PERMISSIONS.consumer).not.toContain('users.read');
    expect(ROLE_PERMISSIONS.consumer).not.toContain('users.write');
  });
});
