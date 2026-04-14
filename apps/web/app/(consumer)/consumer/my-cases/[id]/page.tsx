import { CaseDetail } from '@/components/case-detail';

export default async function ConsumerCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetail caseId={id} basePath="/consumer/my-cases" readOnly />;
}
