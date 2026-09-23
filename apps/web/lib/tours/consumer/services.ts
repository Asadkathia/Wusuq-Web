/**
 * Consumer service-picker tour — the tile grid consumers choose a paralegal
 * service from. No judicial/non-judicial switch exists on the picker itself
 * (that choice is made one page earlier, on /consumer/paralegal-services), so
 * this tour covers the grid only.
 */
import type { TourDefinition } from '../types';

export const consumerServicesTour: TourDefinition = {
  id: 'consumer.services',
  href: '/consumer/paralegal-services/judicial',
  menuLabel: 'Ordering a service',
  steps: [
    {
      target: 'services.grid',
      title: 'Pick a service',
      body: 'Each tile is a service our paralegals handle. Choose one to open its short form.',
    },
  ],
};
