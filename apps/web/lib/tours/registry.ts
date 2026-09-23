/**
 * TourId → tour content. Typed against the shared TourId union, so every
 * registered id must have content and no content can exist for an unknown id.
 */
import type { TourId } from '@wusuq/shared';
import { consumerGettingStarted } from './consumer/getting-started';
import type { TourDefinition } from './types';

/** Temporary stand-in while a tour's content is being written (Tasks 4–6 remove all uses). */
function placeholderTour(id: TourId): TourDefinition {
  return { id, menuLabel: id, steps: [] };
}

export const TOUR_DEFINITIONS: Record<TourId, TourDefinition> = {
  'consumer.getting-started': consumerGettingStarted,
  'consumer.dashboard': placeholderTour('consumer.dashboard'),
  'consumer.services': placeholderTour('consumer.services'),
  'consumer.intake': placeholderTour('consumer.intake'),
  'consumer.my-tickets': placeholderTour('consumer.my-tickets'),
  'consumer.pay': placeholderTour('consumer.pay'),
  'consumer.wallet': placeholderTour('consumer.wallet'),
  'consumer.drafts': placeholderTour('consumer.drafts'),
  'consumer.case-files': placeholderTour('consumer.case-files'),
  'consumer.documents': placeholderTour('consumer.documents'),
  'consumer.invoices': placeholderTour('consumer.invoices'),
  'consumer.profile': placeholderTour('consumer.profile'),
};
