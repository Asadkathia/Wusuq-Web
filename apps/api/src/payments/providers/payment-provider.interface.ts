import { Decimal } from '@prisma/client/runtime/library';
import { PaymentProviderName } from '@prisma/client';

export interface InitiatePaymentInput {
  ticketId: string;
  amount: Decimal;
  currency: 'PKR';
  consumerId: string;
  returnUrl: string;
  notifyUrl: string;
}

export interface InitiatePaymentResult {
  providerTxnId: string;
  redirectUrl: string;
  rawRequest: unknown;
}

export interface VerifyCallbackResult {
  providerTxnId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  amount: number;
  signatureValid: boolean;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyCallback(
    rawBody: unknown,
    headers: Record<string, string>,
  ): VerifyCallbackResult;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
