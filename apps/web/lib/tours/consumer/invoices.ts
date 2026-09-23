/** Consumer invoices tour — every invoice issued, downloadable as a PDF. */
import type { TourDefinition } from '../types';

export const consumerInvoicesTour: TourDefinition = {
  id: 'consumer.invoices',
  href: '/consumer/invoices',
  menuLabel: 'Invoices',
  steps: [
    {
      target: 'invoices.list',
      title: 'Your invoices',
      body: 'Every invoice issued to you. Download any one as a PDF.',
    },
  ],
};
