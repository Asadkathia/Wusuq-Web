import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesPermissionsModule } from './roles-permissions/roles-permissions.module';
import { ServicesModule } from './services/services.module';
import { TicketsModule } from './tickets/tickets.module';
import { PaymentsModule } from './payments/payments.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { FinanceModule } from './finance/finance.module';
import { WalletModule } from './wallet/wallet.module';
import { PricingModule } from './pricing/pricing.module';
import { ElectionsModule } from './elections/elections.module';
import { CabinetModule } from './cabinet/cabinet.module';
import { ReportsModule } from './reports/reports.module';
import { DocumentsModule } from './documents/documents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { GeoModule } from './geo/geo.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './roles-permissions/guards/permissions.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { CasesModule } from './cases/cases.module';
import { CurrencyModule } from './currency/currency.module';
import { ScheduleModule } from '@nestjs/schedule';
import { FileStorageModule } from './file-storage/file-storage.module';
import { PersonalFilesModule } from './personal-files/personal-files.module';
import { CaseTypesModule } from './case-types/case-types.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        // General API — 600 req/min covers heavy dashboard + SPA navigation
        name: 'default',
        ttl: 60_000,
        limit: 600,
      },
      {
        // Auth endpoints only (login, refresh, register)
        name: 'auth',
        ttl: 60_000,
        limit: 15,
      },
      {
        // File upload endpoints
        name: 'upload',
        ttl: 60_000,
        limit: 30,
      },
    ]),
    AuthModule,
    UsersModule,
    RolesPermissionsModule,
    ServicesModule,
    TicketsModule,
    PaymentsModule,
    AssignmentsModule,
    FinanceModule,
    WalletModule,
    PricingModule,
    ElectionsModule,
    CabinetModule,
    ReportsModule,
    DocumentsModule,
    NotificationsModule,
    AuditLogsModule,
    GeoModule,
    PrismaModule,
    HealthModule,
    DashboardModule,
    CasesModule,
    CurrencyModule,
    ScheduleModule.forRoot(),
    FileStorageModule,
    PersonalFilesModule,
    CaseTypesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
