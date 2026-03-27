import { CaseTicketWizard } from '@/components/case-ticket-wizard';

export default async function NewCaseTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseTicketWizard caseId={id} />;
}
