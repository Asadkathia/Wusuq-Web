import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { IntakeWizard } from '@/components/intake-wizard';
import { judicialFlows, slugToFlowKey } from '@/lib/intake-flows';

export default async function ConsumerJudicialFlowPage({
  params,
}: {
  params: Promise<{ flowKey: string }>;
}) {
  const { flowKey: slug } = await params;
  const key = slugToFlowKey(slug, 'judicial');
  const flow = key ? judicialFlows.find((f) => f.key === key) : null;
  if (!flow) notFound();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <Link
        href="/consumer/paralegal-services/judicial"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" /> Back to services
      </Link>
      <IntakeWizard
        title={`Judicial / ${flow.label}`}
        flows={[flow]}
        variant="consumer"
      />
    </div>
  );
}
