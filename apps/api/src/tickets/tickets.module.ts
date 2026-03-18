import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CostingModule } from '../costing/costing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [PrismaModule, AuditLogsModule, CostingModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
