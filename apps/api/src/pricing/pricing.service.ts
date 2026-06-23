import { Injectable } from '@nestjs/common';
import {
  deriveYearBand,
  chargeCapabilitiesFor,
  paymentModelFor,
  computeCaseSearchBase,
  computeDecidedAgeSurcharge,
} from '@wusuq/shared';

// Re-export for back-compat: existing tests/importers that reference these
// from pricing.service keep working without changes.
export {
  computeCaseSearchBase,
  CASE_SEARCH_PER_YEAR_RATE,
  DECIDED_AGE_SURCHARGE_PER_YEAR,
  DECIDED_AGE_THRESHOLD_YEARS,
} from '@wusuq/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { ResolvePricingDto } from './dto/resolve-pricing.dto';
import { UpdatePricingSettingsDto } from './dto/pricing-settings.dto';

// Case Information document-bundle base fee now lives in @wusuq/shared (single
// source shared with the wizard's bundle picker). Re-exported here so existing
// importers (case-info-bundle.spec.ts) keep working.
export { caseInfoBundleBase, CASE_INFO_BUNDLE_BASE } from '@wusuq/shared';
// Non-judicial flat base rates (owner 2026-06-12) — re-exported so the seed
// and tests share one source. Used by seed-pricing.ts, not the resolver
// directly (the resolver reads the seeded PricingRule rows).
export { NON_JUDICIAL_BASE_RATES } from '@wusuq/shared';
import { caseInfoBundleBase } from '@wusuq/shared';

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

function deriveRegion(province?: string): 'Punjab' | 'other' | undefined {
  if (!province) return undefined;
  return PUNJAB_NAMES.has(province) ? 'Punjab' : 'other';
}

// Delivery exists ONLY for physical-document services — the flows that hand the
// consumer a physical document on completion (Case Files + the three
// non-judicial copies). That set is exactly the flows whose charge capabilities
// include `delivery`, so we gate on that single source of truth rather than a
// second hardcoded list. Digital flows (Case Information / Search / Filing /
// Power of Attorney) never carry a delivery-guy fee or static delivery charge.
// For these physical flows delivery is collected in the phase-2 (clerk-
// finalized) remainder, not at intake — see SPLIT handling in
// TicketsService.createIntakeTicket.
function isPhysicalDeliveryFlow(flow: string): boolean {
  return chargeCapabilitiesFor(flow).delivery;
}

// Federal Shariat Court historically reused High Court pricing in the legacy
// model. With pricing engine v2 we have explicit rules for FSC, so the
// normalization is gated to courts that lack rules in the new dataset.
function normalizeCourtLevel(courtLevel?: string): string | undefined {
  return courtLevel;
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

  // Resolve the province NAME for a request, used only to derive the pricing
  // region (Punjab vs other). Prefers an explicit province, then a reliable
  // GeoCity-id FK join, and only falls back to fragile city-NAME matching.
  //
  // 5-24-26 #26 root cause: region was derived solely by matching the free-text
  // `city` against GeoCity.name. Court-seat labels that don't exactly match a
  // GeoCity row (common outside Punjab) left region=undefined, and the strict
  // `if (r.region && r.region !== region)` filter then discarded EVERY
  // region-keyed rule → "No pricing rule matched". Looking up by the selected
  // city id removes that whole class of misses.
  private async deriveProvinceName(opts: {
    province?: string;
    cityId?: string;
    city?: string;
  }): Promise<string | undefined> {
    if (opts.province) return opts.province;
    if (opts.cityId) {
      const byId = await this.prisma.geoCity.findUnique({
        where: { id: opts.cityId },
        include: { district: { include: { province: true } } },
      });
      const name = byId?.district?.province?.name;
      if (name) return name;
    }
    if (opts.city) {
      const byName = await this.prisma.geoCity.findFirst({
        where: { name: { equals: opts.city, mode: 'insensitive' } },
        include: { district: { include: { province: true } } },
      });
      return byName?.district?.province?.name;
    }
    return undefined;
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
    cityId?: string;
    city?: string;
    currency?: string;
    options: string[];
  }): Promise<Record<string, boolean>> {
    const settings = await this.getSettings();

    // Derive region from province / city id / city name (in that order).
    const province = await this.deriveProvinceName({
      province: args.province,
      cityId: args.cityId,
      city: args.city,
    });
    const region = args.region ?? deriveRegion(province);
    // Billing currency: 'USD' matches the flat international rules, else PKR.
    const currency = (args.currency as 'PKR' | 'USD') ?? 'PKR';
    const effectiveCourtLevel = normalizeCourtLevel(args.courtLevel);
    // Mirror resolve(): a pending case without an explicit band must resolve to
    // the 'pending' band, not 'current'.
    const requestedYearBand =
      args.yearBand ?? deriveYearBand(args.caseStatus, undefined);

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
        if ((r.currency ?? 'PKR') !== currency) return false;
        if (r.courtLevel && r.courtLevel !== effectiveCourtLevel) return false;
        if (r.caseStatus && r.caseStatus !== args.caseStatus) return false;
        if (r.region && r.region !== region) return false;
        if (r.yearBand && r.yearBand !== yearBand) return false;
        if (r.setType !== opt) return false;
        return true;
      });

    // setType-null fallback lookup: used when the flow's pricing isn't keyed
    // on set type (e.g. judicial_case_search) so the wizard's set-type picker
    // doesn't show all options as unavailable. Mirrors the same fallback in
    // `resolve()` below.
    const lookupNullSetType = (yearBand: string) =>
      flowRules.filter((r) => {
        if ((r.currency ?? 'PKR') !== currency) return false;
        if (r.courtLevel && r.courtLevel !== effectiveCourtLevel) return false;
        if (r.caseStatus && r.caseStatus !== args.caseStatus) return false;
        if (r.region && r.region !== region) return false;
        if (r.yearBand && r.yearBand !== yearBand) return false;
        if (r.setType) return false;
        return true;
      });

    const result: Record<string, boolean> = {};
    for (const opt of args.options) {
      let candidates = lookup(opt, requestedYearBand);
      if (!candidates.length && requestedYearBand !== 'current') {
        candidates = lookup(opt, 'current');
      }
      // 5-19-26 bug #3: setType-null fallback — when a flow has no
      // setType-specific rules at all, treat all set-type options as available
      // (the wizard collects the choice for downstream record-keeping but the
      // price comes from the setType=null rule).
      if (!candidates.length) {
        const nullSetTypeRules =
          lookupNullSetType(requestedYearBand).length ||
          lookupNullSetType('current').length;
        if (nullSetTypeRules) {
          result[opt] = true;
          continue;
        }
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
    // 5-24-26 #6/#7: Case Information document-bundle add-on (region-keyed),
    // added on top of the base fee. Zero for every other flow.
    bundleSurcharge: number;
    // PDF #37: Rs 1,000 surcharge added per city when search_method === 'both'
    // for `judicial_case_search`. Zero for every other flow.
    searchBothSurcharge: number;
    // PDF #36: multi-city multiplier applied to Case Search totals. Equal to
    // the number of cities the consumer picked (>=1). Always 1 for other flows.
    cityCount: number;
    clerkRateOverride?: { attested?: number; nonAttested?: number };
    clerkBaseCost?: number | null;
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

    // Derive region from province / city id / city name (in that order).
    const province = await this.deriveProvinceName({
      province: dto.province,
      cityId: dto.cityId,
      city: dto.city,
    });
    const region = dto.region ?? deriveRegion(province);
    // Billing currency: 'USD' matches the flat international rules, else PKR.
    const currency = (dto.currency as 'PKR' | 'USD') ?? 'PKR';

    const effectiveCourtLevel = normalizeCourtLevel(dto.courtLevel);
    // USD price rows are flat and carry setType=null (international rates don't
    // vary by attested/non-attested), but the wizard always sends set_type for
    // Case Files. Ignoring set type for USD makes the STRICT match land on the
    // exact (currency, region, courtLevel, flow, yearBand) row instead of
    // falling through to the setType-null fallback, which admits the 'current'
    // band too and picks order-dependently (wrong, non-deterministic price).
    const requestedSetType = currency === 'USD' ? null : (dto.setType ?? null);
    // Derive the band from caseStatus + caseYear when the caller didn't pass an
    // explicit yearBand. Critical: deriveYearBand returns 'pending' for Pending
    // cases — without consulting caseStatus a pending ticket would fall to the
    // 'current' band and be charged the wrong (higher) Case Files rate. This is
    // the root-cause fix for the 2026-06 "quote ≠ charge" pending overcharge:
    // createIntakeTicket now passes a full input via buildPricingResolveInput,
    // but deriving here too keeps any caller that omits yearBand correct.
    const requestedYearBand =
      dto.yearBand ?? deriveYearBand(dto.caseStatus, dto.caseYear);

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
      if ((r.currency ?? 'PKR') !== currency) return false;
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
        if ((r.currency ?? 'PKR') !== currency) return false;
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

    // 5-19-26 bug #3: setType fallback. Some flows (e.g. judicial_case_search)
    // expose the set-type picker in the wizard for UX continuity but their
    // pricing isn't keyed on set type — the DB only has `setType=null` rules.
    // Without this fallback, picking Attested on Case Search makes the
    // resolver return "no match" and the consumer sees a blank checkout
    // despite valid inputs. Try again with setType=null at both the
    // requested band and the current-band fallback.
    if (!candidates.length && requestedSetType) {
      candidates = flowRules.filter((r) => {
        if ((r.currency ?? 'PKR') !== currency) return false;
        if (r.courtLevel && r.courtLevel !== effectiveCourtLevel) return false;
        if (r.caseStatus && r.caseStatus !== dto.caseStatus) return false;
        if (r.region && r.region !== region) return false;
        if (
          r.yearBand &&
          r.yearBand !== requestedYearBand &&
          r.yearBand !== 'current'
        )
          return false;
        if (r.setType) return false;
        return true;
      });
    }

    // Backwards-compat fallback: if no candidates and the rule set still uses
    // legacy yearFrom/yearTo only, retry without yearBand match.
    if (!candidates.length) {
      candidates = flowRules.filter((r) => {
        if ((r.currency ?? 'PKR') !== currency) return false;
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
        bundleSurcharge: 0,
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
        bundleSurcharge: 0,
        searchBothSurcharge: 0,
        cityCount: 1,
        attestedCharge: 0,
        nonAttestedCharge: 0,
        deliveryCharge: 0,
        serviceCost: 0,
        total: 0,
      };
    }

    // USD orders are all-inclusive flat: the matched rule's basePrice IS the
    // total. No PDF/delivery/attestation/title/age/search-both/per-year/
    // per-city/bundle math, and ONE_TIME (no clerk phase-2 remainder). The
    // currency filter above guarantees `best` is a USD rule here.
    if (currency === 'USD') {
      const flat = Number(best.basePrice);
      return {
        matched: true,
        available: true,
        rulesExistForFlow: true,
        ruleId: best.id,
        yearBand: best.yearBand,
        setType: best.setType,
        basePrice: flat,
        base: flat,
        pdfSurcharge: 0,
        deliveryFee: 0,
        titleSurcharge: 0,
        ageSurcharge: 0,
        bundleSurcharge: 0,
        searchBothSurcharge: 0,
        cityCount: 1,
        clerkBaseCost: null,
        attestedCharge: 0,
        nonAttestedCharge: 0,
        deliveryCharge: 0,
        serviceCost: flat,
        total: flat,
      };
    }

    // 2026-06 #4/#5: For Case Information the chosen document bundle IS the
    // base fee (region-keyed) — it replaces the seeded base, and there is no
    // separate "Document bundle" line. Falls back to the seeded base before a
    // bundle is picked; returns the seeded base for every other flow
    // (caseInfoBundleBase yields 0 outside Case Information).
    const caseInfoBase = caseInfoBundleBase(dto.flow, region, dto.docBundle);
    // Owner 2026-06: Case Search replaces the seeded base with an age-derived
    // per-year base (Rs 2,000 × years of age). Other flows keep the Case
    // Information bundle base (when set) or the seeded rule base.
    const isCaseSearch = dto.flow === 'judicial_case_search';
    const basePrice = isCaseSearch
      ? computeCaseSearchBase(dto.caseYear)
      : caseInfoBase > 0
        ? caseInfoBase
        : Number(best.basePrice);

    // Per-set rates from rule are overridden by global settings, which are
    // themselves overridden by a clerk-side report when one exists for the
    // ticket (M5.5).
    // 2026-05-23: attestation / non-attestation are phase-2 charges entered by
    // the clerk and marked up by the super admin at finalize. Their global
    // default rates (PricingSettings) are VOID — never applied to the consumer's
    // intake/checkout price. A clerk-side report, if one exists, may still
    // override below; absent that, these stay 0.
    let effectiveAttestedRate = 0;
    let effectiveNonAttestedRate = 0;
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
    // Delivery applies ONLY to physical-document flows (Case Files). Every
    // other service is digital and never incurs a delivery fee or the rule's
    // static delivery charge. 'portal' / 'whatsapp' / 'other_no' / 'pickup' /
    // 'none' are non-physical delivery modes (no fee even for Case Files).
    const physicalDeliveryFlow = isPhysicalDeliveryFlow(dto.flow);
    const NON_PHYSICAL_DELIVERY = new Set([
      'pickup',
      'none',
      'portal',
      'whatsapp',
      'other_no',
    ]);
    const deliveryNeeded =
      physicalDeliveryFlow &&
      dto.deliveryMethod != null &&
      dto.deliveryMethod !== '' &&
      !NON_PHYSICAL_DELIVERY.has(dto.deliveryMethod.toLowerCase());
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
    // Case Search's per-year base already encodes age (Rs 2,000/yr); suppress
    // the legacy decided-age surcharge for it to avoid double-counting.
    const ageSurcharge = isCaseSearch
      ? 0
      : computeDecidedAgeSurcharge(dto.caseStatus, dto.caseYear);

    // 2026-06 #4/#5: Case Information's document bundle is folded into the base
    // fee above (see basePrice). There is no separate bundle add-on line, so
    // this stays 0 — kept for back-compat with the breakdown shape. Other
    // flows never carried a bundle surcharge.
    const bundleSurcharge = 0;

    // PDF #36 / #37 — Case Search-specific multipliers. Other flows ignore
    // both: cityCount stays 1 and searchBothSurcharge stays 0. (isCaseSearch is
    // computed above, alongside the per-year base.)
    const cityCount = isCaseSearch ? Math.max(1, dto.cityCount ?? 1) : 1;
    const searchBothSurcharge =
      isCaseSearch && dto.searchMethod === 'both' ? SEARCH_BOTH_SURCHARGE : 0;

    // Only physical-document flows (Case Files) carry the rule's static
    // delivery charge; every other flow is digital → 0.
    const staticDeliveryCharge = physicalDeliveryFlow
      ? Number(best.deliveryCharge)
      : 0;
    const deliveryCharge = staticDeliveryCharge + deliveryFee;
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
      bundleSurcharge +
      deliveryFee;
    // Attestation / non-attestation excluded — phase-2 charges, not part of the
    // resolved consumer price.
    const total = perCityBlock * cityCount + staticDeliveryCharge;
    // Phase-1 consumer base. Audit 1.2: for ONE_TIME (digital) flows this is
    // the FULL intake-billed amount — the Case Search city multiplier and
    // search-both surcharge are folded in, so serviceCost === total (digital
    // flows carry no delivery components) and every downstream component-sum
    // recompute of totalAmount (assign, finance.updateCharge) plus the
    // isBaseCovered PAID gate stay consistent with the quoted price. SPLIT
    // (physical) flows keep the un-multiplied phase-1 base: base service
    // charge + intrinsic modifiers (State-vs title surcharge, decided-age
    // surcharge, and — 5-24-26 #17 — the PDF surcharge, priced at intake).
    // Attestation / non-attestation / delivery remain phase-2 charges.
    const serviceCost =
      paymentModelFor(dto.flow) === 'ONE_TIME'
        ? perCityBlock * cityCount
        : basePrice +
          titleSurcharge +
          ageSurcharge +
          pdfSurcharge +
          bundleSurcharge;

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
      bundleSurcharge,
      searchBothSurcharge,
      cityCount,
      clerkRateOverride: clerkOverride,
      // Default internal clerk cost for this (flow × court × band) — used to
      // pre-fill the assignment dialog's clerk-cost field (override toggle).
      clerkBaseCost:
        best.clerkBaseCost != null ? Number(best.clerkBaseCost) : null,
      attestedCharge,
      nonAttestedCharge,
      deliveryCharge,
      serviceCost,
      total,
    };
  }
}
