import { isFlowKey } from '@wusuq/shared';

/**
 * Builds the "Regenerate" navigation href for a ticket. Shared between the
 * consumer ticket board (`base: 'consumer'`) and the staff portal ticket
 * board (`base: 'portal'`) so the route-construction logic isn't
 * copy-pasted between the two.
 *
 * BATCH-7 1.5 — this now targets the SERVICE PICKER, not the source flow.
 * The client's ask, verbatim:
 *   "he wants, on the same case, to do a Case File — or a Power of Attorney —
 *    so he doesn't have to type things again and again. He changes his service
 *    and the rest stays the same… if I hit regenerate it should NOT land
 *    straight on Case File, it should ask which service you want."
 * The picker forwards `regenerateFromTicketId` to whichever tile is chosen
 * (see ServicePicker's `linkQuery`), so the wizard still prefills the case.
 *
 * Returns null when the ticket has no `intakeFlow` (legacy tickets) or the
 * key is not a known flow — a ticket we can't categorise has no sensible
 * picker to open, and nothing to prefill from.
 *
 * NOTE: this used to guard on `flowKeyToSlug(flow)`, which falls back to the
 * key itself and is therefore truthy for ANY non-empty string — the guard
 * never fired. `isFlowKey` is the real check.
 */
export function regenerateHref(
  ticket: { id: string; intakeFlow?: string | null },
  base: 'consumer' | 'portal',
): string | null {
  const flow = ticket.intakeFlow;
  if (!flow) return null;
  if (!isFlowKey(flow)) return null;
  const category = flow.startsWith('judicial_') ? 'judicial' : 'non-judicial';
  const prefix = base === 'consumer' ? '/consumer/paralegal-services' : '/paralegal-services';
  return `${prefix}/${category}?regenerateFromTicketId=${encodeURIComponent(ticket.id)}`;
}
