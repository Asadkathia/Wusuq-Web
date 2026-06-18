import { ServiceUnavailableException } from '@nestjs/common';
import {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  VerifyCallbackResult,
} from './payment-provider.interface';

/**
 * Explicit production opt-out (PAYMENT_PROVIDER=disabled): the API boots,
 * but every gateway operation fails loudly. This is the only valid
 * production configuration until a real provider (JazzCash/EasyPaisa) is
 * integrated — the factory refuses to construct the forgeable mock there
 * (audit 1.6), and refusing to boot at all would brick the whole API.
 */
export class DisabledProvider implements PaymentProvider {
  readonly name = 'DISABLED' as const;

  initiate(_input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    throw new ServiceUnavailableException(
      'Online payments are not available yet. Please pay via wallet top-up.',
    );
  }

  verifyCallback(
    _rawBody: unknown,
    _headers: Record<string, string>,
  ): VerifyCallbackResult {
    throw new ServiceUnavailableException('Online payments are disabled.');
  }
}
