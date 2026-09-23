/**
 * The one line a module page adds: registers the page's tour with the
 * provider, which auto-plays it the first time once `ready` (the page's
 * initial data has resolved — never pass a value that is true while loading).
 */
'use client';

import { useEffect } from 'react';
import type { TourId } from '@wusuq/shared';
import { useTours } from './tour-context';

export function useModuleTour(tourId: TourId, opts: { ready?: boolean } = {}): void {
  const tours = useTours();
  const ready = opts.ready ?? true;
  const register = tours?.registerPageTour;
  useEffect(() => {
    if (!register) return;
    return register(tourId, ready);
  }, [register, tourId, ready]);
}
