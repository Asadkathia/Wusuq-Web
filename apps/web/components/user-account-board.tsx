'use client';

/**
 * One person's account, staff-side: profile, ticket history, money.
 * See app/(portal)/manage-users/[id]/page.tsx for the batch-7 context.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, MapPin, Phone, Ticket as TicketIcon, Wallet } from 'lucide-react';
import { formatStaffMoney, toCurrency } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import { PanelCard } from '@/components/ui/panel-card';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusPill } from '@/components/ui/status-pill';
import { DataTableShell } from '@/components/ui/data-table-shell';
import {
  normalizeTransactionHistory,
  transactionAmountLabel,
  transactionDateLabel,
  transactionTypeLabel,
  type WalletTransactionRow,
} from '@/lib/wallet-transactions';

type Account = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  city?: string | null;
  district?: string | null;
  province?: string | null;
  address?: string | null;
  currency?: string | null;
  walletBalance?: number | string | null;
  consumerKind?: string | null;
};

type Payout = {
  id: string;
  createdAt: string;
  recordedBy?: string | null;
  amount: number;
  method: string;
  reference?: string | null;
  note?: string | null;
};

type TicketRow = {
  id: string;
  batchNo: string;
  status: string;
  totalAmount?: number | string | null;
  amountPaid?: number | string | null;
  currency?: string | null;
  fxRateToPkr?: number | string | null;
  service?: { name?: string | null } | null;
  createdAt?: string | null;
};

export function UserAccountBoard({ userId }: { userId: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [transactions, setTransactions] = useState<WalletTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Batch-7 2.6 — representative payouts.
  const [payouts, setPayouts] = useState<{ items: Payout[]; totalPaidOut: number } | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('BANK_TRANSFER');
  const [payoutReference, setPayoutReference] = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const user = await apiClient.get<Account>(`/users/${userId}`);
      setAccount(user);

      // A representative's tickets are their ASSIGNMENTS; everyone else's are
      // the tickets they own. Same endpoint, different scope key.
      const scopeKey = user.role === 'representative' ? 'representativeId' : 'consumerId';
      const list = await apiClient
        .get<{ items?: TicketRow[] }>(`/tickets?limit=200&${scopeKey}=${encodeURIComponent(userId)}`)
        .catch(() => ({ items: [] as TicketRow[] }));
      setTickets(list.items ?? []);

      const tx = await apiClient
        .get<unknown>(`/wallet/${userId}/transactions`)
        .catch(() => null);
      setTransactions(normalizeTransactionHistory(tx));

      if (user.role === 'representative') {
        const p = await apiClient
          .get<{ items: Payout[]; totalPaidOut: number }>(`/users/${userId}/payouts`)
          .catch(() => null);
        setPayouts(p);
      } else {
        setPayouts(null);
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to load account');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = toCurrency(account?.currency);
  const billed = tickets.reduce((sum, t) => sum + Number(t.totalAmount ?? 0), 0);
  const paid = tickets.reduce((sum, t) => sum + Number(t.amountPaid ?? 0), 0);
  const due = Math.max(0, billed - paid);
  const isRepresentative = account?.role === 'representative';

  const recordPayout = async () => {
    const amount = Number(payoutAmount);
    if (!amount || amount <= 0 || payoutBusy) return;
    setPayoutBusy(true);
    try {
      await apiClient.post(`/users/${userId}/payouts`, {
        amount,
        method: payoutMethod,
        reference: payoutReference.trim() || undefined,
      });
      setPayoutAmount('');
      setPayoutReference('');
      await load();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Failed to record payout');
    } finally {
      setPayoutBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title={account?.name || 'Account'}
        description={
          account
            ? `${account.role ?? 'user'}${account.consumerKind ? ` · ${account.consumerKind}` : ''}`
            : 'Loading…'
        }
        action={
          <Link
            href={isRepresentative ? '/manage-users/representatives' : '/manage-users/users'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        }
      />

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}
      {loading ? <p className="py-10 text-center text-slate-400">Loading account…</p> : null}

      {account && !loading ? (
        <>
          <PanelCard className="p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <Mail className="h-4 w-4 text-slate-400" /> {account.email || '—'}
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Phone className="h-4 w-4 text-slate-400" /> {account.phone || '—'}
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <MapPin className="h-4 w-4 text-slate-400" />
                {[account.city, account.district, account.province].filter(Boolean).join(', ') || '—'}
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Wallet className="h-4 w-4 text-slate-400" />
                {formatStaffMoney(account.walletBalance, currency)} credit
              </div>
            </div>
            {account.address ? (
              <p className="mt-3 border-t border-border-soft pt-3 text-sm text-slate-600">{account.address}</p>
            ) : null}
          </PanelCard>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Tickets" value={String(tickets.length)} icon={<TicketIcon className="opacity-50" />} />
            <StatCard title="Billed" value={formatStaffMoney(billed, currency)} icon={<Wallet className="opacity-50" />} />
            <StatCard title="Paid" value={formatStaffMoney(paid, currency)} icon={<Wallet className="opacity-50" />} />
            <StatCard title="Outstanding" value={formatStaffMoney(due, currency)} icon={<Wallet className="opacity-50" />} />
          </div>

          <div>
            <h3 className="mb-3 px-1 text-lg font-semibold text-slate-900">
              {isRepresentative ? 'Assigned tickets' : 'Tickets'}
            </h3>
            <DataTableShell>
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Batch</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Service</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 text-sm font-medium text-slate-900">
                        <Link href={`/tickets/${t.id}`} className="hover:text-primary-700">{t.batchNo}</Link>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">{t.service?.name ?? '—'}</td>
                      <td className="px-6 py-3 text-right text-sm tabular-nums text-slate-900">
                        {formatStaffMoney(t.totalAmount, toCurrency(t.currency), t.fxRateToPkr)}
                      </td>
                      <td className="px-6 py-3"><StatusPill label={t.status} /></td>
                    </tr>
                  ))}
                  {tickets.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">No tickets yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </DataTableShell>
          </div>

          {/* Batch-7 2.6: "we will see how to send money to this account —
              just like we are sending money to the client, we will also send
              money to the representative." Recorded in the audit trail; see
              RecordPayoutDto for why there is no payout ledger yet. */}
          {isRepresentative ? (
            <div>
              <h3 className="mb-3 px-1 text-lg font-semibold text-slate-900">
                Payouts{payouts ? ` — PKR ${payouts.totalPaidOut.toLocaleString()} paid out` : ''}
              </h3>
              <PanelCard className="p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex-1 min-w-[140px]">
                    <span className="text-xs font-medium text-slate-600">Amount (PKR)</span>
                    <input
                      type="number"
                      min="0"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      className="mt-1 block w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                    />
                  </label>
                  <label className="flex-1 min-w-[140px]">
                    <span className="text-xs font-medium text-slate-600">Method</span>
                    <select
                      value={payoutMethod}
                      onChange={(e) => setPayoutMethod(e.target.value)}
                      className="mt-1 block w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                    >
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="JAZZ_CASH">JazzCash</option>
                      <option value="EASY_PAISA">EasyPaisa</option>
                    </select>
                  </label>
                  <label className="flex-1 min-w-[160px]">
                    <span className="text-xs font-medium text-slate-600">Reference (optional)</span>
                    <input
                      type="text"
                      value={payoutReference}
                      onChange={(e) => setPayoutReference(e.target.value)}
                      className="mt-1 block w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={recordPayout}
                    disabled={payoutBusy || !payoutAmount}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {payoutBusy ? 'Recording…' : 'Record payout'}
                  </button>
                </div>
                {payouts && payouts.items.length > 0 ? (
                  <ul className="mt-4 divide-y divide-border-soft border-t border-border-soft">
                    {payouts.items.map((po) => (
                      <li key={po.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-slate-600">
                          {new Date(po.createdAt).toLocaleDateString()} · {po.method.replace(/_/g, ' ')}
                          {po.reference ? ` · ${po.reference}` : ''}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-900">
                          PKR {po.amount.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">No payouts recorded yet.</p>
                )}
              </PanelCard>
            </div>
          ) : null}

          <div>
            <h3 className="mb-3 px-1 text-lg font-semibold text-slate-900">Transaction history</h3>
            <PanelCard className="divide-y divide-border-soft p-0">
              {transactions.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-slate-500">No wallet transactions.</p>
              ) : (
                transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{transactionTypeLabel(t.type)}</p>
                      <p className="text-xs text-slate-500">{transactionDateLabel(t.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${t.type === 'TOPUP' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {transactionAmountLabel(t)}
                      </p>
                      <p className="text-xs text-slate-400">{t.status ?? '—'}</p>
                    </div>
                  </div>
                ))
              )}
            </PanelCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
