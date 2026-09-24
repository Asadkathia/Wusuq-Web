/** Consumer My Tickets tour — stage filters, a ticket card, and its payment/action controls. */
import type { TourDefinition } from '../types';

export const consumerMyTicketsTour: TourDefinition = {
  id: 'consumer.my-tickets',
  href: '/consumer/my-tickets',
  menuLabel: 'My Tickets',
  steps: [
    {
      target: 'my-tickets.tabs',
      title: 'Filter by stage',
      body: 'Switch between active, unpaid, completed and all tickets.',
    },
    {
      target: 'my-tickets.card',
      optional: true,
      title: 'A ticket',
      body: 'Each card shows the service, case, status and amount. Click it for the full details and timeline.',
    },
    {
      target: 'my-tickets.pay',
      optional: true,
      title: 'Pay now or later',
      body: 'Pay now, or choose Pay later — the amount is added to your wallet balance as a due.',
    },
    {
      target: 'my-tickets.actions',
      optional: true,
      title: 'Invoice, documents and more',
      body: 'Download your invoice and delivered documents, or reorder a service for the same case.',
    },
    {
      target: 'my-tickets.new',
      optional: true,
      title: 'Order a new service',
      body: 'Start a new request any time from Paralegal Services.',
    },
    {
      title: 'Tracking your orders',
      body: 'Every order you place appears here with its live status.',
    },
  ],
  next: {
    label: 'Next: Wallet →',
    href: '/consumer/my-wallet',
    tourId: 'consumer.wallet',
  },
};
