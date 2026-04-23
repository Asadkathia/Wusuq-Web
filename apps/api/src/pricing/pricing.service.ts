import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { ResolvePricingDto } from './dto/resolve-pricing.dto';
import { UpdatePricingSettingsDto } from './dto/pricing-settings.dto';

const PUNJAB_NAMES = new Set(['Punjab']);

function deriveRegion(province?: string): 'Punjab' | 'other' | undefined {
  if (!province) return undefined;
  return PUNJAB_NAMES.has(province) ? 'Punjab' : 'other';
}

// Federal Shariat Court uses High Court pricing
function normalizeCourtLevel(courtLevel?: string): string | undefined {
  if (courtLevel === 'Federal Shariat Court') return 'High Court';
  return courtLevel;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Rules CRUD ──────────────────────────────────────────────────────────────

  list() {
    return this.prisma.pricingRule.findMany({
      orderBy: [{ isLegacy: 'desc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  create(dto: CreatePricingRuleDto) {
    return this.prisma.pricingRule.create({
      data: {
        name: dto.name,
        flow: dto.flow,
        courtLevel: dto.courtLevel ?? null,
        caseStatus: dto.caseStatus ?? null,
        yearFrom: dto.yearFrom ?? null,
        yearTo: dto.yearTo ?? null,
        setType: dto.setType ?? null,
        region: dto.region ?? null,
        isLegacy: dto.isLegacy ?? false,
        basePrice: dto.basePrice,
        attestedPricePerSet: dto.attestedPricePerSet,
        nonAttestedPricePerSet: dto.nonAttestedPricePerSet,
        deliveryCharge: dto.deliveryCharge,
        priority: dto.priority,
        isActive: dto.isActive ?? true,
      },
    });
  }

  update(id: string, dto: UpdatePricingRuleDto) {
    return this.prisma.pricingRule.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.pricingRule.delete({ where: { id } });
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  async getSettings() {
    return this.prisma.pricingSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', pricingMode: 'legacy', attestedPricePerSet: 0, nonAttestedPricePerSet: 0 },
      update: {},
    });
  }

  async updateSettings(dto: UpdatePricingSettingsDto) {
    return this.prisma.pricingSettings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        pricingMode: dto.pricingMode ?? 'legacy',
        attestedPricePerSet: dto.attestedPricePerSet ?? 0,
        nonAttestedPricePerSet: dto.nonAttestedPricePerSet ?? 0,
      },
      update: {
        ...(dto.pricingMode !== undefined ? { pricingMode: dto.pricingMode } : {}),
        ...(dto.attestedPricePerSet !== undefined ? { attestedPricePerSet: dto.attestedPricePerSet } : {}),
        ...(dto.nonAttestedPricePerSet !== undefined ? { nonAttestedPricePerSet: dto.nonAttestedPricePerSet } : {}),
      },
    });
  }

  // ── Resolver ────────────────────────────────────────────────────────────────

  async resolve(dto: ResolvePricingDto): Promise<{
    matched: boolean;
    ruleId?: string;
    basePrice: number;
    attestedCharge: number;
    nonAttestedCharge: number;
    deliveryCharge: number;
    serviceCost: number;
    total: number;
  }> {
    const settings = await this.getSettings();
    const year = dto.caseYear ?? new Date().getFullYear();
    const attestedQty = dto.attestedQty ?? 0;
    const nonAttestedQty = dto.nonAttestedQty ?? 0;

    // Derive region from province; if province is absent, look it up from city name
    let province = dto.province;
    if (!province && dto.city) {
      const cityRecord = await this.prisma.geoCity.findFirst({
        where: { name: { equals: dto.city, mode: 'insensitive' } },
        include: { district: { include: { province: true } } },
      });
      province = cityRecord?.district?.province?.name;
    }
    const region = dto.region ?? deriveRegion(province);

    // Map Federal Shariat Court → High Court
    const effectiveCourtLevel = normalizeCourtLevel(dto.courtLevel);

    const allRules = await this.prisma.pricingRule.findMany({ where: { isActive: true } });

    // Filter by pricingMode: legacy mode uses isLegacy=true rules, custom uses isLegacy=false
    const modeRules = allRules.filter((r) =>
      settings.pricingMode === 'legacy' ? r.isLegacy === true : r.isLegacy === false,
    );

    const candidates = modeRules.filter((r) => {
      if (r.flow !== dto.flow) return false;
      if (r.courtLevel && r.courtLevel !== effectiveCourtLevel) return false;
      if (r.caseStatus && r.caseStatus !== dto.caseStatus) return false;
      if (r.region && r.region !== region) return false;
      if (r.yearFrom !== null && year < r.yearFrom) return false;
      if (r.yearTo !== null && year > r.yearTo) return false;
      if (r.setType && r.setType !== dto.setType) return false;
      return true;
    });

    if (!candidates.length) {
      return { matched: false, basePrice: 0, attestedCharge: 0, nonAttestedCharge: 0, deliveryCharge: 0, serviceCost: 0, total: 0 };
    }

    const best = candidates.reduce((a, b) => (a.priority >= b.priority ? a : b));

    const basePrice = Number(best.basePrice);
    // Per-set rates from rule are overridden by global settings
    const globalAttestedRate = Number(settings.attestedPricePerSet);
    const globalNonAttestedRate = Number(settings.nonAttestedPricePerSet);
    const attestedCharge = globalAttestedRate * attestedQty;
    const nonAttestedCharge = globalNonAttestedRate * nonAttestedQty;
    const deliveryCharge = Number(best.deliveryCharge);
    const serviceCost = basePrice + attestedCharge + nonAttestedCharge;
    const total = serviceCost + deliveryCharge;

    return { matched: true, ruleId: best.id, basePrice, attestedCharge, nonAttestedCharge, deliveryCharge, serviceCost, total };
  }
}
