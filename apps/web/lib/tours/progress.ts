/**
 * Guided-tour progress I/O. Loading failures return null (callers then never
 * auto-play); failed saves are queued in localStorage and flushed on the next
 * load, merged over the server rows so a tour never replays because of a blip.
 */
import type { TourStatusValue } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import type { TourProgressRow } from './types';

export const PENDING_KEY = 'wusuq_tour_pending';

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

export async function saveProgress(tourId: string, version: number, status: TourStatusValue): Promise<boolean> {
  try {
    await apiClient.put(`/tours/progress/${encodeURIComponent(tourId)}`, { version, status });
    return true;
  } catch {
    return false;
  }
}

export async function clearProgress(tourId: string): Promise<boolean> {
  try {
    await apiClient.delete(`/tours/progress/${encodeURIComponent(tourId)}`);
    return true;
  } catch {
    return false;
  }
}

export function readPending(storage: Pick<Storage, 'getItem'>): TourProgressRow[] {
  try {
    return normalizeProgress(JSON.parse(storage.getItem(PENDING_KEY) ?? '[]')) ?? [];
  } catch {
    return [];
  }
}

export function writePending(storage: Pick<Storage, 'setItem' | 'removeItem'>, rows: TourProgressRow[]): void {
  try {
    if (rows.length === 0) storage.removeItem(PENDING_KEY);
    else storage.setItem(PENDING_KEY, JSON.stringify(rows));
  } catch {
    // Storage unavailable (private mode) — the session-seen set still prevents loops.
  }
}

export function mergeProgress(server: TourProgressRow[], pending: TourProgressRow[]): TourProgressRow[] {
  const byId = new Map(server.map((r) => [r.tourId, r]));
  for (const p of pending) byId.set(p.tourId, p);
  return [...byId.values()];
}
