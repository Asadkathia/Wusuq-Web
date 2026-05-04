import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { IntakeWizard } from '@/components/intake-wizard';
import { judicialFlows, slugToFlowKey } from '@/lib/intake-flows';

export default async function JudicialFlowPage({
  params,
}: {
  params: Promise<{ flowKey: string }>;
}) {
  const { flowKey: slug } = await params;
  const key = slugToFlowKey(slug, 'judicial');
  const found = key ? judicialFlows.find((f) => f.key === key) : null;
  if (!found) notFound();
  const { icon: _icon, ...flow } = found;

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/paralegal-services/judicial"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" /> Back to services
      </Link>
      <IntakeWizard
        title={`Paralegal Services / Judicial / ${flow.label}`}
        flows={[flow]}
        variant="admin"
      />
    </div>
  );
}
