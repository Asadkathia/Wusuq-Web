import { ServicePicker } from '@/components/service-picker';
import { judicialFlows } from '@/lib/intake-flows';

export default function JudicialServicesPage() {
  return (
    <ServicePicker
      flows={judicialFlows}
      variant="admin"
      basePath="/paralegal-services/judicial"
      title="Paralegal Services / Judicial"
    />
  );
}
