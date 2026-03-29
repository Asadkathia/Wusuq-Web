import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ServiceCostsController } from './service-costs/service-costs.controller';
import { ServiceCostsService } from './service-costs/service-costs.service';
import { ClerkCostsController } from './clerk-costs/clerk-costs.controller';
import { ClerkCostsService } from './clerk-costs/clerk-costs.service';
import { CostingService } from './costing.service';
import { ServiceBaseCostsController } from './service-base-costs/service-base-costs.controller';
import { ServiceBaseCostsService } from './service-base-costs/service-base-costs.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [ServiceCostsController, ClerkCostsController, ServiceBaseCostsController],
  providers: [ServiceCostsService, ClerkCostsService, CostingService, ServiceBaseCostsService],
  exports: [CostingService, ServiceBaseCostsService],
})
export class CostingModule {}
