'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { landingPathFor } from '@/lib/staff-routes';

function hasExpiredJwt(token: string) {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return true;
    const payloadJson = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp) return false;
    return payload.exp <= Date.now() / 1000;
  } catch {
    return true;
  }
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('wusuq_access_token');
    let role = '';
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { role?: string } | null;
      role = user?.role ?? '';
    } catch {}

    const hasValidToken = Boolean(token) && !hasExpiredJwt(token as string);
    if (!hasValidToken) {
      localStorage.removeItem('wusuq_access_token');
      localStorage.removeItem('wusuq_refresh_token');
      localStorage.removeItem('wusuq_user');
    }

    // The role -> destination decision is a pure function (landingPathFor)
    // unit-tested in lib/staff-routes.test.ts; keep this effect a thin
    // browser-state reader, not a place to reimplement the branching.
    router.replace(landingPathFor(role, hasValidToken));
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        Redirecting…
      </div>
    </main>
  );
}
