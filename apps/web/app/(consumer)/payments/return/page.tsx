'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

interface ByTxnResponse {
  id: string;
  status: 'INITIATED' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  ticketId: string;
  ticketPaymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
}

export default function PaymentReturnPage() {
  const search = useSearchParams();
  const router = useRouter();
  const providerTxnId = search.get('providerTxnId');
  const [status, setStatus] = useState<'pending' | 'paid' | 'failed'>('pending');
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!providerTxnId) {
      startTransition(() => setStatus('failed'));
      return;
    }
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      attempts++;
      try {
        const payment = await apiClient.get<ByTxnResponse>(
          `/payments/by-txn/${encodeURIComponent(providerTxnId)}`,
        );
        if (cancelled) return;
        if (payment?.ticketPaymentStatus === 'PAID') {
          startTransition(() => setStatus('paid'));
          return;
        }
        if (payment?.status === 'FAILED' || payment?.status === 'CANCELLED') {
          startTransition(() => setStatus('failed'));
          return;
        }
        if (attempts < 15) {
          timer = setTimeout(poll, 2000);
        } else {
          startTransition(() => setStatus('failed'));
        }
      } catch {
        if (cancelled) return;
        if (attempts < 15) {
          timer = setTimeout(poll, 2000);
        } else {
          startTransition(() => setStatus('failed'));
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [providerTxnId]);

  if (status === 'paid') {
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="mb-4 text-2xl font-semibold">Payment received</h1>
        <p className="mb-6 text-sm text-gray-600">
          Your ticket is now active and our team will begin work shortly.
        </p>
        <button
          type="button"
          onClick={() => router.push('/consumer/dashboard')}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="mb-4 text-2xl font-semibold">Payment failed</h1>
        <p className="mb-6 text-sm text-gray-600">
          No charge was made. You can try again from the dashboard.
        </p>
        <button
          type="button"
          onClick={() => router.push('/consumer/dashboard?tab=unpaid')}
          className="rounded border px-4 py-2"
        >
          Back to unpaid tickets
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-8">
      <h1 className="mb-4 text-2xl font-semibold">Confirming payment…</h1>
      <p className="text-sm text-gray-600">
        Hang tight while we verify your transaction with the gateway.
      </p>
    </div>
  );
}
