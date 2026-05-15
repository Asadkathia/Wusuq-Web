import { CaseTypesService } from './case-types.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('CaseTypesService', () => {
  const mkPrisma = (rows: any[]) =>
    ({
      courtCaseType: {
        findMany: jest.fn(async (args: any) => {
          const matched = rows.filter((r) => {
            for (const [k, v] of Object.entries(args.where ?? {})) {
              if (k === 'isActive') continue;
              if (v === null && r[k] != null) return false;
              if (v !== null && v !== undefined && r[k] !== v) return false;
            }
            return true;
          });
          const orderBy = args.orderBy ?? [];
          return matched.sort((a, b) => {
            for (const clause of orderBy) {
              const [k, dir] = Object.entries(clause)[0] as [
                string,
                'asc' | 'desc',
              ];
              if (a[k] === b[k]) continue;
              const cmp = a[k] < b[k] ? -1 : 1;
              return dir === 'desc' ? -cmp : cmp;
            }
            return 0;
          });
        }),
      },
    }) as unknown as PrismaService;

  it('returns the most-specific cohort when all filters match', async () => {
    const rows = [
      {
        courtLevel: 'Lower Court',
        subCourt: 'Sessions Court',
        district: 'Lahore',
        region: 'Punjab',
        highCourtCode: null,
        code: 'X',
        label: 'X',
        source: 'dsj',
        priority: 0,
        isActive: true,
      },
      {
        courtLevel: 'Lower Court',
        subCourt: 'Sessions Court',
        district: null,
        region: null,
        highCourtCode: null,
        code: 'Y',
        label: 'Y',
        source: 'fallback',
        priority: 0,
        isActive: true,
      },
    ];
    const svc = new CaseTypesService(mkPrisma(rows));
    const out = await svc.findCaseTypes({
      courtLevel: 'Lower Court',
      subCourt: 'Sessions Court',
      district: 'Lahore',
    });
    expect(out.map((r) => r.code)).toEqual(['X']);
  });

  it('falls back when district has no rows but subCourt does', async () => {
    const rows = [
      {
        courtLevel: 'Lower Court',
        subCourt: 'Family Court',
        district: null,
        region: null,
        highCourtCode: null,
        code: 'F',
        label: 'Family',
        source: 'fallback',
        priority: 0,
        isActive: true,
      },
    ];
    const svc = new CaseTypesService(mkPrisma(rows));
    const out = await svc.findCaseTypes({
      courtLevel: 'Lower Court',
      subCourt: 'Family Court',
      district: 'Lahore',
    });
    expect(out.map((r) => r.code)).toEqual(['F']);
  });

  it('falls back to courtLevel when no rows match subCourt', async () => {
    const rows = [
      {
        courtLevel: 'High Court',
        subCourt: null,
        district: null,
        region: null,
        highCourtCode: null,
        code: 'WP',
        label: 'Writ Petition',
        source: 'fallback',
        priority: 0,
        isActive: true,
      },
    ];
    const svc = new CaseTypesService(mkPrisma(rows));
    const out = await svc.findCaseTypes({
      courtLevel: 'High Court',
      highCourtCode: 'LHC',
    });
    expect(out.map((r) => r.code)).toEqual(['WP']);
  });

  it('orders by priority desc then label asc', async () => {
    const rows = [
      {
        courtLevel: 'Supreme Court',
        subCourt: null,
        district: null,
        region: null,
        highCourtCode: null,
        code: 'B',
        label: 'B',
        source: 'scp',
        priority: 1,
        isActive: true,
      },
      {
        courtLevel: 'Supreme Court',
        subCourt: null,
        district: null,
        region: null,
        highCourtCode: null,
        code: 'A',
        label: 'A',
        source: 'scp',
        priority: 1,
        isActive: true,
      },
      {
        courtLevel: 'Supreme Court',
        subCourt: null,
        district: null,
        region: null,
        highCourtCode: null,
        code: 'C',
        label: 'C',
        source: 'scp',
        priority: 5,
        isActive: true,
      },
    ];
    const svc = new CaseTypesService(mkPrisma(rows));
    const out = await svc.findCaseTypes({ courtLevel: 'Supreme Court' });
    expect(out.map((r) => r.code)).toEqual(['C', 'A', 'B']);
  });

  it('returns [] when nothing matches at any specificity', async () => {
    const svc = new CaseTypesService(mkPrisma([]));
    const out = await svc.findCaseTypes({
      courtLevel: 'Federal Shariat Court',
    });
    expect(out).toEqual([]);
  });
});
