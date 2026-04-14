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
    if (!token || hasExpiredJwt(token)) {
      localStorage.removeItem('wusuq_access_token');
      localStorage.removeItem('wusuq_refresh_token');
      localStorage.removeItem('wusuq_user');
      router.replace('/login');
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { role?: string } | null;
      const isConsumer = CONSUMER_ROLES.includes(user?.role ?? '');
      router.replace(isConsumer ? '/consumer/dashboard' : '/dashboard');
    } catch {
      router.replace('/login');
    }
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-700">
      <p className="text-sm">Redirecting...</p>
    </main>
  );
}
