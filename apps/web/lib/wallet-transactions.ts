/**
 * Wallet transaction-history helpers for the staff Wallet board.
 *
 * These exist because `GET /wallet/:userId/transactions` returns an ENVELOPE
 * — `{ userId, items }` — not a bare array. The board used to assert the
 * array shape with `apiClient.get<any[]>(...)` and store the envelope in
 * state; `.length` was then `undefined`, the empty-state branch never fired,
 * and render hit `.map(...)` on a plain object. That TypeError is a
 * client-side exception, so Next.js replaced the WHOLE page with
 * "Application error: a client-side exception has occurred" — the staff
 * wallet board was unusable the moment anyone clicked a Consumer Wallets row.
 *
 * The lesson generalises: a type parameter on `apiClient.get<T>()` is an
 * assertion, not a check. Anything crossing that boundary gets normalised
 * here, in a pure function that can actually be unit-tested.
 */

export interface WalletTransactionRow {
  id: string;
  type: string | null;
  amount: number | string | null;
  currency: string | null;
  status: string | null;
  createdAt: string | null;
  receiptUrl?: string | null;
}

/** Shape-checks whatever the API returned and always yields a real array. */
export function normalizeTransactionHistory(payload: unknown): WalletTransactionRow[] {
  if (Array.isArray(payload)) return payload as WalletTransactionRow[];
  if (payload && typeof payload === 'object') {
    const items = (payload as { items?: unknown }).items;
    if (Array.isArray(items)) return items as WalletTransactionRow[];
  }
  return [];
}

/**
 * Grouped, signed amount for one row.
 *
 * Prisma `Decimal` columns arrive as JSON strings, so the previous
 * `t.amount.toLocaleString()` returned the digits ungrouped (String inherits
 * `toLocaleString` from Object.prototype) and threw outright on a null
 * column. Coerce, then format.
 */
export function transactionAmountLabel(
  tx: Partial<Pick<WalletTransactionRow, 'amount' | 'currency' | 'type'>>,
): string {
  const amount = Number(tx.amount ?? 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  const sign = tx.type === 'TOPUP' ? '+' : '-';
  const currency = tx.currency ? ` ${tx.currency}` : '';
  return `${sign}${safe.toLocaleString()}${currency}`;
}

/** "ADMIN_ADJUSTMENT" -> "Admin adjustment". Null-safe. */
export function transactionTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  // Split on a regex: `.replace('_', ' ')` with a string argument swaps only
  // the FIRST underscore, so a three-part enum kept one.
  const spaced = type.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Locale timestamp for one row; blank rather than "Invalid Date". */
export function transactionDateLabel(createdAt: string | null | undefined): string {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
