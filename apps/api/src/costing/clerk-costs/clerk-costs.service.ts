import { Injectable } from '@nestjs/common';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CostingService } from '../costing.service';
import { CreateClerkCostRuleDto } from '../dto/create-clerk-cost-rule.dto';
import { ResolveCostDto } from '../dto/resolve-cost.dto';
import { UpdateClerkCostRuleDto } from '../dto/update-clerk-cost-rule.dto';

@Injectable()
export class ClerkCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly costingService: CostingService,
  ) {}

  async list() {
    return {
      items: await this.prisma.clerkCostRule.findMany({
        orderBy: { updatedAt: 'desc' },
      }),
    };
  }

  async create(
    payload: CreateClerkCostRuleDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const created = await this.prisma.clerkCostRule.create({
      data: payload,
    });

    await this.auditLogsService.create({
      action: 'CLERK_COST_RULE_CREATED',
      entity: 'CLERK_COST_RULE',
      entityId: created.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return created;
  }

  async update(
    id: string,
    payload: UpdateClerkCostRuleDto,
    actor?: { actorUserId?: string; actorEmail?: string },
  ) {
    const updated = await this.prisma.clerkCostRule.update({
      where: { id },
      data: payload,
    });

    await this.auditLogsService.create({
      action: 'CLERK_COST_RULE_UPDATED',
      entity: 'CLERK_COST_RULE',
      entityId: updated.id,
      actorUserId: actor?.actorUserId,
      actorEmail: actor?.actorEmail,
    });

    return updated;
  }

  resolve(payload: ResolveCostDto) {
    return this.costingService.resolveClerkCost(payload);
  }
}
