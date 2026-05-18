import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { ResolvePricingDto } from './dto/resolve-pricing.dto';
import { UpdatePricingSettingsDto } from './dto/pricing-settings.dto';

const PUNJAB_NAMES = new Set(['Punjab']);

// PDF #14: when the case title starts with "State vs <X>" (criminal cases
// where the state is the plaintiff) the resolver adds a flat surcharge on
// top of the rule-based price. Exported so tests can reference the constant
// directly without redefining the magic number.
export const STATE_VS_SURCHARGE = 1000;
export const STATE_VS_PATTERN = /^\s*state\s+vs\b/i;

// PDF #37: Case Search "both methods" surcharge. When the consumer picks both
// the CNIC and Case Details search tabs, an additional Rs 1,000 is added on
// top of the base per-city rate. The total then scales linearly with the
// number of cities (PDF #36).
export const SEARCH_BOTH_SURCHARGE = 1000;

// PDF #7 / QA 5-10-26: decided cases older than 10 years pick up Rs 1,000 per
// extra year on top of the rule-based price. Example: in 2026 a 2016 case
// resolves to its banded base; 2015 = base + 1,000; 2014 = base + 2,000.
// Applies only when caseStatus === 'Decided Case'. Pending and current-year
// cases get no surcharge.
export const DECIDED_AGE_SURCHARGE_PER_YEAR = 1000;
export const DECIDED_AGE_THRESHOLD_YEARS = 10;

function computeAgeSurcharge(
  caseStatus: string | undefined,
  caseYear: number | undefined,
  currentYear = new Date().getFullYear(),
): number {
  if (caseStatus !== 'Decided Case') return 0;
  if (!caseYear || caseYear >= currentYear) return 0;
  const age = currentYear - caseYear;
  const extra = age - DECIDED_AGE_THRESHOLD_YEARS;
  if (extra <= 0) return 0;
  return extra * DECIDED_AGE_SURCHARGE_PER_YEAR;
}

function deriveRegion(province?: string): 'Punjab' | 'other' | undefined {
  if (!province) return undefined;
  return PUNJAB_NAMES.has(province) ? 'Punjab' : 'other';
}

// Federal Shariat Court historically reused High Court pricing in the legacy
// model. With pricing engine v2 we have explicit rules for FSC, so the
// normalization is gated to courts that lack rules in the new dataset.
function normalizeCourtLevel(courtLevel?: string): string | undefined {
  return courtLevel;
}

const YEAR_BANDS: { key: string; from: number | null; to: number | null }[] = [
  // Pending cases never resolve from caseYear — explicit only.
  { key: 'y2016_back', from: null, to: 2016 },
  { key: 'y2019_2017', from: 2017, to: 2019 },
  { key: 'y2022_2020', from: 2020, to: 2022 },
  { key: 'y2024_2023', from: 2023, to: 2024 },
  { key: 'y2025', from: 2025, to: 2025 },
];

function deriveYearBand(year: number | undefined): string {
  if (!year) return 'current';
  if (year >= new Date().getFullYear()) return 'current';
  for (const b of YEAR_BANDS) {
    if (b.from !== null && year < b.from) continue;
    if (b.to !== null && year > b.to) continue;
    return b.key;
  }
  return 'current';
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Rules CRUD ──────────────────────────────────────────────────────────────

  list() {
    return this.prisma.pricingRule.findMany({
      orderBy: [
        { isLegacy: 'desc' },
        { priority: 'desc' },
        { updatedAt: 'desc' },
      ],
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
      create: {
        id: 'singleton',
        pricingMode: 'legacy',
        attestedPricePerSet: 0,
        nonAttestedPricePerSet: 0,
      },
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
        ...(dto.pricingMode !== undefined
          ? { pricingMode: dto.pricingMode }
          : {}),
        ...(dto.attestedPricePerSet !== undefined
          ? { attestedPricePerSet: dto.attestedPricePerSet }
          : {}),
        ...(dto.nonAttestedPricePerSet !== undefined
          ? { nonAttestedPricePerSet: dto.nonAttestedPricePerSet }
          : {}),
      },
    });
  }

  // ── Availability (per set-type) ────────────────────────────────────────────
  //
  // Returns a {option → boolean} map indicating, for the given
  // (city/province/court_level/flow/yearBand) tuple, whether each set-type
  // option is purchasable (i.e. matches an active PricingRule with
  // availability=true). The wizard uses this to disable "Can't Get"
  // combinations in the Set Type picker without N+1 round trips.
  async availabilityFor(args: {
    flow: string;
    courtLevel?: string;
    caseStatus?: string;
    yearBand?: string;
    region?: string;
    province?: string;
    city?: string;
    options: string[];
  }): Promise<Record<string, boolean>> {
    const settings = await this.getSettings();

    // Derive region from province / city when not provided.
    let province = args.province;
    if (!province && args.city) {
      const cityRecord = await this.prisma.geoCity.findFirst({
        where: { name: { equals: args.city, mode: 'insensitive' } },
        include: { district: { include: { province: true } } },
      });
      province = cityRecord?.district?.province?.name;
    }
    const region = args.region ?? deriveRegion(province);
    const effectiveCourtLevel = normalizeCourtLevel(args.courtLevel);
    const requestedYearBand = args.yearBand ?? 'current';

    const allRules = await this.prisma.pricingRule.findMany({
      where: { isActive: true },
    });
    const modeRules = allRules.filter((r) =>
      settings.pricingMode === 'legacy'
        ? r.isLegacy === true
        : r.isLegacy === false,
    );
    const flowRules = modeRules.filter((r) => r.flow === args.flow);

    // QA fix: the wizard sends yearBand='pending' for any Pending Case, but
    // the seed only carries `pending` rows for region='Punjab' — outside
    // Punjab there are no pending-band set-type rules, only `current` and
    // the historical bands. Without a fallback the consumer sees all 3
    // set-type options flagged "unavailable at this court tier" and is
    // stuck on a required field they can't satisfy. We retry the lookup
    // with yearBand='current' when the requested band yields zero candidates,
    // which mirrors the resolver's `deriveYearBand(undefined) === 'current'`
    // contract for pending cases that have no decided year.
    const lookup = (opt: string, yearBand: string) =>
      flowRules.filter((r) => {
        if (r.courtLevel && r.courtLevel !== effectiveCourtLevel) return false;
        if (r.caseStatus && r.caseStatus !== args.caseStatus) return false;
        if (r.region && r.region !== region) return false;
        if (r.yearBand && r.yearBand !== yearBand) return false;
        if (r.setType !== opt) return false;
        return true;
      });

    const result: Record<string, boolean> = {};
    for (const opt of args.options) {
      let candidates = lookup(opt, requestedYearBand);
      if (!candidates.length && requestedYearBand !== 'current') {
        candidates = lookup(opt, 'current');
      }
      if (!candidates.length) {
        // No matching rule even after the fallback — treat as unavailable so
        // the wizard surfaces a clear signal instead of letting the user
        // pick a combo that resolves to 0.
        result[opt] = false;
        continue;
      }
      const best = candidates.reduce((a, b) =>
        a.priority >= b.priority ? a : b,
      );
      result[opt] = best.availability !== false;
    }
    return result;
  }

  // ── Resolver ────────────────────────────────────────────────────────────────

  async resolve(dto: ResolvePricingDto): Promise<{
    matched: boolean;
    available?: boolean;
    reason?: string;
    // `true` when active rules exist for this flow but none matched the
    // supplied criteria — i.e. a misconfiguration, not a free flow. Callers
    // should fail intake when this is set.
    rulesExistForFlow: boolean;
    ruleId?: string;
    yearBand?: string | null;
    setType?: string | null;
    basePrice: number;
    base: number;
    pdfSurcharge: number;
    deliveryFee: number;
    titleSurcharge: number;
    // PDF #7 / QA 5-10-26: Rs 1,000/year surcharge on Decided cases beyond
    // 10 years old. Zero for pending and current-year cases.
    ageSurcharge: number;
    // PDF #37: Rs 1,000 surcharge added per city when search_method === 'both'
    // for `judicial_case_search`. Zero for every other flow.
    searchBothSurcharge: number;
    // PDF #36: multi-city multiplier applied to Case Search totals. Equal to
    // the number of cities the consumer picked (>=1). Always 1 for other flows.
    cityCount: number;
    clerkRateOverride?: { attested?: number; nonAttested?: number };
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

    const effectiveCourtLevel = normalizeCourtLevel(dto.courtLevel);
    const requestedSetType = dto.setType ?? null;
    const requestedYearBand = dto.yearBand ?? deriveYearBand(dto.caseYear);

    const allRules = await this.prisma.pricingRule.findMany({
      where: { isActive: true },
    });

    // Filter by pricingMode: legacy mode uses isLegacy=true rules, custom uses isLegacy=false
    const modeRules = allRules.filter((r) =>
      settings.pricingMode === 'legacy'
        ? r.isLegacy === true
        : r.isLegacy === false,
    );

    const flowRules = modeRules.filter((r) => r.flow === dto.flow);

    // Strict match on v2 dimensions when present.
    let candidates = flowRules.filter((r) => {
      if (r.courtLevel && r.courtLevel !== effectiveCourtLevel) return false;
      if (r.caseStatus && r.caseStatus !== dto.caseStatus) return false;
      if (r.region && r.region !== region) return false;
      if (r.yearBand && r.yearBand !== requestedYearBand) return false;
      // setType: when caller asks for a specific set type, only match rules
      // that specify that set type. When caller asks for null (no set type),
      // match rules with null setType.
      if (requestedSetType) {
        if (r.setType !== requestedSetType) return false;
      } else {
        if (r.setType) return false;
      }
      return true;
    });

    // QA fix: the seed only carries `pending` yearBand rows for region='Punjab'.
    // For Pending Cases outside Punjab the strict match above finds nothing,
    // which would block the wizard with a misleading "unavailable" message.
    // Fall back to the `current` band, which mirrors the wizard's implicit
    // contract for cases without a decided year. Keep this BEFORE the legacy
    // yearFrom/yearTo fallback so the v2 dimensions still take priority.
    if (!candidates.length && requestedYearBand !== 'current') {
      candidates = flowRules.filter((r) => {
        if (r.courtLevel && r.courtLevel !== effectiveCourtLevel) return false;
        if (r.caseStatus && r.caseStatus !== dto.caseStatus) return false;
        if (r.region && r.region !== region) return false;
        if (r.yearBand && r.yearBand !== 'current') return false;
        if (requestedSetType) {
          if (r.setType !== requestedSetType) return false;
        } else {
          if (r.setType) return false;
        }
        return true;
      });
    }

    // Backwards-compat fallback: if no candidates and the rule set still uses
    // legacy yearFrom/yearTo only, retry without yearBand match.
    if (!candidates.length) {
      candidates = flowRules.filter((r) => {
        if (r.courtLevel && r.courtLevel !== effectiveCourtLevel) return false;
        if (r.caseStatus && r.caseStatus !== dto.caseStatus) return false;
        if (r.region && r.region !== region) return false;
        if (r.yearFrom !== null && year < r.yearFrom) return false;
        if (r.yearTo !== null && year > r.yearTo) return false;
        if (r.setType && r.setType !== requestedSetType) return false;
        return true;
      });
    }

    if (!candidates.length) {
      return {
        matched: false,
        rulesExistForFlow: flowRules.length > 0,
        basePrice: 0,
        base: 0,
        pdfSurcharge: 0,
        deliveryFee: 0,
        titleSurcharge: 0,
        ageSurcharge: 0,
        searchBothSurcharge: 0,
        cityCount: 1,
        attestedCharge: 0,
        nonAttestedCharge: 0,
        deliveryCharge: 0,
        serviceCost: 0,
        total: 0,
      };
    }

    const best = candidates.reduce((a, b) =>
      a.priority >= b.priority ? a : b,
    );

    if (best.availability === false) {
      return {
        matched: true,
        available: false,
        reason: 'Service not available for this combination',
        rulesExistForFlow: true,
        ruleId: best.id,
        yearBand: best.yearBand,
        setType: best.setType,
        basePrice: 0,
        base: 0,
        pdfSurcharge: 0,
        deliveryFee: 0,
        titleSurcharge: 0,
        ageSurcharge: 0,
        searchBothSurcharge: 0,
        cityCount: 1,
        attestedCharge: 0,
        nonAttestedCharge: 0,
        deliveryCharge: 0,
        serviceCost: 0,
        total: 0,
      };
    }

    const basePrice = Number(best.basePrice);

    // Per-set rates from rule are overridden by global settings, which are
    // themselves overridden by a clerk-side report when one exists for the
    // ticket (M5.5).
    const globalAttestedRate = Number(settings.attestedPricePerSet);
    const globalNonAttestedRate = Number(settings.nonAttestedPricePerSet);

    let effectiveAttestedRate = globalAttestedRate;
    let effectiveNonAttestedRate = globalNonAttestedRate;
    let clerkOverride: { attested?: number; nonAttested?: number } | undefined;
    if (dto.ticketId) {
      const report = await this.prisma.ticketClerkReport.findUnique({
        where: { ticketId: dto.ticketId },
      });
      if (report?.perPageRateAttested != null) {
        effectiveAttestedRate = Number(report.perPageRateAttested);
        clerkOverride = {
          ...(clerkOverride ?? {}),
          attested: effectiveAttestedRate,
        };
      }
      if (report?.perPageRateNonAttested != null) {
        effectiveNonAttestedRate = Number(report.perPageRateNonAttested);
        clerkOverride = {
          ...(clerkOverride ?? {}),
          nonAttested: effectiveNonAttestedRate,
        };
      }
    }

    const attestedCharge = effectiveAttestedRate * attestedQty;
    const nonAttestedCharge = effectiveNonAttestedRate * nonAttestedQty;

    // v2 surcharges: PDF + Delivery Guy fee (flat per-rule).
    const wantPdf = dto.wantPdf === true;
    const deliveryNeeded =
      dto.deliveryMethod != null &&
      dto.deliveryMethod !== '' &&
      dto.deliveryMethod.toLowerCase() !== 'pickup' &&
      dto.deliveryMethod.toLowerCase() !== 'none';
    const pdfSurcharge = wantPdf ? Number(best.pdfSurchargeAmount ?? 0) : 0;
    const deliveryFee = deliveryNeeded ? Number(best.deliveryGuyFee ?? 0) : 0;
    // PDF #14: flat Rs 1,000 add-on when the case title is "State vs <X>".
    // Universal — doesn't depend on court tier or year band, so it lives in
    // the resolver as a constant rather than as a PricingRule row.
    const titleSurcharge =
      dto.caseTitle && STATE_VS_PATTERN.test(dto.caseTitle)
        ? STATE_VS_SURCHARGE
        : 0;

    // PDF #7: Decided cases beyond 10 years old accrue Rs 1,000/year on top
    // of the banded rule. Lives in the resolver as a derived surcharge so the
    // pricing sheet only needs the banded rules — no per-year rows.
    const ageSurcharge = computeAgeSurcharge(dto.caseStatus, dto.caseYear);

    // PDF #36 / #37 — Case Search-specific multipliers. Other flows ignore
    // both: cityCount stays 1 and searchBothSurcharge stays 0.
    const isCaseSearch = dto.flow === 'judicial_case_search';
    const cityCount = isCaseSearch ? Math.max(1, dto.cityCount ?? 1) : 1;
    const searchBothSurcharge =
      isCaseSearch && dto.searchMethod === 'both' ? SEARCH_BOTH_SURCHARGE : 0;

    const deliveryCharge = Number(best.deliveryCharge) + deliveryFee;
    const serviceCost =
      basePrice +
      attestedCharge +
      nonAttestedCharge +
      pdfSurcharge +
      titleSurcharge +
      ageSurcharge;
    // For Case Search the per-city block (base + searchBoth + title + pdf +
    // deliveryFee + ageSurcharge) is multiplied by the city count. Per-set
    // rates and the rule's flat deliveryCharge are NOT multiplied — they're
    // already per-ticket. Other flows degenerate to the original formula
    // (cityCount=1, searchBothSurcharge=0).
    const perCityBlock =
      basePrice +
      searchBothSurcharge +
      titleSurcharge +
      ageSurcharge +
      pdfSurcharge +
      deliveryFee;
    const total =
      perCityBlock * cityCount +
      attestedCharge +
      nonAttestedCharge +
      Number(best.deliveryCharge);

    return {
      matched: true,
      available: true,
      rulesExistForFlow: true,
      ruleId: best.id,
      yearBand: best.yearBand,
      setType: best.setType,
      basePrice,
      base: basePrice,
      pdfSurcharge,
      deliveryFee,
      titleSurcharge,
      ageSurcharge,
      searchBothSurcharge,
      cityCount,
      clerkRateOverride: clerkOverride,
      attestedCharge,
      nonAttestedCharge,
      deliveryCharge,
      serviceCost,
      total,
    };
  }
}
