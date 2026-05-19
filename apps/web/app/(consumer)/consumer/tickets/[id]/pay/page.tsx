'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle2, CreditCard, Clock } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { paymentsClient } from '@/lib/payments-client';
import { PanelCard } from '@/components/ui/panel-card';
import { Button } from '@/components/ui/button';

interface TicketSummary {
  id: string;
  batchNo: string;
  totalAmount?: number | string | null;
  paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | null;
  service?: { name?: string | null } | null;
}

function formatAmount(value: TicketSummary['totalAmount']): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-PK', { maximumFractionDigits: 0 });
}

export default function PayTicketPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ticketId = params?.id;

  const [ticket, setTicket] = useState<TicketSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!ticketId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get<TicketSummary>(`/tickets/${ticketId}`);
        if (!cancelled) setTicket(data);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load ticket';
        setLoadError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  const handlePayNow = async () => {
    if (!ticketId || submitting) return;
    startTransition(() => {
      setActionError(null);
      setSubmitting(true);
    });
    try {
      const { redirectUrl } = await paymentsClient.initiate(ticketId);
      router.push(redirectUrl);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not start payment';
      setActionError(message);
      setSubmitting(false);
    }
  };

  const handlePayLater = () => {
    router.push('/consumer/dashboard?tab=unpaid');
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <PanelCard>
          <h1 className="mb-2 text-lg font-semibold text-slate-900">Unable to load ticket</h1>
          <p className="text-sm text-rose-600">{loadError}</p>
          <div className="mt-4">
            <Link href="/consumer/dashboard" className="text-sm font-medium text-brand-600 underline">
              Back to dashboard
            </Link>
          </div>
        </PanelCard>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <PanelCard>
          <p className="text-sm text-slate-600">Loading ticket…</p>
        </PanelCard>
      </div>
    );
  }

  if (ticket.paymentStatus === 'PAID') {
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <PanelCard>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">This ticket is already paid</h1>
              <p className="mt-1 text-sm text-slate-600">
                Ticket <span className="font-mono">{ticket.batchNo}</span> has been settled.
              </p>
              <div className="mt-4">
                <Link
                  href="/consumer/dashboard"
                  className="text-sm font-medium text-brand-600 underline"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          </div>
        </PanelCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Complete your payment</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your request has been submitted. Pay now to unlock processing, or settle later from your
          dashboard.
        </p>
      </div>

      <PanelCard className="mb-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-slate-500">Ticket</span>
            <span className="font-mono text-sm text-slate-900">{ticket.batchNo}</span>
          </div>
          {ticket.service?.name ? (
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-slate-500">Service</span>
              <span className="text-sm text-slate-900">{ticket.service.name}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border-soft pt-3">
            <span className="text-sm font-medium text-slate-700">Amount due</span>
            <span className="text-lg font-semibold text-slate-900">
              PKR {formatAmount(ticket.totalAmount)}
            </span>
          </div>
        </div>
      </PanelCard>

      {actionError ? (
        <p className="mb-4 text-sm text-rose-600">{actionError}</p>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button
          variant="primary"
          size="lg"
          onClick={handlePayNow}
          loading={submitting}
          leftIcon={<CreditCard className="h-4 w-4" />}
          fullWidth
        >
          Pay now
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={handlePayLater}
          disabled={submitting}
          leftIcon={<Clock className="h-4 w-4" />}
          fullWidth
        >
          Pay later
        </Button>
      </div>
    </div>
  );
}
