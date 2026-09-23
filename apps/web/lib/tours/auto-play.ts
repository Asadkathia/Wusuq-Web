/**
 * Pure auto-play decision for guided tours. Framework-free so every rule is
 * unit-tested as a truth table; browser state is read by the caller.
 */
import { TOUR_AUTO_OFF_ID, TOUR_META, type TourId } from '@wusuq/shared';
import type { TourProgressRow } from './types';

export const GETTING_STARTED_ID: TourId = 'consumer.getting-started';

export interface AutoPlayInput {
  tourId: TourId;
  appliesToRole: boolean;
  /** null = progress could not be loaded → never auto-play (fail closed). */
  progress: TourProgressRow[] | null;
  /** Tours that ended this session (covers failed saves so they don't loop). */
  sessionSeen: ReadonlySet<string>;
  impersonating: boolean;
  ready: boolean;
  tourRunning: boolean;
  dialogOpen: boolean;
  gettingStartedDone: boolean;
}

export function isTourSeen(tourId: TourId, rows: TourProgressRow[]): boolean {
  const row = rows.find((r) => r.tourId === tourId);
  return !!row && row.version >= TOUR_META[tourId].version;
}

export function shouldAutoPlay(i: AutoPlayInput): boolean {
  if (i.progress === null) return false;
  if (!i.appliesToRole || i.impersonating || !i.ready) return false;
  if (i.tourRunning || i.dialogOpen) return false;
  if (i.sessionSeen.has(i.tourId)) return false;
  if (i.progress.some((r) => r.tourId === TOUR_AUTO_OFF_ID)) return false;
  if (isTourSeen(i.tourId, i.progress)) return false;
  if (i.tourId !== GETTING_STARTED_ID && !i.gettingStartedDone) return false;
  return true;
}
