import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CaseTypesController } from './case-types.controller';
import { CaseTypesService } from './case-types.service';

@Module({
  imports: [PrismaModule],
  controllers: [CaseTypesController],
  providers: [CaseTypesService],
})
export class CaseTypesModule {}
