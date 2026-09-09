import { UserAccountBoard } from '@/components/user-account-board';

/**
 * Staff drill-down into one person's account.
 *
 * Batch-7 3.3 / 3.6 / 2.3 — three reports of the same missing screen:
 *   "it has made me clickable so that if I want to go to his account, how can
 *    I go?"
 *   "if I want to see any clerk, or if I want to go into any client — where do
 *    I go from, or how many tickets have been given?"
 *   "I should also know the transaction history of this."
 *
 * Works for consumers and representatives alike: the board picks the ticket
 * scope from the account's role.
 */
export default async function UserAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserAccountBoard userId={id} />;
}
