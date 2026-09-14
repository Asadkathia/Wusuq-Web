/**
 * Clear tickets and everything that hangs off them, for a clean test run.
 *
 * KEEPS: users, personal files, audit log, and ALL reference/seed data
 * (PricingRule, CourtCaseType, GeoProvince/District/City, CourtSeat,
 * PromoCode, PaymentSettings, ExchangeRate). Re-seeding those is slow and,
 * for pricing, historically fragile — this script must never touch them.
 *
 * WHY A SCRIPT: `prisma.ticket.deleteMany()` on its own FAILS. Ticket children
 * are ON DELETE RESTRICT (every ticket has status history), which is part of
 * why the app soft-archives instead of deleting. Children therefore have to go
 * first, in FK order, and that order is easy to get wrong by hand.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/clear-ticket-data.ts                  # DRY RUN, prints a plan
 *   npx tsx scripts/clear-ticket-data.ts --apply          # delete
 *   npx tsx scripts/clear-ticket-data.ts --apply --reset-wallets
 *
 * --reset-wallets also zeroes User.walletBalance. Consider it: deleting the
 * WalletTransaction ledger while leaving balances behind means a consumer can
 * still hold credit with nothing on record explaining it, and the intake
 * "use my wallet balance" option would happily spend it.
 *
 * Everything runs in ONE transaction, so a failure part-way leaves the
 * database exactly as it was.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/** Child-first. Reordering this is how you get a foreign-key failure. */
const STEPS: Array<{
  label: string;
  count: (tx: Prisma.TransactionClient) => Promise<number>;
  wipe: (tx: Prisma.TransactionClient) => Promise<{ count: number }>;
}> = [
  { label: 'TicketStatusHistory', count: (t) => t.ticketStatusHistory.count(), wipe: (t) => t.ticketStatusHistory.deleteMany() },
  { label: 'Assignment',          count: (t) => t.assignment.count(),          wipe: (t) => t.assignment.deleteMany() },
  { label: 'TicketDocument',      count: (t) => t.ticketDocument.count(),      wipe: (t) => t.ticketDocument.deleteMany() },
  { label: 'TicketClerkReport',   count: (t) => t.ticketClerkReport.count(),   wipe: (t) => t.ticketClerkReport.deleteMany() },
  { label: 'PromoRedemption',     count: (t) => t.promoRedemption.count(),     wipe: (t) => t.promoRedemption.deleteMany() },
  { label: 'InvoiceItem',         count: (t) => t.invoiceItem.count(),         wipe: (t) => t.invoiceItem.deleteMany() },
  { label: 'Invoice',             count: (t) => t.invoice.count(),             wipe: (t) => t.invoice.deleteMany() },
  { label: 'Payment',             count: (t) => t.payment.count(),             wipe: (t) => t.payment.deleteMany() },
  { label: 'WalletTransaction',   count: (t) => t.walletTransaction.count(),   wipe: (t) => t.walletTransaction.deleteMany() },
  { label: 'CaseDocument',        count: (t) => t.caseDocument.count(),        wipe: (t) => t.caseDocument.deleteMany() },
  { label: 'CaseEvent',           count: (t) => t.caseEvent.count(),           wipe: (t) => t.caseEvent.deleteMany() },
  { label: 'TicketIntakeDraft',   count: (t) => t.ticketIntakeDraft.count(),   wipe: (t) => t.ticketIntakeDraft.deleteMany() },
  // Notifications are derived messages with no ticket FK (the link is
  // metadata.ticketId). Clearing them wholesale is deliberate: leaving
  // top-up/payment bells behind after their transactions are gone recreates
  // exactly the stale-bell complaint from client review batches 5 and 7.
  { label: 'Notification',        count: (t) => t.notification.count(),        wipe: (t) => t.notification.deleteMany() },
  { label: 'Ticket',              count: (t) => t.ticket.count(),              wipe: (t) => t.ticket.deleteMany() },
  { label: 'Case',                count: (t) => t.case.count(),                wipe: (t) => t.case.deleteMany() },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const resetWallets = process.argv.includes('--reset-wallets');

  const plan: Array<[string, number]> = [];
  for (const step of STEPS) {
    plan.push([step.label, await step.count(prisma)]);
  }
  const creditHolders = await prisma.user.count({ where: { walletBalance: { gt: 0 } } });

  console.log(apply ? 'DELETING:' : 'DRY RUN — would delete:');
  for (const [label, n] of plan) {
    console.log(`  ${label.padEnd(22)} ${String(n).padStart(6)}`);
  }
  console.log(`\n  wallet balances > 0: ${creditHolders} user(s)` +
    (resetWallets ? ' — will be zeroed' : ' — LEFT AS-IS (pass --reset-wallets to zero them)'));
  console.log('\nKept untouched: users, personal files, audit log, pricing rules, case types, geo, court seats.');

  if (!apply) {
    console.log('\nNothing was changed. Re-run with --apply to execute.');
    return;
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const out: Array<[string, number]> = [];
    for (const step of STEPS) {
      const { count } = await step.wipe(tx);
      out.push([step.label, count]);
    }
    if (resetWallets) {
      const { count } = await tx.user.updateMany({
        where: { walletBalance: { not: 0 } },
        data: { walletBalance: 0 },
      });
      out.push(['User.walletBalance reset', count]);
    }
    return out;
  });

  console.log('\nDone:');
  for (const [label, n] of deleted) {
    console.log(`  ${label.padEnd(26)} ${String(n).padStart(6)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
