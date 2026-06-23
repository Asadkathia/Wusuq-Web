'use client';

import { useEffect, useState, startTransition, type ReactNode } from 'react';
import { isFlowAvailableForCurrency, USD_AVAILABLE_FLOWS } from '@/lib/intake-flows';
import { apiClient } from '@/lib/api-client';

// Resolves the logged-in user's billing currency. Seeds instantly from the
// localStorage login payload, then confirms via /wallet/me (authoritative) so
// pre-feature sessions whose stored user has no `currency` key still gate
// correctly. Defaults to PKR until known — PKR (the common case) never flashes.
function useBillingCurrency(): 'PKR' | 'USD' {
  const [currency, setCurrency] = useState<'PKR' | 'USD'>('PKR');
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as {
        currency?: 'PKR' | 'USD';
      } | null;
      if (user?.currency) startTransition(() => setCurrency(user.currency!));
    } catch {
      /* ignore malformed storage */
    }
    apiClient
      .get<{ currency?: 'PKR' | 'USD' }>('/wallet/me')
      .then((r) => { if (r.currency) startTransition(() => setCurrency(r.currency!)); })
      .catch(() => {});
  }, []);
  return currency;
}

/**
 * Hides a service tile when the logged-in consumer's billing currency can't
 * order that flow (USD customers only get the flows with USD pricing). The
 * tile is passed as already-rendered children, so the server component that
 * renders it never has to send the flow's icon (a function) across the RSC
 * boundary.
 */
export function UsdTileGate({
  flowKey,
  children,
}: {
  flowKey: string;
  children: ReactNode;
}) {
  const currency = useBillingCurrency();
  if (!isFlowAvailableForCurrency(flowKey, currency)) return null;
  return <>{children}</>;
}

/**
 * Renders a notice when a USD consumer is on a menu where NONE of the listed
 * flows are available (e.g. the non-judicial services page).
 */
export function UsdServicesEmptyState({ flowKeys }: { flowKeys: string[] }) {
  const currency = useBillingCurrency();
  const anyAvailable = flowKeys.some((k) => USD_AVAILABLE_FLOWS.has(k));
  if (currency !== 'USD' || anyAvailable) return null;
  return (
    <p className="rounded-2xl border border-border-soft bg-surface p-6 text-center text-sm text-slate-600">
      These services aren&apos;t available for international customers yet.
    </p>
  );
}
