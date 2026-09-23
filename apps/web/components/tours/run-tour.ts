/**
 * Drives ONE tour with driver.js (loaded lazily, client-only). Reports how it
 * ended: 'completed' (Done / chain link on the last step), 'dismissed'
 * (close, Esc, overlay click), or 'aborted' (a required target was missing,
 * there was nothing to show, or the driver.js chunk/library itself failed —
 * the caller must NOT mark any of these seen). `onEnd` is guaranteed to fire
 * exactly once: a failure after the dynamic import (chunk load error, or
 * driver()/drive() throwing) is caught here rather than left as an unhandled
 * rejection, which would otherwise leave the caller's "a tour is running"
 * state stuck forever.
 */
import type { TourDefinition } from '@/lib/tours/types';
import { resolveSteps } from '@/lib/tours/resolve-steps';
import { isMobileViewport, isTargetVisible, prefersReducedMotion } from '@/lib/tours/browser-state';

export type TourOutcome = 'completed' | 'dismissed' | 'aborted';

export async function runTour(def: TourDefinition, onEnd: (outcome: TourOutcome) => void): Promise<void> {
  const resolved = resolveSteps(def.steps, { isMobile: isMobileViewport(), isVisible: isTargetVisible });
  if (!resolved.ok || resolved.steps.length === 0) {
    if (!resolved.ok && process.env.NODE_ENV !== 'production') {
      console.warn(`[tours] ${def.id} aborted: required target "${resolved.missing}" not on screen`);
    }
    onEnd('aborted');
    return;
  }

  let ended = false;
  const end = (outcome: TourOutcome) => {
    if (ended) return;
    ended = true;
    onEnd(outcome);
  };

  try {
    const { driver } = await import('driver.js');
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let outcome: TourOutcome = 'dismissed';

    const d = driver({
      animate: !prefersReducedMotion(),
      showProgress: resolved.steps.length > 1,
      progressText: 'Step {{current}} of {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: def.next?.label ?? 'Done',
      popoverClass: 'wusuq-tour',
      stagePadding: 6,
      stageRadius: 12,
      allowClose: true,
      steps: resolved.steps.map((s) => ({
        ...(s.element ? { element: s.element } : {}),
        popover: { title: s.title, description: s.body, ...(s.side ? { side: s.side } : {}) },
      })),
      onDoneClick: () => {
        outcome = 'completed';
        d.destroy();
      },
      onDestroyed: () => {
        returnFocus?.focus();
        end(outcome);
      },
    });
    d.drive();
  } catch (error) {
    console.error(`[tours] ${def.id} failed to start`, error);
    end('aborted');
  }
}
