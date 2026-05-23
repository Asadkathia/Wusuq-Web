import { jest } from '@jest/globals';
import { PaymentSettingsService } from './payment-settings.service';

describe('PaymentSettingsService', () => {
  it('upserts the singleton row and returns it', async () => {
    const prisma = {
      paymentSettings: {
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'singleton', bankName: 'HBL' }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'singleton', bankName: 'HBL' }),
      },
    };
    const svc = new PaymentSettingsService(prisma as never);
    const saved = await svc.update(
      { bankName: 'HBL', accountTitle: 'Wusuq', accountNumber: '123' },
      'admin-1',
    );
    expect(saved.bankName).toBe('HBL');
    expect(prisma.paymentSettings.upsert).toHaveBeenCalled();
  });
});
