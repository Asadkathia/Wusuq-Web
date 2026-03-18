import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesPermissionsModule } from './roles-permissions/roles-permissions.module';
import { ServicesModule } from './services/services.module';
import { TicketsModule } from './tickets/tickets.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { FinanceModule } from './finance/finance.module';
import { WalletModule } from './wallet/wallet.module';
import { CostingModule } from './costing/costing.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
      {
        name: 'auth',
        ttl: 60_000,
        limit: 10,
      },
      {
        name: 'upload',
        ttl: 60_000,
        limit: 20,
      },
    ]),
    AuthModule,
    UsersModule,
    RolesPermissionsModule,
    ServicesModule,
    TicketsModule,
    AssignmentsModule,
    FinanceModule,
    WalletModule,
    CostingModule,
    ElectionsModule,
    CabinetModule,
    ReportsModule,
    DocumentsModule,
    NotificationsModule,
    AuditLogsModule,
    GeoModule,
    PrismaModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
