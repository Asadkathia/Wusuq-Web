'use client';

import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { refreshAccessToken } from '@/lib/api-client';
import { staffLoginHref } from '@/lib/staff-routes';

type PortalAuthGuardProps = {
  children: ReactNode;
};

export function PortalAuthGuard({ children }: PortalAuthGuardProps) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const nextPath = useMemo(() => pathname, [pathname]);

  const hasExpiredJwt = (token: string) => {
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) return true;
      const payloadJson = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson) as { exp?: number };
      if (!payload.exp) return false;
      return payload.exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const redirectToLogin = () => {
      localStorage.removeItem('wusuq_access_token');
      localStorage.removeItem('wusuq_refresh_token');
      localStorage.removeItem('wusuq_user');
      router.replace(staffLoginHref(nextPath));
      setIsAuthorized(false);
    };

    // Authorize staff; bounce consumers to their own dashboard. Returns false
    // when it redirected (caller should stop).
    const authorizeByRole = () => {
      try {
        const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { role?: string } | null;
        const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'];
        if (CONSUMER_ROLES.includes(user?.role ?? '')) {
          router.replace('/consumer/dashboard');
          return;
        }
      } catch {
        redirectToLogin();
        return;
      }
      startTransition(() => setIsAuthorized(true));
    };

    const run = async () => {
      const token = localStorage.getItem('wusuq_access_token');
      if (token && !hasExpiredJwt(token)) {
        authorizeByRole();
        return;
      }
      // Access token missing/expired — the session is still alive if the
      // (7-day) refresh token is valid. Silently renew instead of logging out.
      const refreshToken = localStorage.getItem('wusuq_refresh_token');
      if (refreshToken && !hasExpiredJwt(refreshToken)) {
        const newToken = await refreshAccessToken();
        if (cancelled) return;
        if (newToken) {
          authorizeByRole();
          return;
        }
      }
      redirectToLogin();
    };

    void run();

    const onUnauthorized = () => {
      redirectToLogin();
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);

    return () => {
      cancelled = true;
      window.removeEventListener('auth:unauthorized', onUnauthorized);
    };
  }, [nextPath, router]);

  if (isAuthorized !== true) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-700">
        <p className="text-sm">Checking session...</p>
      </main>
    );
  }

  return <>{children}</>;
}
