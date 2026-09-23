/** Consumer profile tour — contact/address details and account type. */
import type { TourDefinition } from '../types';

export const consumerProfileTour: TourDefinition = {
  id: 'consumer.profile',
  href: '/consumer/profile',
  menuLabel: 'Profile',
  // Step order matches the on-page order (Phone → User type → Location → Address);
  // profile.details highlights the Address section only, so it must not precede
  // profile.type, which sits between Phone and Address in the DOM.
  steps: [
    {
      target: 'profile.phone',
      title: 'Your phone number',
      body: 'We use this number to reach you about your tickets.',
    },
    {
      target: 'profile.type',
      optional: true,
      title: 'Account type',
      body: "Tell us whether you're a civilian, a lawyer or a company.",
    },
    {
      target: 'profile.details',
      title: 'Your address',
      body: 'Keep your address up to date — we use it for deliveries.',
    },
  ],
};
