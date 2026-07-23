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

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u1',
        phone: '+923001234567',
        country: 'PK',
        walletBalance: 0,
      }),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'u1', ...data })),
    },
    ticket: { count: jest.fn().mockResolvedValue(1) }, // locked → no currency re-derive noise
  } as any;
}

describe('update() persists consumer address/geo + cnic (batch-3 H2)', () => {
  it('writes address/province/district/city/postalCode/cnic to the update data', async () => {
    const prisma = makePrisma();
    await makeService(prisma).update('u1', {
      address: '11 Main St',
      province: 'Punjab',
      district: 'Lahore',
      city: 'Lahore',
      postalCode: '54000',
      cnic: '35201-1234567-1',
    } as any);

    // Before the fix these fields were absent from UpdateUserDto (stripped by
    // the whitelist pipe) AND never written here, so an admin address edit was
    // a silent no-op. This assertion fails against that state.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          address: '11 Main St',
          province: 'Punjab',
          district: 'Lahore',
          city: 'Lahore',
          postalCode: '54000',
          cnic: '35201-1234567-1',
        }),
      }),
    );
  });

  it('serializeUser returns consumerKind so the profile editor can pre-fill it', async () => {
    const prisma = makePrisma();
    prisma.user.update.mockImplementation(({ data }: any) => ({
      id: 'u1',
      role: 'CONSUMER',
      consumerKind: 'LAWYER',
      ...data,
    }));
    const out = await makeService(prisma).update('u1', { name: 'X' } as any);
    expect((out as any).consumerKind).toBe('LAWYER');
  });
});
