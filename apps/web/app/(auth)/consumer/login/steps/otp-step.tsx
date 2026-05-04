'use client';
import { useEffect, useRef } from 'react';
import { useOtpCountdown } from '../hooks/use-otp-countdown';

export function OtpStep({
  phone,
  otp,
  onOtpChange,
  onSubmit,
  onResend,
  onChangePhone,
  loading,
  error,
}: {
  phone: string;
  otp: string;
  onOtpChange: (v: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onChangePhone: () => void;
  loading: boolean;
  error: string | null;
}) {
  const { formatted, canResend, reset } = useOtpCountdown(30);
  const refs: [
    React.RefObject<HTMLInputElement | null>,
    React.RefObject<HTMLInputElement | null>,
    React.RefObject<HTMLInputElement | null>,
    React.RefObject<HTMLInputElement | null>,
  ] = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const digits = (otp || '').padEnd(4, ' ').slice(0, 4).split('');

  useEffect(() => {
    refs[0].current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDigit(i: number, v: string) {
    const sanitized = v.replace(/\D/g, '');
    if (sanitized.length === 4) {
      onOtpChange(sanitized);
      refs[3].current?.focus();
      return;
    }
    const ch = sanitized.slice(-1);
    const next = digits.slice();
    next[i] = ch || ' ';
    const joined = next.join('').replace(/\s/g, '');
    onOtpChange(joined);
    if (ch && i < 3) refs[(i + 1) as 0 | 1 | 2 | 3].current?.focus();
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i]?.trim() && i > 0) {
      refs[(i - 1) as 0 | 1 | 2 | 3].current?.focus();
    } else if (e.key === 'Enter' && otp.length === 4) {
      onSubmit();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Verify your number</h2>
        <p className="mt-1 text-sm text-slate-500">Enter the 4-digit code sent to {phone}</p>
      </div>

      <div className="flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            ref={refs[i]}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={digits[i]?.trim() ?? ''}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            className="h-14 w-12 rounded-xl border-0 text-center text-2xl font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-brand-500/50"
          />
        ))}
      </div>

      {error ? <p className="text-center text-xs text-rose-600">{error}</p> : null}

      <button
        type="button"
        onClick={onSubmit}
        disabled={otp.length !== 4 || loading}
        className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
      >
        {loading ? 'Verifying…' : 'Verify →'}
      </button>

      <div className="flex justify-between text-xs text-slate-500">
        <button
          type="button"
          disabled={!canResend}
          onClick={() => { onResend(); reset(); }}
          className="text-brand-600 hover:underline disabled:text-slate-400 disabled:no-underline"
        >
          {canResend ? 'Resend code' : `Resend in ${formatted}`}
        </button>
        <button type="button" onClick={onChangePhone} className="hover:underline">
          Change number
        </button>
      </div>
    </div>
  );
}
