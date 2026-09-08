import { TicketBoard } from '@/components/ticket-board';

/**
 * Every ticket, across all statuses.
 *
 * Batch-7 3.2a: the dashboard "Total Tickets" KPI used to link to
 * `/tickets/pending`, which is not a route — there is no PENDING status (the
 * lifecycle starts at UNPAID). The card navigated to a 404-shaped page that
 * hung on "Loading ticket…". "Total Tickets" means all of them, so this is
 * the board it should have pointed at.
 */
export default function AllTicketsPage() {
  return <TicketBoard title="Tickets / All" />;
}
