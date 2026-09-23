/**
 * TourId → tour content. Typed against the shared TourId union, so every
 * registered id must have content and no content can exist for an unknown id.
 */
import type { TourId } from '@wusuq/shared';
import { consumerGettingStarted } from './consumer/getting-started';
import { consumerDashboardTour } from './consumer/dashboard';
import { consumerServicesTour } from './consumer/services';
import { consumerIntakeTour } from './consumer/intake';
import { consumerMyTicketsTour } from './consumer/my-tickets';
import { consumerPayTour } from './consumer/pay';
import { consumerWalletTour } from './consumer/wallet';
import { consumerDraftsTour } from './consumer/drafts';
import { consumerCaseFilesTour } from './consumer/case-files';
import { consumerDocumentsTour } from './consumer/documents';
import { consumerInvoicesTour } from './consumer/invoices';
import { consumerProfileTour } from './consumer/profile';
import type { TourDefinition } from './types';

export const TOUR_DEFINITIONS: Record<TourId, TourDefinition> = {
  'consumer.getting-started': consumerGettingStarted,
  'consumer.dashboard': consumerDashboardTour,
  'consumer.services': consumerServicesTour,
  'consumer.intake': consumerIntakeTour,
  'consumer.my-tickets': consumerMyTicketsTour,
  'consumer.pay': consumerPayTour,
  'consumer.wallet': consumerWalletTour,
  'consumer.drafts': consumerDraftsTour,
  'consumer.case-files': consumerCaseFilesTour,
  'consumer.documents': consumerDocumentsTour,
  'consumer.invoices': consumerInvoicesTour,
  'consumer.profile': consumerProfileTour,
};
