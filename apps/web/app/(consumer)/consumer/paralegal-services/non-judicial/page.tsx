import { ServicePicker } from '@/components/service-picker';
import { nonJudicialFlows } from '@/lib/intake-flows';

export default function ConsumerNonJudicialServicesPage() {
  return (
    <ServicePicker
      flows={nonJudicialFlows}
      variant="consumer"
      basePath="/consumer/paralegal-services/non-judicial"
      title="Non-Judicial Services"
      subtitle="Choose the document or registry service you need."
    />
  );
}
