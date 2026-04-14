'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const LOGIN_TIMEOUT_MS = 15000;
const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'];

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('superadmin@wusuq.com');
  const [password, setPassword] = useState('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextPath, setNextPath] = useState('/dashboard');
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(params.get('next') ?? '/dashboard');
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(response.status === 401 ? 'Invalid credentials' : 'Login failed');
      }

      const data = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
        user?: { id: string; email: string; role: string };
      };
      localStorage.setItem('wusuq_access_token', data.accessToken);
      localStorage.setItem('wusuq_refresh_token', data.refreshToken);
      if (data.user) {
        localStorage.setItem('wusuq_user', JSON.stringify(data.user));
      }

      const isConsumer = CONSUMER_ROLES.includes(data.user?.role ?? '');
      const defaultRedirect = isConsumer ? '/consumer/dashboard' : '/dashboard';
      const canUseNextPath = isConsumer
        ? nextPath.startsWith('/consumer')
        : nextPath.startsWith('/') && !nextPath.startsWith('/consumer');

      router.replace(canUseNextPath ? nextPath : defaultRedirect);
    } catch (submitError) {
      if (submitError instanceof DOMException && submitError.name === 'AbortError') {
        setError('Login request timed out. Verify API is reachable and try again.');
      } else if (submitError instanceof TypeError) {
        setError('Unable to reach API. Set NEXT_PUBLIC_API_BASE_URL to a reachable endpoint.');
      } else {
        setError(submitError instanceof Error ? submitError.message : 'Unable to login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Wusuq Login</h1>
        <p className="mt-1 text-sm text-slate-600">Sign in to access finance and other modules.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-slate-700">
            Email or phone
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="block text-sm text-slate-700">
            Password
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </section>
    </main>
  );
}
