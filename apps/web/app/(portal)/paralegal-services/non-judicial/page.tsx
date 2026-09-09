import { ServicePicker } from '@/components/service-picker';
import { nonJudicialFlows } from '@/lib/intake-flows';


/**
 * Batch-7 1.5: when arrived at via Regenerate, `regenerateFromTicketId` is
 * carried through to whichever service the consumer picks, so they can order
 * a DIFFERENT service against the same case without retyping it.
 */
export default async function NonJudicialServicesPage({
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
      flows={nonJudicialFlows}
      variant="admin"
      basePath="/paralegal-services/non-judicial"
      title="Paralegal Services / Non-Judicial"
    />
  );
}
