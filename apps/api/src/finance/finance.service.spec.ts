import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';

describe('FinanceService', () => {
  it('rejects overpayment reconcile attempts', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'ticket-1' }]),
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          consumerId: 'user-1',
          totalAmount: 100,
          amountPaid: 90,
          invoice: null,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (cb) => cb(tx)),
    };
    const auditLogsService = { create: jest.fn() };
    const service = new FinanceService(
      prisma as never,
      auditLogsService as never,
    );

    await expect(
      service.reconcilePayment('ticket-1', {
        amount: 20,
        paymentMode: 'BANK_TRANSFER',
        currency: 'PKR',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(auditLogsService.create).not.toHaveBeenCalled();
  });
});
