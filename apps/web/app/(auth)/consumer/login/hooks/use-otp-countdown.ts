'use client';
import { useCallback, useEffect, useState } from 'react';

const DEFAULT_SECONDS = 30;

export function useOtpCountdown(initialSeconds: number = DEFAULT_SECONDS) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const reset = useCallback((s: number = DEFAULT_SECONDS) => setSecondsLeft(s), []);

  const formatted = `${Math.floor(secondsLeft / 60)
    .toString()
    .padStart(1, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`;

  return { secondsLeft, formatted, canResend: secondsLeft <= 0, reset };
}
