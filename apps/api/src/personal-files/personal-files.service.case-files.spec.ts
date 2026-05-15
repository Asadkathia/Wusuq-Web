import { describe, it, expect, jest } from '@jest/globals';
import { PersonalFilesService } from './personal-files.service';

type Row = {
  id: string;
  userId: string;
  serviceId?: string | null;
  cityId?: string | null;
  courtName?: string | null;
  courtType?: string | null;
  displayName: string;
  sizeBytes: number;
  createdAt: Date;
  deletedAt: Date | null;
  storageKey?: string;
  originalName?: string;
  mimeType?: string;
};

function makeService(rows: Row[]): PersonalFilesService {
  const prisma = {
    personalFile: {
      findMany: jest.fn(async (args: any) => {
        return rows.filter((r) => {
          if (args.where?.deletedAt === null && r.deletedAt !== null) return false;
          if (args.where?.userId && r.userId !== args.where.userId) return false;
          const sid = args.where?.serviceId;
          if (sid && typeof sid === 'object' && sid.not === null) {
            if (r.serviceId == null) return false;
          } else if (typeof sid === 'string') {
            if (r.serviceId !== sid) return false;
          }
          if (args.where?.cityId && r.cityId !== args.where.cityId) return false;
          if (args.where?.courtName && r.courtName !== args.where.courtName) return false;
          return true;
        });
      }),
      groupBy: jest.fn(async (_args: any) => {
        const groups = new Map<string, { key: any; count: number }>();
        for (const r of rows) {
          if (r.deletedAt) continue;
          if (!r.serviceId) continue;
          const k = `${r.serviceId}|${r.cityId}|${r.courtName}|${r.courtType}`;
          const g = groups.get(k);
          if (g) g.count++;
          else
            groups.set(k, {
              key: { serviceId: r.serviceId, cityId: r.cityId, courtName: r.courtName, courtType: r.courtType },
              count: 1,
            });
        }
        return [...groups.values()].map((g) => ({ ...g.key, _count: { _all: g.count } }));
      }),
    },
  } as any;
  // Real constructor signature: (prisma, storage, auditLogs).
  return new PersonalFilesService(prisma, {} as any, {} as any);
}

describe('PersonalFilesService — case-files', () => {
  const NOW = new Date('2026-05-16T00:00:00Z');
  it('listCaseFiles returns only rows with serviceId set', async () => {
    const svc = makeService([
      { id: '1', userId: 'u', serviceId: 'svc_judicial_case_files', cityId: 'c1', courtName: 'LHC', courtType: 'High Court', displayName: 'a', sizeBytes: 100, createdAt: NOW, deletedAt: null, storageKey: 'k1', originalName: 'a', mimeType: 'application/pdf' },
      { id: '2', userId: 'u', serviceId: null, cityId: null, courtName: null, courtType: null, displayName: 'b', sizeBytes: 200, createdAt: NOW, deletedAt: null, storageKey: 'k2', originalName: 'b', mimeType: 'application/pdf' },
    ]);
    const out = await svc.listCaseFiles('u', {});
    expect(out.files.map((f) => f.id)).toEqual(['1']);
  });

  it('listCaseFiles honors serviceId / cityId / courtName filters', async () => {
    const svc = makeService([
      { id: '1', userId: 'u', serviceId: 'svc_a', cityId: 'c1', courtName: 'LHC', courtType: 'High Court', displayName: 'a', sizeBytes: 100, createdAt: NOW, deletedAt: null, storageKey: 'k1', originalName: 'a', mimeType: 'application/pdf' },
      { id: '2', userId: 'u', serviceId: 'svc_b', cityId: 'c1', courtName: 'LHC', courtType: 'High Court', displayName: 'b', sizeBytes: 100, createdAt: NOW, deletedAt: null, storageKey: 'k2', originalName: 'b', mimeType: 'application/pdf' },
    ]);
    const out = await svc.listCaseFiles('u', { serviceId: 'svc_b' });
    expect(out.files.map((f) => f.id)).toEqual(['2']);
  });

  it('cohortAggregates groups by (serviceId, cityId, courtName, courtType) with counts', async () => {
    const svc = makeService([
      { id: '1', userId: 'u', serviceId: 'svc_a', cityId: 'c1', courtName: 'LHC', courtType: 'High Court', displayName: 'a', sizeBytes: 100, createdAt: NOW, deletedAt: null, storageKey: 'k1', originalName: 'a', mimeType: 'application/pdf' },
      { id: '2', userId: 'u', serviceId: 'svc_a', cityId: 'c1', courtName: 'LHC', courtType: 'High Court', displayName: 'b', sizeBytes: 100, createdAt: NOW, deletedAt: null, storageKey: 'k2', originalName: 'b', mimeType: 'application/pdf' },
      { id: '3', userId: 'u', serviceId: 'svc_b', cityId: 'c2', courtName: 'SHC', courtType: 'High Court', displayName: 'c', sizeBytes: 100, createdAt: NOW, deletedAt: null, storageKey: 'k3', originalName: 'c', mimeType: 'application/pdf' },
    ]);
    const out = await svc.cohortAggregates('u');
    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serviceId: 'svc_a', cityId: 'c1', courtName: 'LHC', count: 2 }),
        expect.objectContaining({ serviceId: 'svc_b', cityId: 'c2', courtName: 'SHC', count: 1 }),
      ]),
    );
    expect(out).toHaveLength(2);
  });
});
