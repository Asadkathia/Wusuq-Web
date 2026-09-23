/** Consumer profile tour — contact/address details and account type. */
import type { TourDefinition } from '../types';

export const consumerProfileTour: TourDefinition = {
  id: 'consumer.profile',
  href: '/consumer/profile',
  menuLabel: 'Profile',
  steps: [
    {
      target: 'profile.details',
      title: 'Your details',
      body: 'Keep your phone number and address up to date — we use the address for deliveries.',
    },
    {
      target: 'profile.type',
      optional: true,
      title: 'Account type',
      body: "Tell us whether you're a civilian, a lawyer or a company.",
    },
  ],
};
