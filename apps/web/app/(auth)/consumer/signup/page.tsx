'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, Mail, Phone, Scale, ShieldCheck, Sparkles, User } from 'lucide-react';
import { CONSUMER_KINDS, CONSUMER_KIND_LABELS, type ConsumerKind } from '@wusuq/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { CountryPicker } from '@/components/ui/country-picker';
import { findCountry } from '@/lib/countries';
import { advanceOnEnter } from '@/lib/form-utils';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const REQUEST_TIMEOUT_MS = 15000;
const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'];
const PK_PHONE_REGEX = /^(\+?92|0)?3\d{9}$/;
// Generic (non-PK) numbers: strip everything but digits and bound the count
// to E.164's 7-15 digit range (a leading '+' isn't a digit so it's ignored
// by \D). Keeps accepting the existing free-form separators (spaces,
// dashes, parens) while rejecting anything that would blow past the
// server's @MaxLength(16) composed-string cap (B6).
const GENERIC_PHONE_REGEX = /^(?:\D*\d){7,15}\D*$/;

export default function ConsumerSignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // QA B9/B10: country selector unlocks the +92 hardcode; the phone field
  // below stores the local digits without the dial prefix.
  // Country drives billing currency server-side, so it must be an EXPLICIT
  // choice — we start UNSET (no silent PK default) and require it before submit.
  const [countryCode, setCountryCode] = useState<string>('');
  const [phone, setPhone] = useState('');
  // Required account/user type — Civilian / Lawyer / Company. Starts unset.
  const [consumerKind, setConsumerKind] = useState<ConsumerKind | ''>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Fresh signups land on the onboarding wizard to finish their profile
  // (address + location). An explicit ?next= (e.g. deep link) still wins below.
  const [nextPath, setNextPath] = useState('/consumer/onboarding');
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get('next');
    if (candidate && candidate.startsWith('/consumer')) setNextPath(candidate);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!consumerKind) {
      setError('Please select your user type.');
      return;
    }
    if (!countryCode) {
      setError('Please select your country.');
      return;
    }
    // Mobile number is required: its dial code determines the billing region
    // (Pakistan → PKR, otherwise → USD).
    if (!phone.trim()) {
      setError('Please enter your mobile number.');
      return;
    }
    const phoneValid =
      countryCode === 'PK'
        ? PK_PHONE_REGEX.test(phone.trim())
        : GENERIC_PHONE_REGEX.test(phone.trim());
    if (!phoneValid) {
      setError('Enter a valid mobile number.');
      return;
    }
    // Compose +<dial><local> (strip separators / leading + / leading zeros; don't
    // double the dial if already typed). Guard the FINAL length against the
    // server's @MaxLength(16) — the generic local cap alone can't (a multi-digit
    // dial + a 15-digit local composes past 16); this is the authoritative FE
    // check so a valid-looking number never 400s at submit (review G4).
    const composedPhone = (() => {
      const digits = phone.trim().replace(/[\s\-()]/g, '').replace(/^\+/, '').replace(/^0+/, '');
      const dial = findCountry(countryCode).dial;
      return digits.startsWith(dial) ? `+${digits}` : `+${dial}${digits}`;
    })();
    if (composedPhone.length > 16) {
      setError('Enter a valid mobile number.');
      return;
    }

    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let signupResponse: Response;
      try {
        signupResponse = await fetch(`${API_BASE}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            consumerKind,
            // Country is saved as contact info; the phone's dial code is what
            // drives billing currency server-side (PKR for PK, else USD).
            country: countryCode,
            // Composed above and length-guarded against the server cap.
            phone: composedPhone,
          }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!signupResponse.ok) {
        if (signupResponse.status === 409) {
          throw new Error('An account with this email already exists. Try signing in instead.');
        }
        const body = (await signupResponse.json().catch(() => null)) as { message?: string | string[] } | null;
        const msg = Array.isArray(body?.message) ? body!.message![0] : body?.message;
        throw new Error(msg || 'Could not create account. Please try again.');
      }

      const loginResponse = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email.trim().toLowerCase(), password }),
      });

      if (!loginResponse.ok) {
        throw new Error('Account created but automatic sign-in failed. Please sign in manually.');
      }

      const data = (await loginResponse.json()) as {
        accessToken: string;
        refreshToken: string;
        user?: { id: string; email: string; role: string };
      };

      const role = data.user?.role ?? '';
      if (!CONSUMER_ROLES.includes(role)) {
        throw new Error('Unexpected account role. Please contact support.');
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
        setError(err instanceof Error ? err.message : 'Unable to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-5">
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
              Create your<br />
              <span className="text-brand-100">Wusuq account.</span>
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-brand-100/90">
              Submit requests, track case progress and manage hearings — all from one secure dashboard.
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
                Create your account
              </h2>
              <p className="text-sm text-slate-500">
                Sign up with your email to get started.
              </p>
            </div>

            <form onSubmit={onSubmit} onKeyDown={advanceOnEnter} className="mt-8 space-y-5">
              <FormField label="Full name" required htmlFor="name">
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  leftIcon={<User className="h-4 w-4" />}
                  required
                />
              </FormField>

              <FormField label="Email" required htmlFor="email">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                />
              </FormField>

              <FormField label="User type" required htmlFor="consumerKind">
                <div role="radiogroup" aria-label="User type" className="grid grid-cols-3 gap-2">
                  {CONSUMER_KINDS.map((kind) => {
                    const selected = consumerKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setConsumerKind(kind)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                          selected
                            ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-500'
                            : 'border-border-soft bg-surface text-slate-600 hover:border-brand-300 hover:text-slate-900'
                        }`}
                      >
                        {CONSUMER_KIND_LABELS[kind]}
                      </button>
                    );
                  })}
                </div>
              </FormField>

              <FormField label="Country" required htmlFor="country">
                <CountryPicker value={countryCode} onChange={setCountryCode} />
              </FormField>

              <FormField label="Mobile number" required htmlFor="phone">
                <div className="flex items-stretch gap-2">
                  <span className="flex items-center rounded-xl border border-border-soft bg-surface-muted/50 px-3 text-sm font-medium text-slate-700">
                    {countryCode ? `+${findCountry(countryCode).dial}` : '+—'}
                  </span>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={countryCode === 'PK' ? '03001234567' : 'Phone number'}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    leftIcon={<Phone className="h-4 w-4" />}
                    required
                    maxLength={countryCode === 'PK' ? 10 : 15}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Used to set your billing region. We won’t send a verification code yet.
                </p>
              </FormField>

              <FormField label="Password" required htmlFor="password">
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                  minLength={8}
                />
              </FormField>

              <FormField label="Confirm password" required htmlFor="confirmPassword">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                  minLength={8}
                />
              </FormField>

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
                {loading ? 'Creating account…' : 'Create account'}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link
                href="/consumer/login"
                className="font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                Sign in
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
