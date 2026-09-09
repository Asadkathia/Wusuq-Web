import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PricingModule } from '../pricing/pricing.module';
import { GeoModule } from '../geo/geo.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { SettingsModule } from '../settings/settings.module';
import { PromosModule } from '../promos/promos.module';
import { CurrencyModule } from '../currency/currency.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [
    PrismaModule,
    AuditLogsModule,
    PricingModule,
    GeoModule,
    NotificationsModule,
    WalletModule,
    SettingsModule,
    PromosModule,
    CurrencyModule,
    // Batch-7 7.2: auto-issue an invoice when a ticket completes.
    InvoicesModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
