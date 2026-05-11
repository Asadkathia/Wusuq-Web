import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type FindCaseTypesArgs = {
  courtLevel: string;
  subCourt?: string;
  district?: string;
  region?: string;
  highCourtCode?: string;
};

export type CaseTypeRow = {
  code: string;
  label: string;
  source: string;
  priority: number;
};

@Injectable()
export class CaseTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Specificity fallback chain:
   *   1. (courtLevel, subCourt, district, highCourtCode)  ← most specific
   *   2. drop district
   *   3. drop subCourt
   *   4. drop highCourtCode  ← least specific
   * Returns the first non-empty cohort. Each row carries source so callers
   * can tell scraped vs hardcoded.
   */
  async findCaseTypes(args: FindCaseTypesArgs): Promise<CaseTypeRow[]> {
    const attempts: Array<Record<string, string | null>> = [
      {
        courtLevel: args.courtLevel,
        subCourt: args.subCourt ?? null,
        district: args.district ?? null,
        highCourtCode: args.highCourtCode ?? null,
      },
      {
        courtLevel: args.courtLevel,
        subCourt: args.subCourt ?? null,
        district: null,
        highCourtCode: args.highCourtCode ?? null,
      },
      {
        courtLevel: args.courtLevel,
        subCourt: null,
        district: null,
        highCourtCode: args.highCourtCode ?? null,
      },
      {
        courtLevel: args.courtLevel,
        subCourt: null,
        district: null,
        highCourtCode: null,
      },
    ];

    for (const where of attempts) {
      const rows = await this.prisma.courtCaseType.findMany({
        where: { ...where, isActive: true },
        orderBy: [{ priority: 'desc' }, { label: 'asc' }],
        select: { code: true, label: true, source: true, priority: true },
      });
      if (rows.length > 0) return rows;
    }
    return [];
  }
}
