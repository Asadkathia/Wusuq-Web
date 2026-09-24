import { ApiError } from '@/lib/api-client';
import {
  applyProgressUpdate,
  applySaveResultToPending,
  classifySaveFailure,
  mergeProgress,
  normalizeProgress,
  pendingKey,
  readPending,
  reconcilePendingAfterFlush,
  writePending,
  PENDING_KEY_PREFIX,
} from './progress';
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

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe('pending writes', () => {
  it('round-trips pending rows and clears on empty', () => {
    const s = memStorage();
    writePending(s, 'user-1', [{ tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' }]);
    expect(readPending(s, 'user-1')).toEqual([{ tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' }]);
    writePending(s, 'user-1', []);
    expect(s.m.has(pendingKey('user-1') as string)).toBe(false);
  });

  it('treats corrupt storage as empty', () => {
    const s = memStorage();
    s.setItem(pendingKey('user-1') as string, '{not json');
    expect(readPending(s, 'user-1')).toEqual([]);
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

  it('a stale pending v1 loses to a server v2 for the same tour (higher version wins, not "pending always wins")', () => {
    expect(
      mergeProgress(
        [{ tourId: 'consumer.wallet', version: 2, status: 'COMPLETED' }],
        [{ tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' }],
      ),
    ).toEqual([{ tourId: 'consumer.wallet', version: 2, status: 'COMPLETED' }]);
  });

  it('a tie goes to pending (the more recent local edit)', () => {
    expect(
      mergeProgress(
        [{ tourId: 'a', version: 1, status: 'DISMISSED' }],
        [{ tourId: 'a', version: 1, status: 'COMPLETED' }],
      ),
    ).toEqual([{ tourId: 'a', version: 1, status: 'COMPLETED' }]);
  });
});

describe('pendingKey — per-user isolation', () => {
  it('namespaces the key by user id', () => {
    expect(pendingKey('user-1')).toBe(`${PENDING_KEY_PREFIX}:user-1`);
    expect(pendingKey('user-2')).toBe(`${PENDING_KEY_PREFIX}:user-2`);
    expect(pendingKey('user-1')).not.toBe(pendingKey('user-2'));
  });

  it('returns null with no known user id — callers must not queue', () => {
    expect(pendingKey(null)).toBeNull();
  });

  it('one user\'s queued rows never appear under another user\'s key', () => {
    const s = memStorage();
    writePending(s, 'user-1', [{ tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' }]);
    writePending(s, 'user-2', [{ tourId: 'consumer.pay', version: 1, status: 'COMPLETED' }]);
    expect(readPending(s, 'user-1')).toEqual([{ tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' }]);
    expect(readPending(s, 'user-2')).toEqual([{ tourId: 'consumer.pay', version: 1, status: 'COMPLETED' }]);
  });

  it('a null user id reads and writes nothing (no-op, not a shared/anonymous bucket)', () => {
    const s = memStorage();
    writePending(s, null, [{ tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' }]);
    expect(s.m.size).toBe(0);
    expect(readPending(s, null)).toEqual([]);
  });
});

describe('classifySaveFailure', () => {
  it('retries a 408 or 429 (rate-limited / timed out, not a bad request)', () => {
    expect(classifySaveFailure(new ApiError(408, 'timeout'))).toBe('retry');
    expect(classifySaveFailure(new ApiError(429, 'too many requests'))).toBe('retry');
  });

  it('drops any other 4xx (the request itself is wrong; retrying can never succeed)', () => {
    expect(classifySaveFailure(new ApiError(400, 'bad request'))).toBe('drop');
    expect(classifySaveFailure(new ApiError(404, 'not found'))).toBe('drop');
    expect(classifySaveFailure(new ApiError(422, 'unprocessable'))).toBe('drop');
  });

  it('retries a 5xx', () => {
    expect(classifySaveFailure(new ApiError(500, 'boom'))).toBe('retry');
    expect(classifySaveFailure(new ApiError(503, 'unavailable'))).toBe('retry');
  });

  it('retries a network error (not an ApiError at all)', () => {
    expect(classifySaveFailure(new TypeError('Failed to fetch'))).toBe('retry');
    expect(classifySaveFailure('not even an Error')).toBe('retry');
  });
});

describe('applySaveResultToPending', () => {
  const row: TourProgressRow = { tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' };

  it('a successful save removes the row from the queue', () => {
    expect(applySaveResultToPending([row], 'ok', row)).toEqual([]);
  });

  it('a dropped save also removes the row (it will never succeed)', () => {
    expect(applySaveResultToPending([row], 'drop', row)).toEqual([]);
  });

  it('a retryable failure queues the row, merged via the higher-version rule', () => {
    expect(applySaveResultToPending([], 'retry', row)).toEqual([row]);
    const newer = { ...row, version: 2, status: 'COMPLETED' as const };
    expect(applySaveResultToPending([newer], 'retry', row)).toEqual([newer]);
  });

  it('only removes the matching tourId, leaving other queued rows alone', () => {
    const other: TourProgressRow = { tourId: 'consumer.pay', version: 1, status: 'COMPLETED' };
    expect(applySaveResultToPending([row, other], 'ok', row)).toEqual([other]);
  });
});

describe('reconcilePendingAfterFlush', () => {
  const row: TourProgressRow = { tourId: 'consumer.wallet', version: 1, status: 'DISMISSED' };

  it('clears a row the flush successfully saved (unchanged since the attempt started)', () => {
    expect(reconcilePendingAfterFlush([row], [row], [])).toEqual([]);
  });

  it('keeps a row still marked as failing', () => {
    expect(reconcilePendingAfterFlush([row], [row], [row])).toEqual([row]);
  });

  it('never clobbers a newer row queued concurrently while the flush was in flight', () => {
    const newer = { ...row, version: 2, status: 'COMPLETED' as const };
    // The flush attempted the OLD row and it "succeeded" from the flush's
    // point of view, but persist() has since queued a newer version for the
    // same tour — that newer row must survive, not be wiped by the flush's
    // stale success.
    expect(reconcilePendingAfterFlush([newer], [row], [])).toEqual([newer]);
  });

  it('leaves rows the flush never touched alone', () => {
    const untouched: TourProgressRow = { tourId: 'consumer.pay', version: 1, status: 'COMPLETED' };
    expect(reconcilePendingAfterFlush([row, untouched], [row], [])).toEqual([untouched]);
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
