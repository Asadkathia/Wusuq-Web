import { Injectable } from '@nestjs/common';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CostingService } from '../costing.service';
import { CreateServiceCostRuleDto } from '../dto/create-service-cost-rule.dto';
import { ResolveCostDto } from '../dto/resolve-cost.dto';
import { UpdateServiceCostRuleDto } from '../dto/update-service-cost-rule.dto';

@Injectable()
export class ServiceCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly costingService: CostingService,
  ) {}

  async list() {
    return {
      items: await this.prisma.serviceCostRule.findMany({
        orderBy: { updatedAt: 'desc' },
      }),
    };
  }

  async create(
    payload: CreateServiceCostRuleDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const created = await this.prisma.serviceCostRule.create({
      data: payload,
    });

    await this.auditLogsService.create({
      action: 'SERVICE_COST_RULE_CREATED',
      entity: 'SERVICE_COST_RULE',
      entityId: created.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return created;
  }

  async update(
    id: string,
    payload: UpdateServiceCostRuleDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const updated = await this.prisma.serviceCostRule.update({
      where: { id },
      data: payload,
    });

    await this.auditLogsService.create({
      action: 'SERVICE_COST_RULE_UPDATED',
      entity: 'SERVICE_COST_RULE',
      entityId: updated.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return updated;
  }

  resolve(payload: ResolveCostDto) {
    return this.costingService.resolveServiceCost(payload);
  }
}
