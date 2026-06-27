'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'];

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
    let isConsumer = false;
    let isRepresentative = false;
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { role?: string } | null;
      isConsumer = CONSUMER_ROLES.includes(user?.role ?? '');
      isRepresentative = user?.role === 'representative';
    } catch {}

    if (!token || hasExpiredJwt(token)) {
      localStorage.removeItem('wusuq_access_token');
      localStorage.removeItem('wusuq_refresh_token');
      localStorage.removeItem('wusuq_user');
      router.replace(isConsumer ? '/consumer/login' : '/login');
      return;
    }

    // Representatives (clerks) lack reports.read and 403 on the admin dashboard;
    // land them on their work queue instead.
    if (isRepresentative) {
      router.replace('/tickets/assigned');
      return;
    }

    router.replace(isConsumer ? '/consumer/dashboard' : '/dashboard');
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
