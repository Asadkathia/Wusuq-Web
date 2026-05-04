'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserCircle2, X } from 'lucide-react';

export function ProfileCompletionBanner() {
  const [missing, setMissing] = useState<{ name: boolean; city: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem('wusuq_user');
        if (!raw) return;
        const u = JSON.parse(raw) as { name?: string | null; city?: string | null };
        const m = { name: !u.name, city: !u.city };
        if (m.name || m.city) setMissing(m);
      } catch {
        // localStorage unavailable
      }
    }
    queueMicrotask(read);
  }, []);

  if (!missing || dismissed) return null;

  const parts: string[] = [];
  if (missing.name) parts.push('your name');
  if (missing.city) parts.push('your city');
  const what = parts.join(' and ');

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-center gap-3">
        <UserCircle2 className="h-5 w-5 shrink-0" />
        <span>
          Complete your profile — add {what} so we can serve you better.{' '}
          <Link href="/consumer/profile" className="font-semibold underline">
            Complete now
          </Link>
        </span>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-amber-700 hover:text-amber-900"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
