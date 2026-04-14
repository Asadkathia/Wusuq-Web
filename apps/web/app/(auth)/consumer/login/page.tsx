'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, Mail, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const LOGIN_TIMEOUT_MS = 15000;
const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'];

export default function ConsumerLoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextPath, setNextPath] = useState('/consumer/dashboard');
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get('next');
    if (candidate && candidate.startsWith('/consumer')) setNextPath(candidate);
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
        throw new Error(response.status === 401 ? 'Invalid email or password' : 'Login failed');
      }

      const data = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
        user?: { id: string; email: string; role: string };
      };

      const role = data.user?.role ?? '';
      if (!CONSUMER_ROLES.includes(role)) {
        throw new Error('This account is for staff. Please use the staff login.');
      }

      localStorage.setItem('wusuq_access_token', data.accessToken);
      localStorage.setItem('wusuq_refresh_token', data.refreshToken);
      if (data.user) localStorage.setItem('wusuq_user', JSON.stringify(data.user));

      router.replace(nextPath);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else if (err instanceof TypeError) {
        setError('Cannot reach server. Please check your connection.');
      } else {
        setError(err instanceof Error ? err.message : 'Unable to sign in');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-5">
        {/* Left: brand panel */}
        <aside className="hidden lg:col-span-2 lg:flex relative flex-col justify-between overflow-hidden bg-brand-500 p-12 text-white">
          <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-400 opacity-40 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-700 opacity-50 blur-[120px]" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-xl font-bold tracking-[0.1em] ring-1 ring-inset ring-white/20 backdrop-blur-sm">
              W
            </div>
            <span className="text-lg font-semibold tracking-tight">Wusuq</span>
          </div>

          <div className="relative space-y-6">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Paralegal services,<br />
              <span className="text-brand-100">simplified.</span>
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-brand-100/90">
              Access court documents, track case progress, manage hearings and payments — all from a single, secure dashboard.
            </p>
            <div className="space-y-3 pt-2">
              <FeatureRow icon={<Scale className="h-4 w-4" />} label="Court-grade document handling" />
              <FeatureRow icon={<ShieldCheck className="h-4 w-4" />} label="End-to-end case privacy" />
              <FeatureRow icon={<Sparkles className="h-4 w-4" />} label="Dedicated representative per request" />
            </div>
          </div>

          <p className="relative text-xs text-brand-100/70">
            © {new Date().getFullYear()} Wusuq · All rights reserved
          </p>
        </aside>

        {/* Right: form panel */}
        <section className="flex items-center justify-center p-6 lg:col-span-3 lg:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white">
                  W
                </div>
                <span className="text-lg font-semibold tracking-tight text-slate-900">Wusuq</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                Welcome back
              </h2>
              <p className="text-sm text-slate-500">
                Sign in to manage your paralegal requests.
              </p>
            </div>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <FormField label="Email or phone" required htmlFor="identifier">
                <Input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="you@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                />
              </FormField>

              <FormField
                label="Password"
                required
                htmlFor="password"
              >
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                />
              </FormField>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                  onClick={() => alert('Password reset is coming soon. Please contact support.')}
                >
                  Forgot password?
                </button>
              </div>

              {error ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <Button
                type="submit"
                variant="brand"
                size="lg"
                fullWidth
                loading={loading}
                rightIcon={!loading ? <ArrowRight className="h-4 w-4" /> : null}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-slate-500">
              New to Wusuq?{' '}
              <Link
                href="/consumer/signup"
                className="font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                Create an account
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-white/90">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/20">
        {icon}
      </span>
      {label}
    </div>
  );
}
