/**
 * One-off cleanup for notifications left behind by tickets archived BEFORE
 * the batch-5 B cleanup shipped (batch-7 3.5).
 *
 * The archive path now deletes a ticket's notifications as it archives, but
 * that fix is forward-only: tickets archived earlier still have their bells.
 * The client re-tested exactly this — "if I delete this completed ticket,
 * all my clients should be zero-zero" — and saw stale
 * "Service completed / Final payment due" entries on a ticket he had deleted.
 *
 * Notification has no ticket FK; the link is `metadata.ticketId`, written by
 * every dispatcher method. So this matches on the JSON path, exactly as the
 * archive path does.
 *
 * Safe to re-run: it only ever deletes notifications whose ticket is archived.
 * Money rows (Payment, WalletTransaction), AuditLog and TicketStatusHistory
 * are untouched — notifications are derived messages, not the record.
 *
 * Usage:
 *   cd apps/api && npx tsx scripts/purge-archived-ticket-notifications.ts
 *   cd apps/api && npx tsx scripts/purge-archived-ticket-notifications.ts --apply
 *
 * Without --apply it is a DRY RUN and prints what it would remove.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');

  const archived = await prisma.ticket.findMany({
    where: { archivedAt: { not: null } },
    select: { id: true, batchNo: true },
  });

  if (archived.length === 0) {
    console.log('No archived tickets — nothing to do.');
    return;
  }
  console.log(`Found ${archived.length} archived ticket(s).`);

  let total = 0;
  for (const ticket of archived) {
    const where = {
      metadata: { path: ['ticketId'], equals: ticket.id },
    } as const;

    const count = await prisma.notification.count({ where });
    if (count === 0) continue;

    total += count;
    console.log(`  ${ticket.batchNo}: ${count} notification(s)`);

    if (apply) {
      await prisma.notification.deleteMany({ where });
    }
  }

  if (total === 0) {
    console.log('No stale notifications found. Nothing to do.');
    return;
  }

  console.log(
    apply
      ? `Deleted ${total} stale notification(s).`
      : `DRY RUN — ${total} notification(s) would be deleted. Re-run with --apply.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
