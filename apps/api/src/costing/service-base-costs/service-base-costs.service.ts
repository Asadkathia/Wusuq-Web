import { Injectable } from '@nestjs/common';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertServiceBaseCostDto } from '../dto/upsert-service-base-cost.dto';
import { UpdateServiceBaseCostDto } from '../dto/update-service-base-cost.dto';

@Injectable()
export class ServiceBaseCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async list() {
    const rows = await this.prisma.serviceBaseCost.findMany({
      orderBy: [{ service: { name: 'asc' } }, { pricingTier: 'asc' }],
      include: { service: { select: { id: true, name: true, category: true, type: true } } },
    });
    return { items: rows };
  }

  async upsert(
    dto: UpsertServiceBaseCostDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const result = await this.prisma.serviceBaseCost.upsert({
      where: { serviceId_pricingTier: { serviceId: dto.serviceId, pricingTier: dto.pricingTier } },
      update: {
        amount: dto.amount,
        isActive: dto.isActive ?? true,
        note: dto.note,
      },
      create: {
        serviceId: dto.serviceId,
        pricingTier: dto.pricingTier,
        amount: dto.amount,
        isActive: dto.isActive ?? true,
        note: dto.note,
      },
      include: { service: { select: { id: true, name: true, category: true } } },
    });

    await this.auditLogsService.create({
      action: 'SERVICE_BASE_COST_UPSERTED',
      entity: 'SERVICE_BASE_COST',
      entityId: result.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
      metadata: { serviceId: dto.serviceId, pricingTier: dto.pricingTier, amount: dto.amount },
    });

    return result;
  }

  async update(
    id: string,
    dto: UpdateServiceBaseCostDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const result = await this.prisma.serviceBaseCost.update({
      where: { id },
      data: dto,
      include: { service: { select: { id: true, name: true, category: true } } },
    });

    await this.auditLogsService.create({
      action: 'SERVICE_BASE_COST_UPDATED',
      entity: 'SERVICE_BASE_COST',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return result;
  }

  async remove(
    id: string,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const result = await this.prisma.serviceBaseCost.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditLogsService.create({
      action: 'SERVICE_BASE_COST_DISABLED',
      entity: 'SERVICE_BASE_COST',
      entityId: id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return result;
  }

  async resolveForService(serviceId: string, pricingTier: 'local' | 'overseas') {
    return this.prisma.serviceBaseCost.findUnique({
      where: { serviceId_pricingTier: { serviceId, pricingTier } },
    });
  }
}
