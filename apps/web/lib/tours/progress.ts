/**
 * Guided-tour progress I/O. Loading failures return null (callers then never
 * auto-play); failed saves are queued in localStorage and flushed on the next
 * load, merged over the server rows so a tour never replays because of a blip.
 */
import type { TourStatusValue } from '@wusuq/shared';
import { ApiError, apiClient } from '@/lib/api-client';
import type { TourProgressRow } from './types';

/** Prefix for the per-user pending-write queue key — see `pendingKey`. */
export const PENDING_KEY_PREFIX = 'wusuq_tour_pending';

function isRow(x: unknown): x is TourProgressRow {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.tourId === 'string' &&
    typeof r.version === 'number' &&
    Number.isInteger(r.version) &&
    (r.status === 'COMPLETED' || r.status === 'DISMISSED')
  );
}

export function normalizeProgress(body: unknown): TourProgressRow[] | null {
  if (!Array.isArray(body)) return null;
  return body.filter(isRow).map((r) => ({ tourId: r.tourId, version: r.version, status: r.status }));
}

export async function fetchProgress(): Promise<TourProgressRow[] | null> {
  try {
    return normalizeProgress(await apiClient.get<unknown>('/tours/progress'));
  } catch {
    return null;
  }
}

/**
 * How a failed save should be handled: `'retry'` (network error, 5xx, 408,
 * 429 — transient, queue it) or `'drop'` (any other 4xx — the request itself
 * is wrong, e.g. a stale/unknown tour id, and retrying it will never
 * succeed).
 */
export type SaveResult = 'ok' | 'retry' | 'drop';

/** Exported for direct unit testing (constructed `ApiError`s, no network mocking needed). */
export function classifySaveFailure(error: unknown): 'retry' | 'drop' {
  if (error instanceof ApiError) {
    if (error.status === 408 || error.status === 429) return 'retry';
    if (error.status >= 400 && error.status < 500) return 'drop';
  }
  // Network error, 5xx, or anything we can't classify — assume transient.
  return 'retry';
}

export async function saveProgress(tourId: string, version: number, status: TourStatusValue): Promise<SaveResult> {
  try {
    await apiClient.put(`/tours/progress/${encodeURIComponent(tourId)}`, { version, status });
    return 'ok';
  } catch (error) {
    return classifySaveFailure(error);
  }
}

export async function clearProgress(tourId: string): Promise<SaveResult> {
  try {
    await apiClient.delete(`/tours/progress/${encodeURIComponent(tourId)}`);
    return 'ok';
  } catch (error) {
    return classifySaveFailure(error);
  }
}

/**
 * The pending-write queue is scoped per user id — a shared device / account
 * switch must never let one user's queued (unsent) tour progress leak into
 * another user's session. `null` when there is no known signed-in user, in
 * which case nothing is queued (better to drop a save than mis-attribute it).
 */
export function pendingKey(userId: string | null): string | null {
  return userId ? `${PENDING_KEY_PREFIX}:${userId}` : null;
}

export function readPending(storage: Pick<Storage, 'getItem'>, userId: string | null): TourProgressRow[] {
  const key = pendingKey(userId);
  if (!key) return [];
  try {
    return normalizeProgress(JSON.parse(storage.getItem(key) ?? '[]')) ?? [];
  } catch {
    return [];
  }
}

export function writePending(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  userId: string | null,
  rows: TourProgressRow[],
): void {
  const key = pendingKey(userId);
  if (!key) return;
  try {
    if (rows.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(rows));
  } catch {
    // Storage unavailable (private mode) — the session-seen set still prevents loops.
  }
}

/**
 * Given a save attempt's classification, returns the next pending-queue
 * state for that row: `'ok'` and `'drop'` both clear it (a dropped row will
 * never succeed, so keeping it queued is pointless — see `SaveResult`);
 * `'retry'` merges it in via the higher-version-wins rule, so a newer
 * concurrent write for the same tour is never clobbered.
 */
export function applySaveResultToPending(
  pending: TourProgressRow[],
  result: SaveResult,
  row: TourProgressRow,
): TourProgressRow[] {
  if (result === 'retry') return mergeProgress(pending, [row]);
  return pending.filter((r) => r.tourId !== row.tourId);
}

/** Keeps the HIGHER-version row per tourId; a tie goes to `pending` (the more recent local edit). */
export function mergeProgress(server: TourProgressRow[], pending: TourProgressRow[]): TourProgressRow[] {
  const byId = new Map(server.map((r) => [r.tourId, r]));
  for (const p of pending) {
    const existing = byId.get(p.tourId);
    if (!existing || p.version >= existing.version) byId.set(p.tourId, p);
  }
  return [...byId.values()];
}

/** Runs each still-unsent pending row and reports the ones that must stay queued ('retry' only — 'ok' and 'drop' both clear). */
export async function flushPending(pending: TourProgressRow[]): Promise<TourProgressRow[]> {
  const stillFailing: TourProgressRow[] = [];
  for (const row of pending) {
    const result = await saveProgress(row.tourId, row.version, row.status);
    if (result === 'retry') stillFailing.push(row);
  }
  return stillFailing;
}

/**
 * Recomputes the pending queue after a flush attempt without clobbering
 * anything `persist()` may have queued concurrently while the flush was in
 * flight. `attempted` is the exact snapshot of rows the flush tried to save;
 * `stillFailing` is the subset that must stay queued. A row from `attempted`
 * is cleared from `current` only if it is UNCHANGED there — if a newer save
 * for the same tour landed in the meantime, that newer row survives.
 */
export function reconcilePendingAfterFlush(
  current: TourProgressRow[],
  attempted: TourProgressRow[],
  stillFailing: TourProgressRow[],
): TourProgressRow[] {
  const untouched = current.filter((r) => {
    const original = attempted.find((a) => a.tourId === r.tourId);
    if (!original) return true;
    return !(original.version === r.version && original.status === r.status);
  });
  return mergeProgress(untouched, stillFailing);
}

/**
 * Applies a local optimistic edit to progress state while keeping "unknown"
 * (null — the initial load failed) sticky. A load failure must stay
 * fail-closed for the rest of the session: an in-session `persist()` or
 * `setAutoOff()` call must never turn `null` into an array, or every
 * `shouldAutoPlay` check downstream (which gates on `progress === null`)
 * would start trusting a cache we never actually confirmed.
 */
export function applyProgressUpdate(
  current: TourProgressRow[] | null,
  update: (rows: TourProgressRow[]) => TourProgressRow[],
): TourProgressRow[] | null {
  return current === null ? null : update(current);
}
