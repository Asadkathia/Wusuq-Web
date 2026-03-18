import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResolveCostDto } from './dto/resolve-cost.dto';

type ResolvedCost = {
  amount: number;
  ruleId?: string;
};

@Injectable()
export class CostingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveServiceCost(input: ResolveCostDto): Promise<ResolvedCost> {
    const year = input.year ?? new Date().getFullYear();

    const rules = await this.prisma.serviceCostRule.findMany({
      where: {
        isActive: true,
        serviceId: input.serviceId,
        category: input.category,
        yearFrom: { lte: year },
        yearTo: { gte: year },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const matched = this.pickBestRule(rules, {
      caseType: input.caseType,
      province: input.province,
      audience: input.audience,
    });

    return {
      amount: Number(matched?.amount ?? 0),
      ruleId: matched?.id,
    };
  }

  async resolveClerkCost(input: ResolveCostDto): Promise<ResolvedCost> {
    const year = input.year ?? new Date().getFullYear();

    const rules = await this.prisma.clerkCostRule.findMany({
      where: {
        isActive: true,
        serviceId: input.serviceId,
        category: input.category,
        yearFrom: { lte: year },
        yearTo: { gte: year },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const matched = this.pickBestRule(rules, {
      caseType: input.caseType,
      province: input.province,
    });

    return {
      amount: Number(matched?.amount ?? 0),
      ruleId: matched?.id,
    };
  }

  private pickBestRule<
    T extends {
      caseType: string | null;
      province: string | null;
      audience?: string | null;
    },
  >(
    rules: T[],
    input: { caseType?: string; province?: string; audience?: string },
  ) {
    let best: T | undefined;
    let bestScore = -1;

    for (const rule of rules) {
      if (rule.caseType && input.caseType && rule.caseType !== input.caseType)
        continue;
      if (rule.province && input.province && rule.province !== input.province)
        continue;

      if (rule.caseType && !input.caseType) continue;
      if (rule.province && !input.province) continue;

      if ('audience' in rule) {
        const audience = (rule as { audience?: string | null }).audience;
        if (audience && input.audience && audience !== input.audience) continue;
        if (audience && !input.audience) continue;
      }

      const score =
        (rule.caseType ? 1 : 0) +
        (rule.province ? 1 : 0) +
        ('audience' in rule && (rule as { audience?: string | null }).audience
          ? 1
          : 0);

      if (score > bestScore) {
        best = rule;
        bestScore = score;
      }
    }

    return best;
  }
}
