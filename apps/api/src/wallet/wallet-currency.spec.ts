import { jest } from '@jest/globals';
import { WalletService } from './wallet.service';

// WalletService constructor: (prisma, auditLogsService, dispatcher).
function makeService(prisma: any) {
  return new WalletService(prisma, {} as any, {} as any);
}

describe('getMyWallet currency', () => {
  it('returns the consumer currency alongside the balance', async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn<(...a: any[]) => any>().mockResolvedValue({
          id: 'u1',
          name: 'A',
          email: null,
          walletBalance: 0,
          currency: 'USD',
        }),
      },
      walletTransaction: {
        findMany: jest.fn<(...a: any[]) => any>().mockResolvedValue([]),
      },
      ticket: {
        findMany: jest.fn<(...a: any[]) => any>().mockResolvedValue([]),
      },
    } as any;

    const result = await makeService(prisma).getMyWallet('u1');
    expect(result.currency).toBe('USD');
    expect(result.balance).toBe(0);
  });
});
