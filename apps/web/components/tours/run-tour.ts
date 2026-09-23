/**
 * Drives ONE tour with driver.js (loaded lazily, client-only). Reports how it
 * ended: 'completed' (Done / chain link on the last step), 'dismissed'
 * (close, Esc, overlay click), or 'aborted' (a required target was missing or
 * there was nothing to show — the caller must NOT mark it seen).
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
      onEnd(outcome);
    },
  });
  d.drive();
}
