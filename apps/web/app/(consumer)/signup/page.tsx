'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
const SIGNUP_TIMEOUT_MS = 15000;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), SIGNUP_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${API_BASE}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            password,
            ...(phone ? { phone } : {}),
          }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const message =
          response.status === 409
            ? 'Email already registered'
            : 'Signup failed';
        throw new Error(message);
      }

      router.replace('/login');
    } catch (submitError) {
      if (submitError instanceof DOMException && submitError.name === 'AbortError') {
        setError('Signup request timed out. Verify API is reachable and try again.');
      } else if (submitError instanceof TypeError) {
        setError('Unable to reach API. Set NEXT_PUBLIC_API_BASE_URL to a reachable endpoint.');
      } else {
        setError(submitError instanceof Error ? submitError.message : 'Unable to sign up');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Wusuq Signup</h1>
        <p className="mt-1 text-sm text-slate-600">Create a consumer account to submit paralegal requests.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-slate-700">
            Name
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>

          <label className="block text-sm text-slate-700">
            Email
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
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
              autoComplete="new-password"
              required
            />
          </label>

          <label className="block text-sm text-slate-700">
            Phone (optional)
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </section>
    </main>
  );
}
