import { mergeProgress, normalizeProgress, readPending, writePending, PENDING_KEY } from './progress';

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
