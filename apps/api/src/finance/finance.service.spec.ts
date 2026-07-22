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

  it('returns currency + fxRateToPkr on list items (USD ticket board rendering)', async () => {
    const ticketRow = {
      id: 'ticket-2',
      batchNo: 'B2',
      status: 'PAID',
      consumer: { id: 'user-2', name: 'Consumer Two' },
      service: { id: 'svc-1', name: 'Case Files', category: 'judicial' },
      serviceCity: 'Lahore',
      caseType: 'civil',
      currency: 'USD',
      fxRateToPkr: 280.5,
      serviceCost: 35,
      deliveryCharges: 0,
      printingCharges: 0,
      attestedCharges: 0,
      nonAttestedCharges: 0,
      additionalCharges: 0,
      additionalServiceCost: 0,
      discountPrice: 0,
      taxRate: 0,
      taxAmount: 0,
      promoDiscount: 0,
      totalAmount: 35,
      amountPaid: 35,
      clerkCost: 0,
      clerkAttestedCharges: null,
      clerkNonAttestedCharges: null,
      clerkPrintingCharges: null,
      clerkDeliveryCharges: null,
      formPayload: null,
    };
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([[ticketRow], 1]),
      ticket: {
        findMany: jest.fn().mockResolvedValue([ticketRow]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const auditLogsService = { create: jest.fn() };
    const service = new FinanceService(
      prisma as never,
      auditLogsService as never,
    );

    const res = await service.findAll({ page: 1, limit: 20 } as never);
    const row = res.items[0] as Record<string, unknown>;
    expect(row.currency).toBe('USD');
    expect(row.fxRateToPkr).toBe(280.5);
  });
});
