'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { PanelCard } from '@/components/ui/panel-card';
import { casesApi } from '@/lib/api/cases';
import { FLOW_LABELS, flowKeyToSlug, type FlowKey } from '@wusuq/shared';

type Recommendation = {
  next: FlowKey;
  priority: 1 | 2 | 3;
  reason?: string;
};

export function CaseSuggestedSteps({
  caseId,
  basePath,
}: {
  caseId: string;
  basePath: string;
}) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    casesApi
      .getRecommendations(caseId)
      .then((data) => {
        if (cancelled) return;
        setRecs(data as Recommendation[]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load suggestions');
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (error || !recs || recs.length === 0) return null;

  return (
    <PanelCard className="border border-brand-100 bg-gradient-to-br from-brand-50/60 to-surface">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-500" />
        <h3 className="text-sm font-semibold text-slate-900">Suggested next steps</h3>
        <span className="text-xs font-medium text-slate-500">
          based on completed work
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {recs.map((r) => {
          const slug = flowKeyToSlug(r.next);
          const category = r.next.startsWith('non_judicial') ? 'non-judicial' : 'judicial';
          const href = `${basePath}/${caseId}/new-ticket?flow=${slug}&category=${category}`;
          return (
            <li key={r.next}>
              <Link
                href={href}
                onClick={() => {
                  // Fire-and-forget telemetry; don't block navigation.
                  void casesApi.trackRecommendationClick(caseId, r.next, 'case_detail');
                }}
                className="group flex h-full flex-col gap-1.5 rounded-xl border border-border-soft bg-surface p-4 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-elev-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {FLOW_LABELS[r.next]}
                  </p>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                </div>
                {r.reason ? (
                  <p className="text-xs leading-relaxed text-slate-600">{r.reason}</p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </PanelCard>
  );
}
