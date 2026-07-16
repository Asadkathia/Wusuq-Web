'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Gavel, Lock, ShieldCheck, Sparkles, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { WusuqLogo } from '@/components/ui/wusuq-logo';
import { advanceOnEnter } from '@/lib/form-utils';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const LOGIN_TIMEOUT_MS = 15000;
const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'];

export default function StaffLoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextPath, setNextPath] = useState('/dashboard');
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get('next');
    if (candidate && candidate.startsWith('/') && !candidate.startsWith('/consumer')) setNextPath(candidate);
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

      const role = data.user?.role ?? '';
      if (CONSUMER_ROLES.includes(role)) {
        localStorage.setItem('wusuq_access_token', data.accessToken);
        localStorage.setItem('wusuq_refresh_token', data.refreshToken);
        if (data.user) localStorage.setItem('wusuq_user', JSON.stringify(data.user));
        router.replace('/consumer/dashboard');
        return;
      }

      localStorage.setItem('wusuq_access_token', data.accessToken);
      localStorage.setItem('wusuq_refresh_token', data.refreshToken);
      if (data.user) localStorage.setItem('wusuq_user', JSON.stringify(data.user));
      router.replace(nextPath);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Login request timed out. Please try again.');
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
        {/* Left: dark staff hero */}
        <aside className="hidden lg:col-span-2 lg:flex relative flex-col justify-between overflow-hidden bg-ink-900 p-12 text-white">
          <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-500 opacity-25 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-700 opacity-30 blur-[120px]" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
              <WusuqLogo tone="white" size={28} priority />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">Wusuq</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/50">Staff portal</p>
            </div>
          </div>

          <div className="relative space-y-6">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Operate Wusuq<br />
              <span className="text-brand-100/80">with confidence.</span>
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-white/70">
              Manage tickets, verify clerk receipts, reconcile finance, and oversee the full paralegal operations stack.
            </p>
            <div className="space-y-3 pt-2">
              <FeatureRow icon={<Gavel className="h-4 w-4" />} label="Assign tickets to representatives" />
              <FeatureRow icon={<ShieldCheck className="h-4 w-4" />} label="Audit-ready wallet and finance trails" />
              <FeatureRow icon={<Sparkles className="h-4 w-4" />} label="Centralized cost rules and geography" />
            </div>
          </div>

          <p className="relative text-xs text-white/50">
            © {new Date().getFullYear()} Wusuq · Internal use only
          </p>
        </aside>

        <section className="flex items-center justify-center p-6 lg:col-span-3 lg:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-2.5">
                <WusuqLogo size={40} />
                <span className="text-lg font-semibold tracking-tight text-slate-900">Wusuq Staff</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in to staff portal</h2>
              <p className="text-sm text-slate-500">Admins, managers, and representatives only.</p>
            </div>

            <form onSubmit={onSubmit} onKeyDown={advanceOnEnter} className="mt-8 space-y-5">
              <FormField label="Email or phone" required htmlFor="identifier">
                <Input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="you@wusuq.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                />
              </FormField>

              <FormField label="Password" required htmlFor="password">
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

              {error ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                rightIcon={!loading ? <ArrowRight className="h-4 w-4" /> : null}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-8 text-center text-xs text-slate-500">
              Are you a client? Use the{' '}
              <Link href="/consumer/login" className="font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                client portal
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-white/80">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/20">
        {icon}
      </span>
      {label}
    </div>
  );
}
