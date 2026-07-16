import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { InvoicesService } from './invoices.service';

// No controller yet — `generate`/`list`/`findOne` are consumed directly by
// InvoicesService's own tests today. A controller lands in a later task; this
// module exists now purely to satisfy InvoicesService's constructor deps
// (PrismaService, SettingsService, AuditLogsService) via real Nest DI so the
// service compiles/boots correctly once one is added.
@Module({
  imports: [PrismaModule, SettingsModule, AuditLogsModule],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
