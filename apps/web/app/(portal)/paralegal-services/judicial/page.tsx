import { IntakeWizard } from '@/components/intake-wizard';
import { judicialFlows } from '@/lib/intake-flows';

export default function JudicialServicesPage() {
  return <IntakeWizard title="Paralegal Services / Judicial" flows={judicialFlows} />;
}
