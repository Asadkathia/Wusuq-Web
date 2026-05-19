import { Decimal } from '@prisma/client/runtime/library';
import { MockProvider } from './mock-provider';

describe('MockProvider', () => {
  const provider = new MockProvider();

  describe('initiate', () => {
    it('returns a deterministic-shaped providerTxnId and a mock redirect URL', async () => {
      const result = await provider.initiate({
        ticketId: 'tkt_123',
        amount: new Decimal('500.00'),
        currency: 'PKR',
        consumerId: 'usr_1',
        returnUrl: 'http://localhost:3000/return',
        notifyUrl: 'http://localhost:4000/api/payments/webhook/mock',
      });
      expect(result.providerTxnId).toMatch(/^MOCK-/);
      expect(result.redirectUrl).toContain('/consumer/payments/mock/');
      expect(result.rawRequest).toMatchObject({ ticketId: 'tkt_123', amount: '500' });
    });
  });

  describe('verifyCallback', () => {
    it('rejects payloads without the shared mock signature header', () => {
      const result = provider.verifyCallback(
        { providerTxnId: 'MOCK-1', status: 'SUCCESS', amount: 500 },
        {},
      );
      expect(result.signatureValid).toBe(false);
    });

    it('accepts a valid signed payload', () => {
      const result = provider.verifyCallback(
        { providerTxnId: 'MOCK-1', status: 'SUCCESS', amount: 500 },
        { 'x-mock-signature': 'mock-signed' },
      );
      expect(result.signatureValid).toBe(true);
      expect(result.status).toBe('SUCCESS');
      expect(result.amount).toBe(500);
      expect(result.providerTxnId).toBe('MOCK-1');
    });

    it('normalises unknown status to FAILED', () => {
      const result = provider.verifyCallback(
        { providerTxnId: 'MOCK-1', status: 'WAT', amount: 500 },
        { 'x-mock-signature': 'mock-signed' },
      );
      expect(result.status).toBe('FAILED');
    });
  });
});
