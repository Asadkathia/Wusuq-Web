import { ServicePicker } from '@/components/service-picker';
import { judicialFlows } from '@/lib/intake-flows';


/**
 * Batch-7 1.5: when arrived at via Regenerate, `regenerateFromTicketId` is
 * carried through to whichever service the consumer picks, so they can order
 * a DIFFERENT service against the same case without retyping it.
 */
export default async function ConsumerJudicialServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const regenerateFromTicketId =
    typeof sp.regenerateFromTicketId === 'string' ? sp.regenerateFromTicketId : null;
  const linkQuery = regenerateFromTicketId
    ? `regenerateFromTicketId=${encodeURIComponent(regenerateFromTicketId)}`
    : undefined;
  return (
    <ServicePicker
      linkQuery={linkQuery}
      flows={judicialFlows}
      variant="consumer"
      basePath="/consumer/paralegal-services/judicial"
      title="Judicial Services"
      subtitle="Pick the service you'd like our paralegals to handle for your case."
    />
  );
}
