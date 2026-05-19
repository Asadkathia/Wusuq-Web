import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { MockProvider } from './mock-provider';

export const PaymentProviderFactory: Provider = {
  provide: PAYMENT_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const name = (
      config.get<string>('PAYMENT_PROVIDER') ?? 'mock'
    ).toLowerCase();
    switch (name) {
      case 'mock':
        return new MockProvider();
      default:
        throw new Error(`Unknown PAYMENT_PROVIDER "${name}"`);
    }
  },
};
