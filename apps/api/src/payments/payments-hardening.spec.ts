import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { MockProvider } from './providers/mock-provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { PaymentProviderFactory } from './providers/provider.factory';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';

const makePrisma = () => {
  const prisma: any = {
    $executeRaw: jest.fn(),
    ticket: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    invoice: { upsert: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  return prisma;
};

async function buildService(
  prisma: any,
  configValues: Record<string, string> = {},
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: PrismaService, useValue: prisma },
      { provide: PAYMENT_PROVIDER, useValue: new MockProvider() },
      { provide: AuditLogsService, useValue: { create: jest.fn() } },
      {
        provide: NotificationDispatcher,
        useValue: { paymentCompleted: jest.fn().mockResolvedValue(undefined) },
      },
      {
        provide: ConfigService,
        useValue: {
          get: (k: string) =>
            configValues[k] ??
            (k === 'PAYMENT_RETURN_URL'
              ? 'http://localhost:3000/consumer/payments/return'
              : k === 'PAYMENT_NOTIFY_URL'
                ? 'http://localhost:4000/api/payments/webhook/mock'
                : undefined),
        },
      },
    ],
  }).compile();
  return moduleRef.get(PaymentsService);
}

// Audit 1.6: the gateway path was not partial-payment-safe (initiate charged
// the FULL total ignoring amountPaid; the webhook SET amountPaid = totalAmount,
// erasing prior wallet debits) and the mock provider was production-reachable.
describe('payments partial-payment safety (audit 1.6)', () => {
  it('initiate charges the remaining due, not the full total', async () => {
    const prisma = makePrisma();
    prisma.ticket.findUnique.mockResolvedValue({
      id: 'tkt_1',
      consumerId: 'usr_1',
      totalAmount: new Decimal('500'),
      amountPaid: new Decimal('200'),
      status: 'UNPAID',
    });
    prisma.payment.create.mockResolvedValue({
      id: 'pay_1',
      providerTxnId: 'MOCK-x',
    });
    const service = await buildService(prisma);

    await service.initiate('tkt_1', 'usr_1');

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: new Decimal('300') }),
      }),
    );
  });

  it('initiate rejects a ticket with nothing left to pay', async () => {
    const prisma = makePrisma();
    prisma.ticket.findUnique.mockResolvedValue({
      id: 'tkt_1',
      consumerId: 'usr_1',
      totalAmount: new Decimal('500'),
      amountPaid: new Decimal('500'),
      status: 'UNPAID',
    });
    const service = await buildService(prisma);

    await expect(service.initiate('tkt_1', 'usr_1')).rejects.toThrow(
      /fully paid|nothing/i,
    );
  });

  it('webhook on a partially-wallet-paid ticket INCREMENTS amountPaid', async () => {
    const prisma = makePrisma();
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay_1',
      ticketId: 'tkt_1',
      providerTxnId: 'MOCK-x',
      status: 'INITIATED',
      amount: new Decimal('300'),
      ticket: {
        id: 'tkt_1',
        totalAmount: new Decimal('500'),
        serviceCost: new Decimal('500'),
        amountPaid: new Decimal('200'),
        status: 'UNPAID',
      },
    });
    prisma.ticket.update.mockResolvedValue({
      id: 'tkt_1',
      amountPaid: new Decimal('500'),
      totalAmount: new Decimal('500'),
      serviceCost: new Decimal('500'),
      status: 'UNPAID',
    });
    const service = await buildService(prisma);

    await service.handleWebhook(
      'mock',
      { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 300 },
      { 'x-mock-signature': 'mock-signed' },
    );

    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tkt_1' },
        data: expect.objectContaining({
          amountPaid: { increment: expect.anything() },
        }),
      }),
    );
  });

  it('a duplicate webhook losing the conditional flip is idempotent', async () => {
    const prisma = makePrisma();
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay_1',
      ticketId: 'tkt_1',
      providerTxnId: 'MOCK-x',
      status: 'INITIATED', // stale read — another delivery already flipped it
      amount: new Decimal('300'),
      ticket: {
        id: 'tkt_1',
        totalAmount: new Decimal('500'),
        serviceCost: new Decimal('500'),
        amountPaid: new Decimal('200'),
        status: 'UNPAID',
      },
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    const service = await buildService(prisma);

    const result = (await service.handleWebhook(
      'mock',
      { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 300 },
      { 'x-mock-signature': 'mock-signed' },
    )) as { idempotent?: boolean };

    expect(result.idempotent).toBe(true);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });

  it('rejects a webhook whose amount differs from the initiated payment amount', async () => {
    const prisma = makePrisma();
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay_1',
      ticketId: 'tkt_1',
      providerTxnId: 'MOCK-x',
      status: 'INITIATED',
      amount: new Decimal('300'),
      ticket: {
        id: 'tkt_1',
        totalAmount: new Decimal('500'),
        serviceCost: new Decimal('500'),
        amountPaid: new Decimal('200'),
        status: 'UNPAID',
      },
    });
    const service = await buildService(prisma);

    await expect(
      service.handleWebhook(
        'mock',
        { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 500 },
        { 'x-mock-signature': 'mock-signed' },
      ),
    ).rejects.toThrow(/amount/i);
  });
});

describe('mock provider production guards (audit 1.6)', () => {
  type Factory = {
    useFactory: (config: { get: (k: string) => string | undefined }) => unknown;
  };
  const factory = PaymentProviderFactory as unknown as Factory;

  it('factory throws at startup in production when PAYMENT_PROVIDER is unset', () => {
    const config = {
      get: (k: string) => (k === 'NODE_ENV' ? 'production' : undefined),
    };
    expect(() => factory.useFactory(config)).toThrow(/PAYMENT_PROVIDER/);
  });

  it('factory throws at startup in production when PAYMENT_PROVIDER is mock', () => {
    const config = {
      get: (k: string) =>
        k === 'NODE_ENV'
          ? 'production'
          : k === 'PAYMENT_PROVIDER'
            ? 'mock'
            : undefined,
    };
    expect(() => factory.useFactory(config)).toThrow(/PAYMENT_PROVIDER/);
  });

  it('factory returns the mock provider outside production', () => {
    const config = { get: () => undefined };
    expect(factory.useFactory(config)).toBeInstanceOf(MockProvider);
  });

  it('devResolveMock is disabled in production', async () => {
    const prisma = makePrisma();
    const service = await buildService(prisma, { NODE_ENV: 'production' });

    await expect(service.devResolveMock('MOCK-x', 'SUCCESS')).rejects.toThrow(
      /disabled/i,
    );
  });
});
