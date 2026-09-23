import { applyProgressUpdate, mergeProgress, normalizeProgress, readPending, writePending, PENDING_KEY } from './progress';
import type { TourProgressRow } from './types';

describe('normalizeProgress', () => {
  it('returns null for a non-array body (fail closed)', () => {
    expect(normalizeProgress({})).toBeNull();
    expect(normalizeProgress(null)).toBeNull();
  });

  it('keeps well-formed rows and drops malformed ones', () => {
    expect(
      normalizeProgress([
        { tourId: 'consumer.wallet', version: 1, status: 'COMPLETED' },
        { tourId: 'consumer.wallet', version: '1', status: 'COMPLETED' },
        { tourId: 'x', version: 1, status: 'WHATEVER' },
      ]),
    ).toEqual([{ tourId: 'consumer.wallet', version: 1, status: 'COMPLETED' }]);
  });
});

describe('pending writes', () => {
  function memStorage() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      m,
    };
  }

  it('round-trips pending rows and clears on empty', () => {
    const s = memStorage();
    writePending(s, [{ tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' }]);
    expect(readPending(s)).toEqual([{ tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' }]);
    writePending(s, []);
    expect(s.m.has(PENDING_KEY)).toBe(false);
  });

  it('treats corrupt storage as empty', () => {
    const s = memStorage();
    s.setItem(PENDING_KEY, '{not json');
    expect(readPending(s)).toEqual([]);
  });

  it('merges pending over server rows by tourId', () => {
    expect(
      mergeProgress(
        [{ tourId: 'a', version: 1, status: 'DISMISSED' }],
        [{ tourId: 'a', version: 2, status: 'COMPLETED' }, { tourId: 'b', version: 1, status: 'COMPLETED' }],
      ),
    ).toEqual([
      { tourId: 'a', version: 2, status: 'COMPLETED' },
      { tourId: 'b', version: 1, status: 'COMPLETED' },
    ]);
  });
});

describe('applyProgressUpdate', () => {
  it('keeps null sticky — a failed initial load stays fail-closed even after a manual persist/auto-off edit', () => {
    // Models: progress failed to load (null) → user manually starts and
    // completes a tour, or toggles auto-off → the update must NOT turn null
    // into an array, or every later shouldAutoPlay check (which gates on
    // `progress === null`) would start trusting data we never confirmed.
    const addRow = (rows: TourProgressRow[]) =>
      mergeProgress(rows, [{ tourId: 'consumer.wallet', version: 1, status: 'COMPLETED' }]);
    const result = applyProgressUpdate(null, addRow);
    expect(result).toBeNull();
  });

  it('applies the update normally once progress has actually loaded', () => {
    const current = [{ tourId: 'a', version: 1, status: 'DISMISSED' as const }];
    const result = applyProgressUpdate(current, (rows) =>
      mergeProgress(rows, [{ tourId: 'b', version: 1, status: 'COMPLETED' }]),
    );
    expect(result).toEqual([
      { tourId: 'a', version: 1, status: 'DISMISSED' },
      { tourId: 'b', version: 1, status: 'COMPLETED' },
    ]);
  });

  it('removing a row (auto-off toggled back on) also stays null when progress is unknown', () => {
    const removeAutoOff = (rows: TourProgressRow[]) => rows.filter((r) => r.tourId !== 'tours.auto-off');
    expect(applyProgressUpdate(null, removeAutoOff)).toBeNull();
  });
});
