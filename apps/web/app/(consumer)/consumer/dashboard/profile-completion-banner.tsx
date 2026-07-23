'use client';
import { useEffect, useState, startTransition } from 'react';
import Link from 'next/link';
import { UserCircle2, X } from 'lucide-react';

type Missing = { name: boolean; city: boolean; consumerKind: boolean };

export function ProfileCompletionBanner() {
  const [missing, setMissing] = useState<Missing | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Reads `wusuq_user` from localStorage fresh on every mount (H5). This is
  // only as current as the last login/save that wrote it — login() now
  // returns consumerKind/city (auth.service.ts) so a real login/re-login
  // picks up a value set at signup, and consumer-profile-board.tsx refreshes
  // this same key after a successful save — so navigating back to the
  // dashboard after either re-evaluates the banner without a re-login.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('wusuq_user');
      if (!raw) return;
      const u = JSON.parse(raw) as {
        name?: string | null;
        city?: string | null;
        consumerKind?: string | null;
      };
      const m: Missing = {
        name: !u.name,
        city: !u.city,
        consumerKind: !u.consumerKind,
      };
      startTransition(() => {
        if (m.name || m.city || m.consumerKind) setMissing(m);
      });
    } catch {
      // localStorage unavailable
    }
  }, []);

  if (!missing) return null;
  // Missing user-type is mandatory (PDF #4) — banner cannot be dismissed
  // until the user picks a kind. Optional fields (name/city) can still be
  // dismissed since they were optional in the original flow.
  const mustComplete = missing.consumerKind;
  if (dismissed && !mustComplete) return null;

  if (mustComplete) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="flex items-center gap-3">
          <UserCircle2 className="h-5 w-5 shrink-0" />
          <span>
            Please complete your profile — tell us what kind of user you are.{' '}
            <Link href="/consumer/profile" className="font-semibold underline">
              Complete now
            </Link>
          </span>
        </div>
      </div>
    );
  }

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
          <Link href="/consumer/onboarding" className="font-semibold underline">
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
