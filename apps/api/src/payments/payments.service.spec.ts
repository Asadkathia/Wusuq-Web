import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { MockProvider } from './providers/mock-provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

const makePrisma = () => ({
  ticket: { findUnique: jest.fn(), update: jest.fn() },
  payment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  invoice: { upsert: jest.fn() },
  $transaction: jest.fn(async (cb: any) => cb(prisma)),
});

let prisma: ReturnType<typeof makePrisma>;

describe('PaymentsService', () => {
  let service: PaymentsService;
  let audit: { create: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    audit = { create: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PAYMENT_PROVIDER, useValue: new MockProvider() },
        { provide: AuditLogsService, useValue: audit },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === 'PAYMENT_RETURN_URL'
                ? 'http://localhost:3000/consumer/payments/return'
                : 'http://localhost:4000/api/payments/webhook/mock',
          },
        },
      ],
    }).compile();
    service = moduleRef.get(PaymentsService);
  });

  describe('initiate', () => {
    it('creates a Payment row and returns redirectUrl from provider', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'tkt_1',
        consumerId: 'usr_1',
        totalAmount: new Decimal('500'),
        paymentStatus: 'UNPAID',
      });
      prisma.payment.create.mockResolvedValue({
        id: 'pay_1',
        providerTxnId: 'MOCK-x',
      });

      const result = await service.initiate('tkt_1', 'usr_1');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketId: 'tkt_1',
            provider: 'MOCK',
            status: 'INITIATED',
          }),
        }),
      );
      expect(result.redirectUrl).toContain('/consumer/payments/mock/');
    });

    it('rejects when ticket is not owned by consumer', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'tkt_1',
        consumerId: 'usr_other',
        totalAmount: new Decimal('500'),
        paymentStatus: 'UNPAID',
      });
      await expect(service.initiate('tkt_1', 'usr_1')).rejects.toThrow(
        /forbidden/i,
      );
    });

    it('rejects when ticket is already paid', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'tkt_1',
        consumerId: 'usr_1',
        totalAmount: new Decimal('500'),
        paymentStatus: 'PAID',
      });
      await expect(service.initiate('tkt_1', 'usr_1')).rejects.toThrow(
        /already paid/i,
      );
    });
  });

  describe('handleWebhook', () => {
    it('rejects payloads with invalid signature', async () => {
      await expect(
        service.handleWebhook(
          'mock',
          { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 500 },
          {},
        ),
      ).rejects.toThrow(/signature/i);
    });

    it('flips ticket to PAID on successful verified callback', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_1',
        ticketId: 'tkt_1',
        providerTxnId: 'MOCK-x',
        status: 'INITIATED',
        amount: new Decimal('500'),
        ticket: { id: 'tkt_1', totalAmount: new Decimal('500') },
      });

      await service.handleWebhook(
        'mock',
        { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 500 },
        { 'x-mock-signature': 'mock-signed' },
      );

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tkt_1' },
          data: expect.objectContaining({ paymentStatus: 'PAID' }),
        }),
      );
      expect(prisma.invoice.upsert).toHaveBeenCalled();
    });

    it('is idempotent — re-deliveries of a SUCCESS callback no-op', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_1',
        ticketId: 'tkt_1',
        providerTxnId: 'MOCK-x',
        status: 'SUCCESS',
        amount: new Decimal('500'),
        ticket: { id: 'tkt_1', totalAmount: new Decimal('500') },
      });
      await service.handleWebhook(
        'mock',
        { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 500 },
        { 'x-mock-signature': 'mock-signed' },
      );
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('rejects callbacks where the verified amount mismatches the ticket total', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_1',
        ticketId: 'tkt_1',
        providerTxnId: 'MOCK-x',
        status: 'INITIATED',
        amount: new Decimal('500'),
        ticket: { id: 'tkt_1', totalAmount: new Decimal('500') },
      });
      await expect(
        service.handleWebhook(
          'mock',
          { providerTxnId: 'MOCK-x', status: 'SUCCESS', amount: 100 },
          { 'x-mock-signature': 'mock-signed' },
        ),
      ).rejects.toThrow(/amount/i);
    });
  });
});
