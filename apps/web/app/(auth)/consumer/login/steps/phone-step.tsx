'use client';
import Link from 'next/link';
import { CountryPicker } from '@/components/ui/country-picker';
import { findCountry } from '@/lib/countries';

// PK validation kept for the default country (Pakistan). For other dial
// codes we fall back to a generic "7-15 digit" rule (E.164 lower / upper
// bound minus the dial prefix). The composedPhone helper in use-login-flow
// is what actually strips/prepends the dial code.
const PK_REGEX = /^(\+?92|0)?3\d{9}$/;
const GENERIC_REGEX = /^\+?\d[\d\s\-()]{5,18}\d$/;

export function PhoneStep({
  countryCode,
  onCountryChange,
  phone,
  onPhoneChange,
  onSubmit,
  loading,
  error,
}: {
  countryCode: string;
  onCountryChange: (code: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
}) {
  const country = findCountry(countryCode);
  const valid = countryCode === 'PK' ? PK_REGEX.test(phone) : GENERIC_REGEX.test(phone);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>
        {/* QA B10: ask region first (McDonald's-style), then the phone. The
            country picker is the first form control on the screen so the
            consumer commits to a region before the number. */}
        <p className="mt-1 text-sm text-slate-500">Pick your country and enter your phone to continue</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Country</span>
        <CountryPicker value={countryCode} onChange={onCountryChange} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Phone number</span>
        <div className="flex items-stretch gap-2">
          {/* QA B9: dial code is now derived from the selected country, not
              a hard-coded +92 span. */}
          <span className="flex items-center rounded-xl border border-border-soft bg-surface-muted/50 px-3 text-sm font-medium text-slate-700">
            +{country.dial}
          </span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder={countryCode === 'PK' ? '300 1234567' : 'Phone number'}
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

      <div className="flex items-center justify-center gap-3 text-xs">
        <Link href="/consumer/login/email" className="text-brand-600 hover:underline">
          Sign in with email
        </Link>
        <span className="text-slate-300">·</span>
        <Link href="/consumer/signup" className="text-brand-600 hover:underline">
          Create account with email
        </Link>
      </div>

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
