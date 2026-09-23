/** Consumer getting-started tour — shell chrome only, so it can run on any page. */
import type { TourDefinition } from '../types';

export const consumerGettingStarted: TourDefinition = {
  id: 'consumer.getting-started',
  menuLabel: 'Getting started',
  steps: [
    { title: 'Welcome to Wusuq', body: "Let's take a one-minute look around. You can skip at any time." },
    {
      target: 'shell.sidebar',
      mobileTarget: 'shell.mobile-menu',
      side: 'right',
      title: 'Everything lives here',
      body: 'Order services, follow your tickets, and find your documents, invoices and wallet from this menu.',
    },
    {
      target: 'shell.wallet',
      optional: true,
      side: 'bottom',
      title: 'Your wallet',
      body: 'Your balance after unpaid tickets. Tap it to top up or see your transactions.',
    },
    {
      target: 'shell.notifications',
      side: 'bottom',
      title: 'Updates',
      body: 'We notify you here when a ticket moves forward, a document is ready, or a payment is due.',
    },
    {
      target: 'shell.tour-menu',
      side: 'bottom',
      title: 'Help is always here',
      body: 'Replay any tour from this button. Each page also shows you around the first time you open it.',
    },
  ],
};
