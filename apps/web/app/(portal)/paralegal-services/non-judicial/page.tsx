import { IntakeWizard } from '@/components/intake-wizard';
import { nonJudicialFlows } from '@/lib/intake-flows';

export default function NonJudicialServicesPage() {
  return (
    <IntakeWizard title="Paralegal Services / Non-Judicial" flows={nonJudicialFlows} variant="admin" />
  );
}
