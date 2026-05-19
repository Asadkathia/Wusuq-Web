'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { paymentsClient } from '@/lib/payments-client';

// NOTE: the [paymentId] route segment receives the providerTxnId, because the
// MockProvider's redirectUrl is `/consumer/payments/mock/{providerTxnId}`.
// We keep the directory name `[paymentId]` to match the route, but treat its
// value as a providerTxnId in code.
export default function MockCheckoutPage() {
  const params = useParams<{ paymentId: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER !== 'mock') {
    return (
      <div className="mx-auto max-w-md p-8 text-sm text-gray-600">
        Mock checkout disabled.
      </div>
    );
  }

  const providerTxnId = params?.paymentId ?? '';

  const resolve = async (outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED') => {
    setBusy(true);
    setError(null);
    try {
      await paymentsClient.resolveMock(providerTxnId, outcome);
      router.push(
        `/consumer/payments/return?providerTxnId=${encodeURIComponent(providerTxnId)}&outcome=${outcome}`,
      );
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : 'Mock resolve failed';
      setError(message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-8">
      <h1 className="mb-4 text-2xl font-semibold">Mock Gateway</h1>
      <p className="mb-6 text-sm text-gray-600">
        Dev-only checkout. Pick an outcome to simulate the gateway response.
      </p>
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => resolve('SUCCESS')}
          disabled={busy}
          className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Success
        </button>
        <button
          type="button"
          onClick={() => resolve('FAILED')}
          disabled={busy}
          className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Fail
        </button>
        <button
          type="button"
          onClick={() => resolve('CANCELLED')}
          disabled={busy}
          className="rounded border px-4 py-2 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
