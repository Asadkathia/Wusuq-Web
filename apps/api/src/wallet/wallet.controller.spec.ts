import { jest } from '@jest/globals';
// The @wusuq/shared package ships ESM in dist; ts-jest can't transform it.
// Stub the constants we need so the DTO's class-validator decorators load.
jest.mock('@wusuq/shared', () => ({
  PAYMENT_MODES: ['JAZZ_CASH', 'EASY_PAISA', 'BANK_TRANSFER'],
  PERMISSIONS: [
    'users.read',
    'tickets.read',
    'tickets.write',
    'wallet.read',
    'wallet.write',
    'wallet.topup',
  ],
  USER_ROLES: [
    'super-admin',
    'manager-admin',
    'staff-admin',
    'lead-admin',
    'lawyer',
    'consumer',
    'representative',
    'investor',
    'company',
  ],
}));

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { JwtUser } from '../auth/types/jwt-user.type';
import { WalletController } from './wallet.controller';
import type { WalletService } from './wallet.service';

function makeController(service: Partial<WalletService>): WalletController {
  return new WalletController(service as WalletService);
}

const adminUser: JwtUser = {
  sub: 'admin-1',
  email: 'admin@wusuq.com',
  role: 'staff-admin',
};
const consumerUser: JwtUser = {
  sub: 'consumer-1',
  email: 'consumer@example.com',
  role: 'consumer',
};

describe('WalletController scope guards', () => {
  it('forbids consumer from listing all wallets', async () => {
    const list = jest.fn();
    const controller = makeController({ list });
    expect(() =>
      controller.list({ page: 1, limit: 20 } as never, consumerUser),
    ).toThrow(ForbiddenException);
    expect(list).not.toHaveBeenCalled();
  });

  it('lets admin list all wallets', async () => {
    const list = jest.fn().mockResolvedValue({ items: [] });
    const controller = makeController({ list });
    await controller.list({ page: 1, limit: 20 } as never, adminUser);
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('throws Unauthorized when no JWT actor on list', () => {
    const controller = makeController({ list: jest.fn() });
    expect(() =>
      controller.list({ page: 1, limit: 20 } as never, undefined),
    ).toThrow(UnauthorizedException);
  });

  it('returns own wallet for consumer via /wallet/me', () => {
    const getMyWallet = jest
      .fn()
      .mockResolvedValue({ balance: 0, transactions: [] });
    const controller = makeController({ getMyWallet });
    void controller.getMyWallet(consumerUser);
    expect(getMyWallet).toHaveBeenCalledWith(consumerUser.sub);
  });

  it('forbids consumer from reading another user transactions', () => {
    const history = jest.fn();
    const controller = makeController({ history });
    expect(() => controller.history('other-user', consumerUser)).toThrow(
      ForbiddenException,
    );
    expect(history).not.toHaveBeenCalled();
  });

  it('allows consumer to read own transactions', () => {
    const history = jest
      .fn()
      .mockResolvedValue({ userId: 'consumer-1', items: [] });
    const controller = makeController({ history });
    void controller.history(consumerUser.sub, consumerUser);
    expect(history).toHaveBeenCalledWith(consumerUser.sub);
  });

  it('allows admin to read any user transactions', () => {
    const history = jest.fn().mockResolvedValue({ userId: 'other', items: [] });
    const controller = makeController({ history });
    void controller.history('other-user', adminUser);
    expect(history).toHaveBeenCalledWith('other-user');
  });

  it('forbids consumer from verifying or rejecting top-ups', () => {
    const verifyTopup = jest.fn();
    const rejectTopup = jest.fn();
    const controller = makeController({ verifyTopup, rejectTopup });
    expect(() => controller.verify('tx-1', { note: '' }, consumerUser)).toThrow(
      ForbiddenException,
    );
    expect(() => controller.reject('tx-1', { note: '' }, consumerUser)).toThrow(
      ForbiddenException,
    );
    expect(verifyTopup).not.toHaveBeenCalled();
    expect(rejectTopup).not.toHaveBeenCalled();
  });

  it('forces consumer top-up onto own wallet even if userId is sent', () => {
    const topup = jest.fn().mockResolvedValue({ success: true });
    const controller = makeController({ topup });
    void controller.topup(
      {
        userId: 'someone-else',
        amount: 100,
        paymentMode: 'BANK_TRANSFER',
      },
      consumerUser,
    );
    expect(topup).toHaveBeenCalledWith(
      expect.objectContaining({ userId: consumerUser.sub, amount: 100 }),
      expect.objectContaining({ actorUserId: consumerUser.sub }),
    );
  });

  it('honours admin-supplied target userId on top-up', () => {
    const topup = jest.fn().mockResolvedValue({ success: true });
    const controller = makeController({ topup });
    void controller.topup(
      {
        userId: 'consumer-1',
        amount: 250,
        paymentMode: 'BANK_TRANSFER',
      },
      adminUser,
    );
    expect(topup).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'consumer-1' }),
      expect.objectContaining({ actorUserId: adminUser.sub }),
    );
  });
});
