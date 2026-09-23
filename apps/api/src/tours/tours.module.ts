/** Guided-tour progress module (self-scoped, see ToursController). */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ToursController } from './tours.controller';
import { ToursService } from './tours.service';

@Module({
  imports: [PrismaModule],
  controllers: [ToursController],
  providers: [ToursService],
})
export class ToursModule {}
