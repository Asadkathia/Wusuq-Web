/**
 * Consumer intake-wizard tour — filling in an order. No `href`: the wizard is
 * a dynamic per-flow page (/consumer/paralegal-services/<category>/<flow>),
 * so it can only be reached by chaining from consumer.services, never opened
 * directly from the ? menu.
 */
import type { TourDefinition } from '../types';

export const consumerIntakeTour: TourDefinition = {
  id: 'consumer.intake',
  menuLabel: 'Filling in an order',
  steps: [
    {
      target: 'intake.steps',
      title: 'Your progress',
      body: 'The form is split into short steps. Required fields are marked with *.',
    },
    {
      target: 'intake.form',
      title: 'Case details',
      body: 'Choose your city and court first — the rest of the form adapts to them.',
    },
    {
      target: 'intake.autosave',
      optional: true,
      title: 'Saved as you go',
      body: 'Your answers save automatically. Find unfinished orders under Drafts.',
    },
    {
      target: 'intake.checkout',
      title: 'Your price',
      body: 'The price updates as you fill in the form. Add a promo code or use wallet credit here.',
    },
    {
      target: 'intake.nav',
      title: 'Next and back',
      body: 'Move between steps here. You can review everything before you submit.',
    },
  ],
};
