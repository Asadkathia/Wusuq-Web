'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

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
    const redirectToLogin = () => {
      localStorage.removeItem('wusuq_access_token');
      localStorage.removeItem('wusuq_refresh_token');
      localStorage.removeItem('wusuq_user');
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      setIsAuthorized(false);
    };

    const token = localStorage.getItem('wusuq_access_token');
    if (!token || hasExpiredJwt(token)) {
      redirectToLogin();
      return;
    }

    const onUnauthorized = () => {
      redirectToLogin();
    };

    window.addEventListener('auth:unauthorized', onUnauthorized);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAuthorized(true);

    return () => {
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
