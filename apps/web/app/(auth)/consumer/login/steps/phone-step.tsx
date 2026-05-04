'use client';
import Link from 'next/link';

const PK_REGEX = /^(\+?92|0)?3\d{9}$/;

export function PhoneStep({
  phone,
  onPhoneChange,
  onSubmit,
  onMockedSocial,
  loading,
  error,
}: {
  phone: string;
  onPhoneChange: (v: string) => void;
  onSubmit: () => void;
  onMockedSocial: (provider: 'google' | 'apple') => void;
  loading: boolean;
  error: string | null;
}) {
  const valid = PK_REGEX.test(phone);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>
        <p className="mt-1 text-sm text-slate-500">Enter your phone number to continue</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Phone number</span>
        <div className="flex items-stretch gap-2">
          <span className="flex items-center rounded-xl border border-border-soft bg-surface-muted/50 px-3 text-sm font-medium text-slate-700">+92</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="300 1234567"
            className="block w-full rounded-xl border-0 px-3.5 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500/50"
            autoFocus
          />
        </div>
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!valid || loading}
        className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
      >
        {loading ? 'Sending…' : 'Continue →'}
      </button>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-border-soft" />
        or continue with
        <span className="h-px flex-1 bg-border-soft" />
      </div>

      <button
        type="button"
        onClick={() => onMockedSocial('google')}
        className="flex items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-surface-muted"
      >
        <span className="font-bold text-[#4285F4]">G</span> Continue with Google
      </button>
      <button
        type="button"
        onClick={() => onMockedSocial('apple')}
        className="flex items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-surface-muted"
      >
         Continue with Apple
      </button>

      <Link href="/consumer/login/email" className="text-center text-xs text-brand-600 hover:underline">
        Use email instead
      </Link>

      <p className="text-center text-[11px] text-slate-400">
        By continuing, you agree to our Terms and Privacy.
      </p>

      <div className="border-t border-border-soft pt-3 text-center text-xs text-slate-500">
        Are you staff?{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in to the admin portal →
        </Link>
      </div>
    </div>
  );
}
