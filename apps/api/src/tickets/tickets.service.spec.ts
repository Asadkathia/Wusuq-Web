import { BadRequestException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

describe('TicketsService', () => {
  it('preserves financial fields when regenerating a ticket', async () => {
    const original = {
      id: 'ticket-1',
      batchNo: 'TKT-1',
      consumerId: 'consumer-1',
      serviceId: 'service-1',
      serviceCity: 'Karachi',
      caseType: 'civil',
      intakeFlow: 'judicial_case_files',
      formPayload: { sample: true },
      serviceCost: 100,
      deliveryCharges: 5,
      printingCharges: 2,
      attestedCharges: 3,
      additionalServiceCost: 10,
      clerkCost: 10,
      totalAmount: 120,
      amountPaid: 20,
      paymentStatus: 'PARTIALLY_PAID',
    };

    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(original),
        create: jest.fn().mockResolvedValue({ id: 'ticket-2' }),
      },
      ticketStatusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'history-1' }),
      },
    };
    const auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    const costingService = { resolveServiceCost: jest.fn(), resolveClerkCost: jest.fn() };
    const notificationsService = { create: jest.fn().mockResolvedValue({}) };
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      costingService as never,
      notificationsService as never,
    );

    await service.regenerate('ticket-1');

    expect(prisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceCost: 100,
          deliveryCharges: 5,
          printingCharges: 2,
          attestedCharges: 3,
          additionalServiceCost: 10,
          clerkCost: 10,
          totalAmount: 120,
          amountPaid: 20,
          paymentStatus: 'PARTIALLY_PAID',
        }),
      }),
    );
  });

  it('rejects assigning a non-representative user', async () => {
    const prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          status: 'PENDING',
          service: { id: 'service-1', category: 'x' },
          serviceCost: 100,
          deliveryCharges: 0,
          printingCharges: 0,
          attestedCharges: 0,
          caseType: null,
          formPayload: {},
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: 'consumer',
          isActive: true,
        }),
      },
      $transaction: jest.fn(),
    };
    const auditLogsService = { create: jest.fn() };
    const costingService = {
      resolveClerkCost: jest.fn().mockResolvedValue({ amount: 10 }),
    };
    const notificationsService = { create: jest.fn() };
    const service = new TicketsService(
      prisma as never,
      auditLogsService as never,
      costingService as never,
      notificationsService as never,
    );

    await expect(
      service.assign('ticket-1', { representativeId: 'user-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

