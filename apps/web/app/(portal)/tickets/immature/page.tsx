import { TicketBoard } from '@/components/ticket-board';

/**
 * Batch-7 4.1 — the "immature ticket" bucket.
 *
 * "What if a client just orders a ticket and never pays, never returns back?
 *  We should either delete the ticket or move it to an immature ticket."
 *
 * Derived, not a new status: still UNPAID, never paid a rupee, older than the
 * threshold. Nothing is written, so a consumer who comes back and pays leaves
 * the list by themselves — the recoverability he asked for.
 */
export default function ImmatureTicketsPage() {
  return <TicketBoard title="Tickets / Immature" immature />;
}
