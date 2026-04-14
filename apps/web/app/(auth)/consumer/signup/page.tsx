'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, Mail, Phone, Scale, ShieldCheck, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const SIGNUP_TIMEOUT_MS = 15000;

type FieldErrors = Partial<Record<'name' | 'email' | 'phone' | 'password' | 'confirm', string>>;

export default function ConsumerSignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (name.trim().length < 2) errs.name = 'Please enter your full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address';
    if (phone && !/^[+\d][\d\s-]{7,}$/.test(phone)) errs.phone = 'Enter a valid phone number';
    if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (confirm !== password) errs.confirm = 'Passwords do not match';
    return errs;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy');
      return;
    }

    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), SIGNUP_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(`${API_BASE}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            ...(phone ? { phone: phone.trim() } : {}),
          }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const message = response.status === 409 ? 'This email is already registered' : 'Signup failed';
        throw new Error(message);
      }

      router.replace('/consumer/login?registered=1');
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
              Create your account<br />
              <span className="text-brand-100">in minutes.</span>
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-brand-100/90">
              Join thousands using Wusuq to handle court documents, hearings, and payments from one place.
            </p>
            <div className="space-y-3 pt-2">
              <FeatureRow icon={<Scale className="h-4 w-4" />} label="Submit requests to any court in Pakistan" />
              <FeatureRow icon={<ShieldCheck className="h-4 w-4" />} label="Bank-grade security on every document" />
              <FeatureRow icon={<Sparkles className="h-4 w-4" />} label="Live status updates at every step" />
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
                Create your account
              </h2>
              <p className="text-sm text-slate-500">
                It only takes a minute.
              </p>
            </div>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <FormField label="Full name" required error={fieldErrors.name} htmlFor="name">
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  leftIcon={<User className="h-4 w-4" />}
                  error={Boolean(fieldErrors.name)}
                  required
                />
              </FormField>

              <FormField label="Email" required error={fieldErrors.email} htmlFor="email">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="h-4 w-4" />}
                  error={Boolean(fieldErrors.email)}
                  required
                />
              </FormField>

              <FormField label="Phone" hint="Optional — helps with ticket updates" error={fieldErrors.phone} htmlFor="phone">
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+92 ..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  leftIcon={<Phone className="h-4 w-4" />}
                  error={Boolean(fieldErrors.phone)}
                />
              </FormField>

              <FormField label="Password" required hint="Minimum 8 characters" error={fieldErrors.password} htmlFor="password">
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  error={Boolean(fieldErrors.password)}
                  required
                />
              </FormField>

              <FormField label="Confirm password" required error={fieldErrors.confirm} htmlFor="confirm">
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  error={Boolean(fieldErrors.confirm)}
                  required
                />
              </FormField>

              <label className="flex items-start gap-3 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border-soft text-brand-500 focus:ring-brand-500"
                />
                <span>
                  I agree to Wusuq&rsquo;s{' '}
                  <a className="text-brand-600 hover:text-brand-700 font-medium" href="#">Terms of Service</a>{' '}
                  and{' '}
                  <a className="text-brand-600 hover:text-brand-700 font-medium" href="#">Privacy Policy</a>.
                </span>
              </label>

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
