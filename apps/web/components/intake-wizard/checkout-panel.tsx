'use client';

import { Receipt } from 'lucide-react';

export type CheckoutItem = {
  label: string;
  detail?: string;
  /** Amount in PKR. `null` means the price is not yet determined (shown as —). */
  amount: number | null;
};

export type CheckoutSummary = {
  items: CheckoutItem[];
  /** Derived subtotal. `null` until pricing rules wire in. */
  subtotal: number | null;
  /** Taxes, platform fees, etc. `null` until defined. */
  fees: number | null;
  /** Grand total. `null` until pricing rules wire in. */
  total: number | null;
  currency: string;
};

type CheckoutPanelProps = {
  summary: CheckoutSummary;
  /** When true and total is null, show a "no rule matched" notice instead of the generic placeholder note. */
  hasFlow?: boolean;
};

function formatAmount(amount: number | null, currency: string): string {
  if (amount === null || amount === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function CheckoutPanel({ summary, hasFlow }: CheckoutPanelProps) {
  const { items, subtotal, fees, total, currency } = summary;

  return (
    <aside
      className="w-full lg:w-80 lg:shrink-0 lg:sticky lg:top-6 lg:self-start"
      aria-label="Price summary"
    >
      <div className="rounded-2xl border border-border-soft bg-surface shadow-elev-1">
        <header className="flex items-center gap-3 border-b border-border-soft px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
            <Receipt className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Checkout</h3>
            <p className="text-xs text-slate-500">Updates as you fill in the wizard</p>
          </div>
        </header>

        <div className="px-5 py-4">
          {items.length === 0 ? (
            <p className="rounded-xl bg-surface-muted/60 px-3 py-4 text-center text-xs text-slate-500">
              Your selections will appear here once you start filling in the wizard.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item, index) => (
                <li key={`${item.label}-${index}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    {item.detail ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{item.detail}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                    {formatAmount(item.amount, currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="space-y-2 border-t border-border-soft px-5 py-4 text-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatAmount(subtotal, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Fees &amp; taxes</span>
            <span className="tabular-nums">{formatAmount(fees, currency)}</span>
          </div>
          <div className={`flex items-center justify-between border-t border-border-soft pt-2 text-base font-semibold ${total !== null ? 'text-emerald-600' : 'text-slate-900'}`}>
            <span>Total</span>
            <span className="tabular-nums">{formatAmount(total, currency)}</span>
          </div>
          {total === null && hasFlow ? (
            <p className="pt-1 text-[11px] text-amber-500">
              No pricing rule matched for this combination.
            </p>
          ) : null}
        </footer>
      </div>
    </aside>
  );
}
