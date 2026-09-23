/** Consumer drafts tour — resume an unfinished order or delete one you no longer need. */
import type { TourDefinition } from '../types';

export const consumerDraftsTour: TourDefinition = {
  id: 'consumer.drafts',
  href: '/consumer/drafts',
  menuLabel: 'Drafts',
  steps: [
    {
      target: 'drafts.list',
      title: 'Unfinished orders',
      body: "Orders you started but didn't submit. Open one to pick up where you left off.",
    },
    {
      target: 'drafts.delete',
      optional: true,
      title: 'Clean up',
      body: 'Delete a draft you no longer need.',
    },
  ],
};
