/**
 * Consumer pay-ticket tour — a dynamic per-ticket page, so it carries no href.
 * Step order matches the on-page DOM order (Amount → Wallet → Method →
 * Receipt) — `pay.wallet` sits above the method/receipt section.
 */
import type { TourDefinition } from '../types';

export const consumerPayTour: TourDefinition = {
  id: 'consumer.pay',
  menuLabel: 'Paying for a ticket',
  steps: [
    {
      target: 'pay.amount',
      title: 'Amount due',
      body: 'What you owe on this ticket right now.',
    },
    {
      target: 'pay.wallet',
      optional: true,
      title: 'Use your wallet',
      body: 'If you have credit, you can pay this ticket from your wallet instead.',
    },
    {
      target: 'pay.method',
      title: 'Choose how to pay',
      body: 'Pick a method to see the account details to send the payment to.',
    },
    {
      target: 'pay.receipt',
      title: 'Upload your receipt',
      body: 'A receipt is required — we verify it and then mark your ticket paid.',
    },
  ],
};
