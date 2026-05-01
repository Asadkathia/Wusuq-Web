import { ServicePicker } from '@/components/service-picker';
import { judicialFlows } from '@/lib/intake-flows';

export default function ConsumerJudicialServicesPage() {
  return (
    <ServicePicker
      flows={judicialFlows}
      variant="consumer"
      basePath="/consumer/paralegal-services/judicial"
      title="Judicial Services"
      subtitle="Pick the service you'd like our paralegals to handle for your case."
    />
  );
}
