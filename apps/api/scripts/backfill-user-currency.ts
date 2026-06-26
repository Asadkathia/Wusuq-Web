import { PrismaClient } from '@prisma/client';
import { deriveCurrency, type Currency } from '@wusuq/shared';

const prisma = new PrismaClient();

/**
 * Country-based pricing launched on this date. Accounts created BEFORE it never
 * had a currency derived at signup, so an "active" pre-launch account may carry
 * a wrong/default currency. The opt-in `--rederive-legacy` remediation targets
 * exactly these rows.
 */
export const LEGACY_CURRENCY_CUTOFF = new Date('2026-06-23T00:00:00.000Z');

/**
 * Decide the currency a user row should carry. Pure (no DB) so it can be
 * unit-tested.
 *
 * - Default behaviour (rederiveLegacy=false): respect the "lock once active"
 *   rule — active accounts KEEP their current currency; only inactive accounts
 *   are (re)derived. Re-run-safe / idempotent.
 * - `--rederive-legacy`: for accounts created BEFORE {@link LEGACY_CURRENCY_CUTOFF}
 *   (i.e. before country-based pricing existed), re-derive from the stored phone
 *   EVEN IF the account is active — these rows pre-date currency derivation and
 *   may be wrong. Accounts created on/after the cutoff are untouched by this
 *   branch and fall through to the default rule.
 */
export function resolveTargetCurrency(opts: {
  phone: string | null;
  country: string | null;
  currentCurrency: Currency | string | null;
  active: boolean;
  createdAt: Date;
  rederiveLegacy: boolean;
  legacyCutoff?: Date;
}): Currency {
  const cutoff = opts.legacyCutoff ?? LEGACY_CURRENCY_CUTOFF;
  const isLegacy = opts.createdAt.getTime() < cutoff.getTime();

  if (opts.rederiveLegacy && isLegacy) {
    return deriveCurrency({ phone: opts.phone, country: opts.country });
  }
  if (opts.active) {
    return (opts.currentCurrency as Currency) ?? 'PKR';
  }
  return deriveCurrency({ phone: opts.phone, country: opts.country });
}

async function main() {
  const rederiveLegacy = process.argv.includes('--rederive-legacy');

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      phone: true,
      country: true,
      currency: true,
      walletBalance: true,
      createdAt: true,
    },
  });

  let inactiveDerived = 0;
  let legacyRederived = 0;
  let grandfathered = 0;

  for (const u of users) {
    const ticketCount = await prisma.ticket.count({
      where: { consumerId: u.id, archivedAt: null },
    });
    const active = ticketCount > 0 || Number(u.walletBalance) !== 0;
    const isLegacy = u.createdAt.getTime() < LEGACY_CURRENCY_CUTOFF.getTime();

    const target = resolveTargetCurrency({
      phone: u.phone,
      country: u.country,
      currentCurrency: u.currency,
      active,
      createdAt: u.createdAt,
      rederiveLegacy,
    });

    if (target === u.currency) continue; // no-op — don't churn the row

    await prisma.user.update({
      where: { id: u.id },
      data: { currency: target },
    });

    // Log every change so the remediation is auditable.
    if (rederiveLegacy && isLegacy) {
      legacyRederived++;
      console.log(
        `[rederive-legacy] ${u.email ?? u.id}: ${u.currency ?? 'null'} -> ${target} ` +
          `(active=${active}, createdAt=${u.createdAt.toISOString()})`,
      );
    } else if (active) {
      grandfathered++;
      console.log(
        `[adjust-active] ${u.email ?? u.id}: ${u.currency ?? 'null'} -> ${target}`,
      );
    } else {
      inactiveDerived++;
      console.log(
        `[derive-inactive] ${u.email ?? u.id}: ${u.currency ?? 'null'} -> ${target}`,
      );
    }
  }

  console.log(
    `Backfill complete${rederiveLegacy ? ' (--rederive-legacy)' : ''}: ` +
      `${inactiveDerived} inactive users (re)derived, ` +
      `${legacyRederived} legacy active users re-derived, ` +
      `${grandfathered} active users adjusted (existing currency kept); ` +
      `of ${users.length} total.`,
  );
}

// Only run against the DB when invoked directly (not when imported by tests).
// The package is CommonJS (no "type":"module"), so `require.main === module`
// holds when launched via tsx. When imported under jest's ESM transform the
// `require`/`module` references are absent → we default to NOT running main().
const isMain = (() => {
  try {
    return typeof require !== 'undefined' && require.main === module;
  } catch {
    return false;
  }
})();

if (isMain) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
