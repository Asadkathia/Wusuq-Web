import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ElectionsController } from './elections.controller';
import { ElectionsService } from './elections.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [ElectionsController],
  providers: [ElectionsService],
})
export class ElectionsModule {}
