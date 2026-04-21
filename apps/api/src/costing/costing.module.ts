import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClerkCostsController } from './clerk-costs/clerk-costs.controller';
import { ClerkCostsService } from './clerk-costs/clerk-costs.service';
import { CostingService } from './costing.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [ClerkCostsController],
  providers: [ClerkCostsService, CostingService],
  exports: [CostingService],
})
export class CostingModule {}
