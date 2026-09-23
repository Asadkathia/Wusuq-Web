/** React context for the guided-tour engine. `useTours()` is null outside TourProvider. */
'use client';

import { createContext, useContext } from 'react';
import type { TourId } from '@wusuq/shared';
import type { TourDefinition } from '@/lib/tours/types';

export interface TourApi {
  start(tourId: TourId): void;
  requestTour(tourId: TourId): void;
  registerPageTour(tourId: TourId, ready: boolean): () => void;
  pageTourId: TourId | null;
  available: TourDefinition[];
  autoOff: boolean;
  setAutoOff(off: boolean): void;
  running: boolean;
}

export const TourContext = createContext<TourApi | null>(null);

export function useTours(): TourApi | null {
  return useContext(TourContext);
}
