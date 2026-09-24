/**
 * Turns tour data into concrete driver steps for the current viewport.
 * Optional steps with a missing target are skipped; a missing REQUIRED target
 * aborts the tour (caller does not mark it seen, so it plays properly later).
 * A `mobileTarget` miss on mobile is never a reason to abort — it falls back
 * to the desktop `target` (if visible) or a centred card, because the
 * mobile-only element (e.g. a menu button that only renders once a drawer is
 * open) can legitimately be absent even though the step is otherwise fine.
 */
import type { TourStep } from './types';

export type ResolvedStep = { element?: string; title: string; body: string; side?: TourStep['side'] };
export type ResolveResult = { ok: true; steps: ResolvedStep[] } | { ok: false; missing: string };

export function tourSelector(target: string): string {
  return `[data-tour="${target}"]`;
}

function pickTarget(step: TourStep, isMobile: boolean): string | undefined {
  if (isMobile && step.mobileTarget) return step.mobileTarget;
  return step.target;
}

export function resolveSteps(
  steps: TourStep[],
  opts: { isMobile: boolean; isVisible: (target: string) => boolean },
): ResolveResult {
  const out: ResolvedStep[] = [];
  for (const step of steps) {
    const card = { title: step.title, body: step.body, ...(step.side ? { side: step.side } : {}) };
    const target = pickTarget(step, opts.isMobile);
    if (!target) {
      out.push(card);
      continue;
    }
    if (opts.isVisible(target)) {
      out.push({ element: tourSelector(target), ...card });
      continue;
    }
    if (opts.isMobile && step.mobileTarget) {
      // The mobile target is missing/hidden — fall back to the desktop
      // target if it happens to be visible, else centre the card. Never
      // abort for this case alone.
      if (step.target && opts.isVisible(step.target)) {
        out.push({ element: tourSelector(step.target), ...card });
      } else {
        out.push(card);
      }
      continue;
    }
    if (step.optional) continue;
    // Desktop-only chrome hidden on a phone with no mobile alternative: centre it.
    if (opts.isMobile && !step.mobileTarget) {
      out.push(card);
      continue;
    }
    return { ok: false, missing: target };
  }
  return { ok: true, steps: out };
}
