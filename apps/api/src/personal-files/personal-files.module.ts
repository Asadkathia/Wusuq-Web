import { Module } from '@nestjs/common';
import { PersonalFilesController } from './personal-files.controller';
import { PersonalFilesService } from './personal-files.service';
import { PersonalFilesGc } from './personal-files.gc';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FileStorageModule } from '../file-storage/file-storage.module';

@Module({
  imports: [PrismaModule, AuditLogsModule, FileStorageModule],
  controllers: [PersonalFilesController],
  providers: [PersonalFilesService, PersonalFilesGc],
})
export class PersonalFilesModule {}
