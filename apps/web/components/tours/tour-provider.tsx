/**
 * Guided-tour engine for one shell (mounted in the consumer layout).
 *
 * - Loads progress once (+ merges and flushes writes queued by failed saves).
 *   Unloadable progress → no auto-play (fail closed).
 * - Plays getting-started first, on whichever page the user lands on, then the
 *   current page's module tour.
 * - One tour at a time. Never auto-plays over an open dialog, while
 *   impersonating, or before the page reports `ready`.
 * - Persists COMPLETED/DISMISSED (never while impersonating); 'aborted' is not
 *   persisted so the tour plays properly next time.
 * - Chains: the last step's link marks the tour completed, requests the next
 *   tour and navigates; the next page plays it as soon as it is ready.
 */
'use client';

import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TOUR_AUTO_OFF_ID, TOUR_IDS, TOUR_META, tourAppliesToRole, type TourId } from '@wusuq/shared';
import '@/lib/tours/tour-theme.css';
import 'driver.js/dist/driver.css';
import { GETTING_STARTED_ID, isTourSeen, shouldAutoPlay } from '@/lib/tours/auto-play';
import { isDialogOpen, isImpersonating, readStoredRole } from '@/lib/tours/browser-state';
import {
  applyProgressUpdate, clearProgress, fetchProgress, mergeProgress, readPending, saveProgress, writePending,
} from '@/lib/tours/progress';
import { TOUR_DEFINITIONS } from '@/lib/tours/registry';
import type { TourProgressRow } from '@/lib/tours/types';
import { TourContext, type TourApi } from './tour-context';
import { runTour, type TourOutcome } from './run-tour';

type PageTour = { id: TourId; ready: boolean };

/** Runs each still-unsent pending row and reports the ones that failed again. */
async function flushPending(pending: TourProgressRow[]): Promise<TourProgressRow[]> {
  const stillFailing: TourProgressRow[] = [];
  for (const row of pending) {
    const ok = await saveProgress(row.tourId, row.version, row.status);
    if (!ok) stillFailing.push(row);
  }
  return stillFailing;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [progress, setProgress] = useState<TourProgressRow[] | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [pageTour, setPageTour] = useState<PageTour | null>(null);
  const [requested, setRequested] = useState<TourId | null>(null);
  // Optimistic override of the auto-off toggle. Kept separate from `progress`
  // (rather than forced into it) so the ? menu reflects the click instantly
  // even when `progress` is null (load failed) and must stay null — see
  // `applyProgressUpdate`.
  const [autoOffLocal, setAutoOffLocal] = useState<boolean | null>(null);
  const sessionSeen = useRef<Set<string>>(new Set());

  // Load progress once; flush anything a previous session failed to save.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextRole = readStoredRole();
      const pending = readPending(localStorage);
      const server = await fetchProgress();
      if (cancelled) return;
      if (server === null) {
        startTransition(() => {
          setRole(nextRole);
          setProgress(null);
        });
        return;
      }
      const merged = mergeProgress(server, pending);
      startTransition(() => {
        setRole(nextRole);
        setProgress(merged);
      });
      if (isImpersonating() || pending.length === 0) return;
      const stillFailing = await flushPending(pending);
      if (!cancelled) writePending(localStorage, stillFailing);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((tourId: TourId, outcome: TourOutcome) => {
    sessionSeen.current.add(tourId);
    if (outcome === 'aborted' || isImpersonating()) return;
    const row: TourProgressRow = {
      tourId,
      version: TOUR_META[tourId].version,
      status: outcome === 'completed' ? 'COMPLETED' : 'DISMISSED',
    };
    setProgress((current) => applyProgressUpdate(current, (rows) => mergeProgress(rows, [row])));
    void saveProgress(row.tourId, row.version, row.status).then((ok) => {
      if (ok) return;
      writePending(localStorage, mergeProgress(readPending(localStorage), [row]));
    });
  }, []);

  const play = useCallback(
    (tourId: TourId) => {
      if (running) return;
      const def = TOUR_DEFINITIONS[tourId];
      setRunning(true);
      void runTour(def, (outcome) => {
        setRunning(false);
        persist(tourId, outcome);
        if (outcome === 'completed' && def.next) {
          setRequested(def.next.tourId);
          router.push(def.next.href);
        }
      }).catch((error: unknown) => {
        // runTour catches everything internally and always calls onEnd; this
        // is a last-resort backstop so `running` can never get stuck true for
        // the rest of the session if something still slips through.
        console.error(`[tours] ${tourId} runTour rejected`, error);
        setRunning(false);
      });
    },
    [running, persist, router],
  );

  // Auto-play: a requested (chained) tour first, else getting-started, else
  // the current page's tour. One candidate at a time, settled after a short
  // delay so layout/route changes finish first.
  useEffect(() => {
    const gettingStartedDone =
      sessionSeen.current.has(GETTING_STARTED_ID) ||
      (progress !== null && isTourSeen(GETTING_STARTED_ID, progress));
    const impersonating = isImpersonating();
    const dialogOpen = isDialogOpen();

    const requestedReady =
      requested !== null && pageTour?.id === requested && pageTour.ready && !running && !dialogOpen;
    if (requestedReady) {
      const id = requested as TourId;
      const timer = window.setTimeout(() => {
        // Re-check: a dialog can open, or impersonation can start, in the
        // 400ms between scheduling and firing — neither is a React
        // dependency of this effect, so only a fresh check here catches it.
        if (isDialogOpen() || isImpersonating()) return;
        setRequested(null);
        play(id);
      }, 400);
      return () => window.clearTimeout(timer);
    }

    const gettingStartedCandidate = shouldAutoPlay({
      tourId: GETTING_STARTED_ID,
      appliesToRole: tourAppliesToRole(GETTING_STARTED_ID, role),
      progress,
      sessionSeen: sessionSeen.current,
      impersonating,
      ready: true,
      tourRunning: running,
      dialogOpen,
      gettingStartedDone,
    });
    const pageCandidateId =
      !gettingStartedCandidate &&
      pageTour !== null &&
      shouldAutoPlay({
        tourId: pageTour.id,
        appliesToRole: tourAppliesToRole(pageTour.id, role),
        progress,
        sessionSeen: sessionSeen.current,
        impersonating,
        ready: pageTour.ready,
        tourRunning: running,
        dialogOpen,
        gettingStartedDone,
      })
        ? pageTour.id
        : null;

    const candidate = gettingStartedCandidate ? GETTING_STARTED_ID : pageCandidateId;
    if (!candidate) return;
    const timer = window.setTimeout(() => {
      if (isDialogOpen() || isImpersonating()) return;
      play(candidate);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [progress, pageTour, running, requested, role, play]);

  const registerPageTour = useCallback((tourId: TourId, ready: boolean) => {
    setPageTour({ id: tourId, ready });
    return () => {
      setPageTour((current) => (current?.id === tourId ? null : current));
    };
  }, []);

  const available = useMemo(
    () =>
      TOUR_IDS.filter((id) => tourAppliesToRole(id, role))
        .map((id) => TOUR_DEFINITIONS[id])
        .filter((def) => def.steps.length > 0),
    [role],
  );

  const autoOff = autoOffLocal ?? (progress?.some((r) => r.tourId === TOUR_AUTO_OFF_ID) ?? false);

  const setAutoOff = useCallback((off: boolean) => {
    // The toggle reflects the click immediately regardless of whether
    // `progress` could load; `progress` itself stays null (fail-closed) if it
    // was already null — see `applyProgressUpdate`.
    setAutoOffLocal(off);
    if (off) {
      setProgress((current) =>
        applyProgressUpdate(current, (rows) => mergeProgress(rows, [{ tourId: TOUR_AUTO_OFF_ID, version: 1, status: 'DISMISSED' }])),
      );
      void saveProgress(TOUR_AUTO_OFF_ID, 1, 'DISMISSED');
      return;
    }
    setProgress((current) => applyProgressUpdate(current, (rows) => rows.filter((r) => r.tourId !== TOUR_AUTO_OFF_ID)));
    void clearProgress(TOUR_AUTO_OFF_ID);
  }, []);

  const start = useCallback((tourId: TourId) => play(tourId), [play]);
  const requestTour = useCallback((tourId: TourId) => setRequested(tourId), []);

  const api = useMemo<TourApi>(
    () => ({
      start,
      requestTour,
      registerPageTour,
      pageTourId: pageTour?.id ?? null,
      available,
      autoOff,
      setAutoOff,
      running,
    }),
    [start, requestTour, registerPageTour, pageTour, available, autoOff, setAutoOff, running],
  );

  return <TourContext.Provider value={api}>{children}</TourContext.Provider>;
}
