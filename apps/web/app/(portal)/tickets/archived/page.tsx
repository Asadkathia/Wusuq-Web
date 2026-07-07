import { TicketBoard } from '@/components/ticket-board';

// Restore/unarchive follow-up: lists archived tickets (server-side
// `archived=true` filter, staff-only) with a Restore action instead of the
// normal status-tab actions. `status` is unused in archived mode — it's a
// required prop, so a placeholder value is passed.
export default function ArchivedTicketsPage() {
  return <TicketBoard title="Tickets / Archived" status="DELIVERED" archived />;
}
