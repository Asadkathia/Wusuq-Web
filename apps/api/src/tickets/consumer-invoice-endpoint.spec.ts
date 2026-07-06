import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

function makeDispatcher() {
  return {
    ticketCreated: jest.fn().mockResolvedValue(undefined),
    ticketStatusChanged: jest.fn().mockResolvedValue(undefined),
    ticketDispatched: jest.fn().mockResolvedValue(undefined),
    paymentRemainderDue: jest.fn().mockResolvedValue(undefined),
  };
}

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    batchNo: 'TKT-1',
    consumerId: 'consumer-1',
    status: 'COMPLETED',
    serviceCost: 500,
    additionalServiceCost: 0,
    deliveryCharges: 300,
    printingCharges: 50,
    attestedCharges: 0,
    nonAttestedCharges: 0,
    additionalCharges: 0,
    discountPrice: 0,
    promoDiscount: 0,
    taxAmount: 85,
    taxRate: 0.17,
    totalAmount: 935,
    amountPaid: 935,
    currency: 'PKR',
    remainderFinalizedAt: new Date('2026-07-06T00:00:00Z'),
    consumer: { name: 'Consumer One', email: 'consumer1@x.com' },
    ...overrides,
  };
}

function makeService(ticket: Record<string, unknown> | null) {
  const prisma: any = {
    ticket: {
      findUnique: jest.fn().mockResolvedValue(ticket),
    },
    paymentSettings: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'singleton',
        bankName: 'Test Bank',
        accountTitle: 'Wusuq',
        accountNumber: '12345',
        iban: null,
        jazzCash: null,
        easyPaisa: null,
      }),
    },
  };
  const service = new TicketsService(
    prisma as never,
    { create: jest.fn().mockResolvedValue({}) } as never,
    { resolve: jest.fn() } as never,
    { resolveProvinceByCity: jest.fn() } as never,
    makeDispatcher() as never,
    { settleTicketsForUser: jest.fn() } as never,
  );
  return { service, prisma };
}

describe('buildConsumerInvoice (C14)', () => {
  it('returns a PDF payload for a consumer requesting their own ticket', async () => {
    const { service } = makeService(makeTicket());

    const result = await service.buildConsumerInvoice('ticket-1', {
      role: 'consumer',
      userId: 'consumer-1',
    });

    expect(result.contentType).toBe('application/pdf');
    expect(result.filename).toBe('invoice-TKT-1.pdf');
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('throws NotFoundException when a consumer requests a foreign ticket', async () => {
    const { service } = makeService(makeTicket({ consumerId: 'someone-else' }));

    await expect(
      service.buildConsumerInvoice('ticket-1', {
        role: 'consumer',
        userId: 'consumer-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the ticket does not exist', async () => {
    const { service } = makeService(null);

    await expect(
      service.buildConsumerInvoice('missing', {
        role: 'consumer',
        userId: 'consumer-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
