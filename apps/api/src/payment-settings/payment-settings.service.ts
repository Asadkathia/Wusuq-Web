import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';

@Injectable()
export class PaymentSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    return this.prisma.paymentSettings.findUnique({
      where: { id: 'singleton' },
    });
  }

  async update(dto: UpdatePaymentSettingsDto, actorUserId?: string) {
    return this.prisma.paymentSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...dto, updatedByUserId: actorUserId },
      update: { ...dto, updatedByUserId: actorUserId },
    });
  }
}
