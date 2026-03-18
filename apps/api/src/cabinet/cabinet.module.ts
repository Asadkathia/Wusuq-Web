import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CabinetController } from './cabinet.controller';
import { CabinetService } from './cabinet.service';

@Module({
  imports: [PrismaModule],
  controllers: [CabinetController],
  providers: [CabinetService],
})
export class CabinetModule {}
