/** Consumer dashboard tour — the KPI strip, next hearing, recent activity and ticket-volume graph. */
import type { TourDefinition } from '../types';

export const consumerDashboardTour: TourDefinition = {
  id: 'consumer.dashboard',
  href: '/consumer/dashboard',
  menuLabel: 'Dashboard',
  steps: [
    {
      target: 'dashboard.kpis',
      title: 'Your tickets at a glance',
      body: 'Active, unpaid and completed tickets. Active matches the Active tab in My Tickets.',
    },
    {
      target: 'dashboard.next-hearing',
      optional: true,
      title: 'Next hearing',
      body: 'Your nearest upcoming hearing. Click it to open that ticket.',
    },
    {
      target: 'dashboard.activity',
      optional: true,
      title: 'Recent activity',
      body: 'The latest changes across your tickets, newest first.',
    },
    {
      target: 'dashboard.volume',
      optional: true,
      title: 'Your history',
      body: "How many tickets you've placed over time.",
    },
  ],
  next: {
    label: 'Next: My Tickets →',
    href: '/consumer/my-tickets',
    tourId: 'consumer.my-tickets',
  },
};
