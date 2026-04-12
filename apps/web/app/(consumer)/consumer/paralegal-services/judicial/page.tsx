import { IntakeWizard } from '@/components/intake-wizard';
import { judicialFlows } from '@/lib/intake-flows';

export default function ConsumerJudicialServicesPage() {
  return <IntakeWizard title="Paralegal Services / Judicial" flows={judicialFlows} variant="consumer" />;
}
