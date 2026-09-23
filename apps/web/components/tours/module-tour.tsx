/** Lets a server-component page opt into its module tour: <ModuleTour tourId="…" />. */
'use client';

import type { TourId } from '@wusuq/shared';
import { useModuleTour } from './use-module-tour';

export function ModuleTour({ tourId, ready }: { tourId: TourId; ready?: boolean }) {
  useModuleTour(tourId, { ready });
  return null;
}
