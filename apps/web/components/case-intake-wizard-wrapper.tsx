'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { IntakeWizard } from '@/components/intake-wizard';
import { judicialFlows, nonJudicialFlows, type IntakeFlow } from '@/lib/intake-flows';
import { casesApi, type Case } from '@/lib/api/cases';
import { slugToFlowKey, type FlowKey } from '@wusuq/shared';

type Props = {
  caseId: string;
  basePath: string;
  variant?: 'admin' | 'consumer';
};

/**
 * Builds a wizard payload from canonical Case columns. The wizard's
 * `initialPayload` accepts both canonical and aliased field names; the
 * wizard normalizes via PAYLOAD_FIELD_ALIASES at render time. Here we
 * write canonical Case names (caseNo, caseYear, court, etc.) plus a
 * couple of common wizard-side keys to maximize prefill coverage.
 */
function caseToInitialPayload(c: Case): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (key: string, value: string | number | undefined | null) => {
    if (value === null || value === undefined) return;
    const v = typeof value === 'number' ? String(value) : value;
    if (!v) return;
    out[key] = v;
  };

  // Title shows up in most flows.
  set('case_title', c.title);

  // Judicial fields
  set('case_petition_no', c.caseNo);
  set('case_no', c.caseNo);
  set('case_year', c.caseYear);
  set('year', c.caseYear);
  set('select_court', c.courtLevel);
  set('select_court_city', c.courtCity);
  set('city', c.courtCity);
  set('case_type', c.caseCategory);
  set('case_status', c.courtCaseStatus);
  set('judge_designation', c.judgeDesignation);

  // Non-judicial fields
  set('province', c.province);
  set('district_id', c.district);
  set('district_name', c.district);
  set('police_station', c.policeStation);
  set('station_id', c.policeStation);
  set('fir_no', c.firNo);
  set('offence', c.offence);
  set('doc_no', c.docNo);
  set('office_city', c.officeCity);

  return out;
}

function findFlowByKey(key: FlowKey): IntakeFlow | null {
  return (
    judicialFlows.find((f) => f.key === key) ??
    nonJudicialFlows.find((f) => f.key === key) ??
    null
  );
}

export function CaseIntakeWizardWrapper({ caseId, basePath, variant = 'admin' }: Props) {
  const searchParams = useSearchParams();
  const flowSlug = searchParams.get('flow');
  const category = searchParams.get('category');

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    casesApi
      .getCase(caseId)
      .then((c) => {
        if (!cancelled) setCaseData(c);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load case');
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const flow = useMemo<IntakeFlow | null>(() => {
    if (!caseData) return null;
    if (flowSlug) {
      const cat = category === 'non-judicial' ? 'non_judicial' : 'judicial';
      const key = slugToFlowKey(flowSlug, cat);
      if (key) {
        const f = findFlowByKey(key);
        if (f) return f;
      }
    }
    // No flow specified — default to a per-type sensible first flow.
    return caseData.type === 'JUDICIAL'
      ? judicialFlows[0] ?? null
      : nonJudicialFlows[0] ?? null;
  }, [caseData, flowSlug, category]);

  if (error) {
    return <div className="p-12 text-center text-rose-500">{error}</div>;
  }
  if (!caseData || !flow) {
    return <div className="p-12 text-center text-slate-500">Loading case context…</div>;
  }

  const initialPayload = caseToInitialPayload(caseData);

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={`${basePath}/${caseId}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" /> Back to case
      </Link>
      <IntakeWizard
        title={`${caseData.caseRef} · ${flow.label}`}
        flows={[flow]}
        variant={variant}
        caseId={caseId}
        lockedConsumerId={caseData.consumerId}
        initialPayload={initialPayload}
      />
    </div>
  );
}
