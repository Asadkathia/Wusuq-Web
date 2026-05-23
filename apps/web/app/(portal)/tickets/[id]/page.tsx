'use client';

import { useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TicketDetailPanel } from '@/components/ticket-detail-panel';

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ticketId = params?.id;

  const [, startTransition] = useTransition();
  const [isClerkView, setIsClerkView] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as {
        role?: string;
      } | null;
      if (u?.role === 'representative') {
        startTransition(() => setIsClerkView(true));
      }
    } catch {
      // leave isClerkView as false
    }
  }, []);

  if (!ticketId) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <TicketDetailPanel
        ticketId={ticketId}
        onClose={() => router.back()}
        isClerkView={isClerkView}
      />
    </div>
  );
}
