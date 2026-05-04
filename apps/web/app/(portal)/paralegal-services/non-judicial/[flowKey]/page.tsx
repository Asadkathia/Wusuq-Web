import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { IntakeWizard } from '@/components/intake-wizard';
import { nonJudicialFlows, slugToFlowKey } from '@/lib/intake-flows';

export default async function NonJudicialFlowPage({
  params,
}: {
  params: Promise<{ flowKey: string }>;
}) {
  const { flowKey: slug } = await params;
  const key = slugToFlowKey(slug, 'non_judicial');
  const found = key ? nonJudicialFlows.find((f) => f.key === key) : null;
  if (!found) notFound();
  const { icon: _icon, ...flow } = found;

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/paralegal-services/non-judicial"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" /> Back to services
      </Link>
      <IntakeWizard
        title={`Paralegal Services / Non-Judicial / ${flow.label}`}
        flows={[flow]}
        variant="admin"
      />
    </div>
  );
}
