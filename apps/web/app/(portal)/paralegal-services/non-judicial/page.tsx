import { ServicePicker } from '@/components/service-picker';
import { nonJudicialFlows } from '@/lib/intake-flows';

export default function NonJudicialServicesPage() {
  return (
    <ServicePicker
      flows={nonJudicialFlows}
      variant="admin"
      basePath="/paralegal-services/non-judicial"
      title="Paralegal Services / Non-Judicial"
    />
  );
}
