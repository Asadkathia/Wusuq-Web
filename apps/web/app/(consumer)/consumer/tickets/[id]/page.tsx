'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ConsumerTicketDetail } from '@/components/consumer-ticket-board';
import { PanelCard } from '@/components/ui/panel-card';

// Consumer-facing ticket detail page. Uses the consumer-safe ConsumerTicketDetail
// (NOT the admin TicketDetailPanel, which leaks clerk cost / PII / status
// controls). Reachable from My Tickets and immediately after ticket creation.
export default function ConsumerTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params?.id;

  if (!ticketId) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/consumer/my-tickets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to my tickets
      </Link>
      <PanelCard className="p-6">
        <ConsumerTicketDetail ticketId={ticketId} />
      </PanelCard>
    </div>
  );
}
