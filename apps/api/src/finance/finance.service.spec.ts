import { BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';

describe('FinanceService', () => {
  it('rejects overpayment reconcile attempts', async () => {
    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          consumerId: 'user-1',
          totalAmount: 100,
          amountPaid: 90,
          invoice: null,
        }),
      },
      $transaction: jest.fn(),
    };
    const auditLogsService = { create: jest.fn() };
    const service = new FinanceService(prisma as never, auditLogsService as never);

    await expect(
      service.reconcilePayment('ticket-1', {
        amount: 20,
        paymentMode: 'BANK_TRANSFER',
        currency: 'PKR',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditLogsService.create).not.toHaveBeenCalled();
  });
});

