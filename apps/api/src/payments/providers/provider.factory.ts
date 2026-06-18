import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { MockProvider } from './mock-provider';
import { DisabledProvider } from './disabled-provider';

export const PaymentProviderFactory: Provider = {
  provide: PAYMENT_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const configured = config.get<string>('PAYMENT_PROVIDER');
    const nodeEnv = config.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
    // Audit 1.6: the mock provider accepts a constant signature and exposes a
    // public resolve endpoint — anyone could mark tickets PAID. It must never
    // be reachable in production; fail startup instead of silently degrading.
    if (
      nodeEnv === 'production' &&
      (!configured || configured.toLowerCase() === 'mock')
    ) {
      throw new Error(
        'PAYMENT_PROVIDER must be set to a real payment provider in production — the mock provider is dev-only.',
      );
    }
    const name = (configured ?? 'mock').toLowerCase();
    switch (name) {
      case 'mock':
        return new MockProvider();
      // Explicit opt-out: boots the API with the gateway path hard-disabled.
      // This is the only valid production value until a real provider
      // (JazzCash/EasyPaisa) lands — set PAYMENT_PROVIDER=disabled in prod.
      case 'disabled':
        return new DisabledProvider();
      default:
        throw new Error(`Unknown PAYMENT_PROVIDER "${name}"`);
    }
  },
};
