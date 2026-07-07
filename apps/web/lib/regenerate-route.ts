import { flowKeyToSlug } from '@/lib/intake-flows';

/**
 * Builds the "Regenerate" navigation href for a ticket — the pre-filled
 * intake wizard route with `regenerateFromTicketId` set. Shared between the
 * consumer ticket board (`base: 'consumer'`) and the staff portal ticket
 * board (`base: 'portal'`) so the route-construction logic isn't
 * copy-pasted between the two.
 *
 * Returns null when the ticket has no `intakeFlow` (legacy tickets) or the
 * flow key doesn't resolve to a known slug.
 */
export function regenerateHref(
  ticket: { id: string; intakeFlow?: string | null },
  base: 'consumer' | 'portal',
): string | null {
  const flow = ticket.intakeFlow;
  if (!flow) return null;
  const slug = flowKeyToSlug(flow);
  if (!slug) return null;
  const category = flow.startsWith('judicial_') ? 'judicial' : 'non-judicial';
  const prefix = base === 'consumer' ? '/consumer/paralegal-services' : '/paralegal-services';
  return `${prefix}/${category}/${slug}?regenerateFromTicketId=${encodeURIComponent(ticket.id)}`;
}
