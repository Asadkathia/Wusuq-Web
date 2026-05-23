import { Module } from '@nestjs/common';
import { PaymentSettingsService } from './payment-settings.service';
import { PaymentSettingsController } from './payment-settings.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentSettingsController],
  providers: [PaymentSettingsService],
  exports: [PaymentSettingsService],
})
export class PaymentSettingsModule {}
