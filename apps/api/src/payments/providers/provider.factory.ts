import { ConfigService } from '@nestjs/config';
import { Logger, Provider } from '@nestjs/common';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { MockProvider } from './mock-provider';
import { DisabledProvider } from './disabled-provider';

const logger = new Logger('PaymentProviderFactory');

/**
 * Resolves the payment gateway provider from PAYMENT_PROVIDER.
 *
 * Audit 1.6 invariant: the MockProvider accepts a constant signature and
 * exposes a public resolve endpoint (anyone could mark a ticket PAID), so it
 * must NEVER run in production. This was originally enforced by throwing at
 * startup when PAYMENT_PROVIDER was unset/mock in prod — but that bricked the
 * ENTIRE API (auth, tickets, wallet, everything) on one missing env var, a
 * far worse failure mode than payments being unavailable (and it's what kept
 * prod crash-looping when the render.yaml Blueprint var didn't reach the
 * live service).
 *
 * So in production an unset or `mock` value now DEGRADES to the safe
 * DisabledProvider (the gateway returns 503; the mock never runs) instead of
 * crashing. A real provider name is still honoured; an unknown name still
 * throws (a genuine typo/misconfiguration worth failing on). In development
 * the mock stays the default for local testing.
 */
export const PaymentProviderFactory: Provider = {
  provide: PAYMENT_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const nodeEnv = config.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
    const isProd = nodeEnv === 'production';
    const name = (config.get<string>('PAYMENT_PROVIDER') ?? '').toLowerCase();

    switch (name) {
      // Explicit opt-out: boots with the gateway hard-disabled (503). The
      // only valid production value until a real provider is integrated.
      case 'disabled':
        return new DisabledProvider();

      case 'mock':
        if (isProd) {
          logger.warn(
            'PAYMENT_PROVIDER=mock is forbidden in production — using the ' +
              'DisabledProvider (online payments return 503). Set ' +
              'PAYMENT_PROVIDER to a real provider to enable the gateway.',
          );
          return new DisabledProvider();
        }
        return new MockProvider();

      case '':
        if (isProd) {
          logger.warn(
            'PAYMENT_PROVIDER is not set in production — defaulting to the ' +
              'DisabledProvider (online payments return 503). Set ' +
              'PAYMENT_PROVIDER=disabled to silence this, or to a real ' +
              'provider to enable the gateway.',
          );
          return new DisabledProvider();
        }
        return new MockProvider();

      // case 'jazzcash' / 'easypaisa': return new <Provider>() — when integrated.

      default:
        throw new Error(
          `Unknown PAYMENT_PROVIDER "${name}". Use 'disabled' (or a real ` +
            "provider) in production, or leave unset / 'mock' in development.",
        );
    }
  },
};
