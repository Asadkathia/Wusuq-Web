import { PrismaClient } from '@prisma/client';
import { deriveCurrency } from '@wusuq/shared';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      phone: true,
      country: true,
      currency: true,
      walletBalance: true,
    },
  });
  let derived = 0;
  let grandfathered = 0;
  for (const u of users) {
    // Respect the "lock once active" rule: only derive currency for accounts
    // with NO activity. Accounts that already transacted (any non-archived
    // ticket OR a non-zero wallet balance) KEEP THEIR CURRENT currency — this
    // makes the script idempotent and re-run-safe: a USD customer who signed
    // up and transacted after the first run is not reverted to PKR.
    const ticketCount = await prisma.ticket.count({
      where: { consumerId: u.id, archivedAt: null },
    });
    const active = ticketCount > 0 || Number(u.walletBalance) !== 0;
    const target = active
      ? ((u.currency as 'PKR' | 'USD') ?? 'PKR')
      : deriveCurrency({ phone: u.phone, country: u.country });
    if (target === u.currency) continue; // no-op — don't churn the row
    await prisma.user.update({ where: { id: u.id }, data: { currency: target } });
    if (active) grandfathered++;
    else if (target !== 'PKR') derived++;
  }
  console.log(
    `Backfill complete: ${derived} inactive users set to USD, ` +
      `${grandfathered} active users adjusted (existing currency kept); ` +
      `of ${users.length} total.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
