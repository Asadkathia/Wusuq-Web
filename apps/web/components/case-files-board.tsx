'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useModuleTour } from '@/components/tours/use-module-tour';
import { CohortGroup } from './case-files-board/cohort-group';
import { UploadDrawer } from './case-files-board/upload-drawer';

type CaseFile = {
  id: string;
  displayName: string;
  sizeBytes: number;
  createdAt: string;
  mimeType: string;
  serviceId?: string | null;
  cityId?: string | null;
  courtName?: string | null;
  courtType?: string | null;
  attachedTicketId?: string | null;
};

type Cohort = {
  serviceId: string;
  cityId: string | null;
  courtName: string | null;
  courtType: string | null;
  count: number;
  /** D1: representative case title for this cohort (from the newest
   *  upload's caseMeta.caseTitle), null when none was captured. */
  caseTitle?: string | null;
  /** D1: presiding judge for this cohort (caseMeta.judgeName). */
  judgeName?: string | null;
};

type ServiceInfo = { id: string; name: string };
type CityInfo = { id: string; name: string };

export function CaseFilesBoard() {
  const [files, setFiles] = useState<CaseFile[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [filesResp, cohortsResp] = await Promise.all([
        apiClient.get<{ files: CaseFile[] } | CaseFile[]>('/personal-files/case-files'),
        apiClient.get<Cohort[]>('/personal-files/case-files/cohorts'),
      ]);
      const fileList = Array.isArray(filesResp) ? filesResp : (filesResp.files ?? []);
      setFiles(fileList);
      setCohorts(cohortsResp ?? []);
    } catch {
      setFiles([]);
      setCohorts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    apiClient
      .get<ServiceInfo[] | { items?: ServiceInfo[] }>('/services')
      .then((r) => setServices(Array.isArray(r) ? r : (r.items ?? [])))
      .catch(() => setServices([]));
    apiClient
      .get<CityInfo[]>('/geo/cities')
      .then((r) => setCities(r ?? []))
      .catch(() => setCities([]));
  }, [refresh]);

  const serviceName = (id: string | null | undefined) =>
    (id && services.find((s) => s.id === id)?.name) || 'Unknown service';
  const cityName = (id: string | null | undefined) =>
    (id && cities.find((c) => c.id === id)?.name) || '—';

  const grouped = useMemo(() => {
    const map = new Map<string, { cohort: Cohort; files: CaseFile[] }>();
    for (const c of cohorts) {
      const k = `${c.serviceId}|${c.cityId}|${c.courtName}|${c.courtType}`;
      map.set(k, { cohort: c, files: [] });
    }
    for (const f of files) {
      const k = `${f.serviceId}|${f.cityId}|${f.courtName}|${f.courtType}`;
      const entry = map.get(k);
      if (entry) entry.files.push(f);
    }
    return [...map.values()];
  }, [cohorts, files]);

  // `loading` starts `true` here, so `!loading` is only true once the
  // initial fetch has actually resolved (see `refresh`'s `finally`).
  useModuleTour('consumer.case-files', { ready: !loading });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My Case Files</h1>
          {/* Batch-7 6.4: say plainly whose files these are and how they
              differ from the other two areas. */}
          <p className="mt-1 text-sm text-slate-500">
            Files <strong>you</strong> upload and tag to a case — grouped by service, city and court.
            Documents Wusuq produces for you live under “Documents from Wusuq”.
          </p>
        </div>
        <button
          type="button"
          data-tour="case-files.upload"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-elev-1 transition-colors hover:bg-brand-600"
        >
          <Upload className="h-4 w-4" />
          Upload new
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : grouped.length === 0 ? (
        <div
          data-tour="case-files.list"
          className="rounded-2xl border border-dashed border-border-soft bg-surface-muted/40 px-6 py-12 text-center"
        >
          <p className="text-sm text-slate-600">No case files yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Click <strong>Upload new</strong> to add your first file.
          </p>
        </div>
      ) : (
        <div data-tour="case-files.list" className="space-y-3">
          {grouped.map(({ cohort, files: cohortFiles }) => (
            <CohortGroup
              key={`${cohort.serviceId}|${cohort.cityId}|${cohort.courtName}`}
              service={serviceName(cohort.serviceId)}
              city={cityName(cohort.cityId)}
              court={cohort.courtName ?? '—'}
              caseTitle={cohort.caseTitle}
              judgeName={cohort.judgeName}
              files={cohortFiles}
              onDeleted={() => refresh()}
            />
          ))}
        </div>
      )}

      <UploadDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUploaded={refresh}
      />
    </div>
  );
}
