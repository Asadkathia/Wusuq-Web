import { CaseIntakeWizardWrapper } from '@/components/case-intake-wizard-wrapper';

export default async function NewCaseTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseIntakeWizardWrapper caseId={id} basePath="/cases" variant="admin" />;
}
