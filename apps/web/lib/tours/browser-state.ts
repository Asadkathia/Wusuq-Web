/**
 * Thin, SSR-safe readers of browser state used by the tour provider. Kept
 * separate so the decision logic (auto-play.ts / resolve-steps.ts) stays pure.
 */
import { tourSelector } from './resolve-steps';

const hasWindow = () => typeof window !== 'undefined';

export function isImpersonating(): boolean {
  if (!hasWindow()) return false;
  try {
    return !!window.localStorage.getItem('wusuq_impersonator_access_token');
  } catch {
    return false;
  }
}

/** An open Radix dialog/drawer (tour popovers are excluded). */
export function isDialogOpen(): boolean {
  if (!hasWindow()) return false;
  return !!document.querySelector(
    '[role="dialog"]:not(.driver-popover), [role="alertdialog"]',
  );
}

/** Matches Tailwind's lg breakpoint, where the sidebar becomes a drawer. */
export function isMobileViewport(): boolean {
  return hasWindow() && window.matchMedia('(max-width: 1023px)').matches;
}

export function isTargetVisible(target: string): boolean {
  if (!hasWindow()) return false;
  const el = document.querySelector(tourSelector(target));
  return !!el && el.getClientRects().length > 0;
}

export function readStoredRole(): string | null {
  if (!hasWindow()) return null;
  try {
    const u = JSON.parse(window.localStorage.getItem('wusuq_user') ?? 'null') as { role?: unknown } | null;
    return typeof u?.role === 'string' ? u.role : null;
  } catch {
    return null;
  }
}

export function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
