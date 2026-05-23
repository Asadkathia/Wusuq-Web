'use client';

import { useParams, useRouter } from 'next/navigation';
import { TicketDetailPanel } from '@/components/ticket-detail-panel';

export default function ConsumerTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ticketId = params?.id;

  if (!ticketId) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <TicketDetailPanel
        ticketId={ticketId}
        onClose={() => router.back()}
        isClerkView={false}
      />
    </div>
  );
}
