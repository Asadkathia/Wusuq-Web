/**
 * TourId → tour content. Typed against the shared TourId union, so every
 * registered id must have content and no content can exist for an unknown id.
 */
import type { TourId } from '@wusuq/shared';
import { consumerGettingStarted } from './consumer/getting-started';
import { consumerDashboardTour } from './consumer/dashboard';
import { consumerMyTicketsTour } from './consumer/my-tickets';
import { consumerPayTour } from './consumer/pay';
import { consumerWalletTour } from './consumer/wallet';
import type { TourDefinition } from './types';

/** Temporary stand-in while a tour's content is being written (Tasks 4–6 remove all uses). */
function placeholderTour(id: TourId): TourDefinition {
  return { id, menuLabel: id, steps: [] };
}

export const TOUR_DEFINITIONS: Record<TourId, TourDefinition> = {
  'consumer.getting-started': consumerGettingStarted,
  'consumer.dashboard': consumerDashboardTour,
  'consumer.services': placeholderTour('consumer.services'),
  'consumer.intake': placeholderTour('consumer.intake'),
  'consumer.my-tickets': consumerMyTicketsTour,
  'consumer.pay': consumerPayTour,
  'consumer.wallet': consumerWalletTour,
  'consumer.drafts': placeholderTour('consumer.drafts'),
  'consumer.case-files': placeholderTour('consumer.case-files'),
  'consumer.documents': placeholderTour('consumer.documents'),
  'consumer.invoices': placeholderTour('consumer.invoices'),
  'consumer.profile': placeholderTour('consumer.profile'),
};
