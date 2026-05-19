import { Injectable } from '@nestjs/common';
import { PaymentProviderName } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  VerifyCallbackResult,
} from './payment-provider.interface';

const MOCK_SIGNATURE = 'mock-signed';

@Injectable()
export class MockProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'MOCK';

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const providerTxnId = `MOCK-${randomUUID()}`;
    return {
      providerTxnId,
      redirectUrl: `/consumer/payments/mock/${providerTxnId}`,
      rawRequest: {
        ticketId: input.ticketId,
        amount: input.amount.toString(),
        currency: input.currency,
        consumerId: input.consumerId,
        returnUrl: input.returnUrl,
        notifyUrl: input.notifyUrl,
      },
    };
  }

  verifyCallback(
    rawBody: unknown,
    headers: Record<string, string>,
  ): VerifyCallbackResult {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const signatureValid = headers['x-mock-signature'] === MOCK_SIGNATURE;
    const rawStatus = String(body.status ?? '');
    const status: VerifyCallbackResult['status'] =
      rawStatus === 'SUCCESS' || rawStatus === 'FAILED' || rawStatus === 'CANCELLED'
        ? rawStatus
        : 'FAILED';
    return {
      providerTxnId: String(body.providerTxnId ?? ''),
      status,
      amount: Number(body.amount ?? 0),
      signatureValid,
    };
  }
}
