/** Consumer wallet tour — balance, top-up and transaction history. */
import type { TourDefinition } from '../types';

export const consumerWalletTour: TourDefinition = {
  id: 'consumer.wallet',
  href: '/consumer/my-wallet',
  menuLabel: 'Wallet',
  steps: [
    {
      target: 'wallet.balance',
      title: 'Your balance',
      body: "Credit you've added, minus what's committed to unpaid tickets. Nothing is deducted until a ticket is paid.",
    },
    {
      target: 'wallet.topup',
      title: 'Add credit',
      body: "Top up by bank transfer, JazzCash or EasyPaisa — upload the receipt and we'll verify it.",
    },
    {
      target: 'wallet.history',
      title: 'Transactions',
      body: 'Every top-up and payment, with its verification status.',
    },
  ],
};
