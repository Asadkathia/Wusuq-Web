/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { FormEvent, useCallback, useEffect, useState, useTransition } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Plus,
  Receipt,
  Upload,
  Wallet as WalletIcon,
} from 'lucide-react';
import { formatMoney } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import { advanceOnEnter } from '@/lib/form-utils';
import { paymentSettingsClient, PaymentSettings } from '@/lib/payment-settings-client';
import { PaymentMethodDetails, availableMethods, type PayMethod } from '@/components/payment-method-details';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';

type Transaction = {
  id: string;
  amount: number | string;
  paymentMode: string;
  status: string;
  createdAt: string;
  verifiedAt?: string | null;
  note?: string | null;
  ticketId?: string | null;
  referenceNo?: string;
};

type MyWallet = {
  balance: number; // net = credit − outstanding dues (can be negative)
  credit?: number; // prepaid top-up credit (>= 0)
  due?: number; // outstanding ticket dues
  currency?: 'PKR' | 'USD';
  transactions: Transaction[];
};

function txVariant(status: string) {
  if (status === 'VERIFIED') return 'success' as const;
  if (status === 'PENDING_VERIFICATION') return 'warning' as const;
  if (status === 'REJECTED') return 'error' as const;
  return 'neutral' as const;
}

function txLabel(status: string) {
  if (status === 'PENDING_VERIFICATION') return 'Pending';
  if (status === 'VERIFIED') return 'Verified';
  if (status === 'REJECTED') return 'Rejected';
  return status;
}

export function ConsumerWalletBoard() {
  const [data, setData] = useState<MyWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupOpen, setTopupOpen] = useState(false);
  const toast = useToast();
  const currency: 'PKR' | 'USD' = data?.currency ?? 'PKR';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get<MyWallet>('/wallet/me');
      setData(r);
    } catch (err: any) {
      toast.error('Unable to load wallet', err?.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My wallet</h1>
          <p className="mt-1 text-sm text-slate-500">Your balance, top-ups, and auto-deductions.</p>
        </div>
        <Button
          variant="brand"
          size="md"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setTopupOpen(true)}
        >
          Top up
        </Button>
      </div>

      {/* Balance hero */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-500 p-8 text-white shadow-elev-2">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-400 opacity-40 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-brand-700 opacity-50 blur-[120px]" />

        <div className="relative flex items-center gap-3 text-brand-100/90">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20">
            <WalletIcon className="h-4 w-4" />
          </span>
          <p className="text-xs font-medium uppercase tracking-[0.2em]">
            {(data?.balance ?? 0) < 0 ? 'Amount owed' : 'Current balance'}
          </p>
        </div>

        <div className="relative mt-4">
          {loading ? (
            <Skeleton className="h-12 w-48 bg-white/10" />
          ) : (
            <p className="text-5xl font-semibold tracking-tight tabular-nums">
              <span className="font-mono">{formatMoney(data?.balance ?? 0, currency)}</span>
            </p>
          )}
          {/* Breakdown: prepaid credit vs outstanding ticket dues. */}
          {!loading && (data?.due ?? 0) > 0 ? (
            <p className="mt-3 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs ring-1 ring-inset ring-white/20">
              <span className="tabular-nums">{formatMoney(data?.due ?? 0, currency)} owed</span>
              <span className="text-brand-100/60">·</span>
              <span className="tabular-nums">{formatMoney(data?.credit ?? 0, currency)} credit</span>
            </p>
          ) : null}
          <p className="mt-2 text-xs text-brand-100/80">
            {(data?.balance ?? 0) < 0
              ? 'Top up to clear your dues — tickets are released for processing once paid.'
              : 'Funds are used automatically to settle new tickets on completion.'}
          </p>
        </div>
      </div>

      {/* Transactions */}
      <PanelCard>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Transactions</h2>
            <p className="text-xs text-slate-500">Top-ups and deductions.</p>
          </div>
        </div>

        <div className="mt-5 divide-y divide-border-soft rounded-xl ring-1 ring-border-soft bg-surface overflow-hidden">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4">
                <Skeleton className="h-10 w-full" />
              </div>
            ))
          ) : (data?.transactions ?? []).length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
                <Receipt className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-900">No transactions yet</p>
              <p className="mt-1 text-xs text-slate-500">Top up your wallet to get started.</p>
            </div>
          ) : (
            data?.transactions.map((tx) => {
              const isCredit = !tx.ticketId;
              const icon = isCredit ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />;
              return (
                <div key={tx.id} className="flex items-center gap-4 px-4 py-3">
                  <span
                    className={[
                      'flex h-10 w-10 items-center justify-center rounded-xl shrink-0',
                      isCredit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
                    ].join(' ')}
                  >
                    {icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {isCredit ? 'Top-up' : 'Ticket settlement'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(tx.createdAt).toLocaleString()}</span>
                      {tx.paymentMode ? <> · {tx.paymentMode.replace(/_/g, ' ')}</> : null}
                      {tx.note ? <> · {tx.note}</> : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={['text-sm font-semibold tabular-nums', isCredit ? 'text-emerald-700' : 'text-rose-700'].join(' ')}>
                      {isCredit ? '+' : '−'} {formatMoney(Number(tx.amount), currency)}
                    </span>
                    <StatusPill dot label={txLabel(tx.status)} variant={txVariant(tx.status)} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PanelCard>

      <TopupDialog
        open={topupOpen}
        onOpenChange={setTopupOpen}
        onSuccess={() => { setTopupOpen(false); load(); }}
        currency={currency}
      />
    </div>
  );
}

function TopupDialog({
  open,
  onOpenChange,
  onSuccess,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currency: 'PKR' | 'USD';
}) {
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PayMethod>('BANK_TRANSFER');
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setAmount('');
      setPaymentMode('BANK_TRANSFER');
      setReceiptFile(null);
      return;
    }
    let cancelled = false;
    paymentSettingsClient
      .get()
      .then((s) => {
        if (cancelled) return;
        startTransition(() => {
          setSettings(s);
          setPaymentMode((prev) => {
            const methods = availableMethods(s);
            return methods.includes(prev) ? prev : (methods[0] ?? prev);
          });
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, startTransition]);

  const methods = availableMethods(settings);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      toast.error('Invalid amount', 'Please enter a positive number.');
      return;
    }
    setLoading(true);
    try {
      let receiptUrl: string | undefined;
      if (receiptFile) {
        const form = new FormData();
        form.append('file', receiptFile);
        const upload = await apiClient.post<{ url: string }>('/wallet/receipt', form);
        receiptUrl = upload.url;
      }
      // Consumer top-up: backend derives target user from JWT — do NOT
      // send a userId here.
      await apiClient.post('/wallet/topup', {
        amount: amountNum,
        paymentMode,
        currency,
        receiptUrl,
      });
      toast.success('Top-up submitted', 'Your request is pending verification.');
      onSuccess();
    } catch (err: any) {
      toast.error('Top-up failed', err?.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Top up wallet</DialogTitle>
          <DialogDescription>
            Enter your top-up amount and upload the bank receipt. We&rsquo;ll verify within a few hours.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} onKeyDown={advanceOnEnter} className="space-y-4">
          <FormField label="Amount (PKR)" required htmlFor="amount">
            <Input
              id="amount"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="e.g., 5000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </FormField>

          <FormField label="Payment mode" required htmlFor="paymentMode">
            {methods.length === 0 ? (
              <p className="text-sm text-amber-600">
                Payment details are not configured yet. Please contact support.
              </p>
            ) : (
              <PaymentMethodDetails settings={settings} method={paymentMode} onChange={setPaymentMode} />
            )}
          </FormField>

          <FormField label="Receipt" hint="Upload a photo of your payment receipt (optional, recommended)">
            <label className={[
              'flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 transition-colors',
              receiptFile ? 'border-emerald-300 bg-emerald-50/40' : 'border-border-soft hover:bg-surface-muted',
            ].join(' ')}>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                {receiptFile ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Upload className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {receiptFile ? receiptFile.name : 'Click to upload a file'}
                </p>
                <p className="text-xs text-slate-500">PNG, JPG, or PDF · up to 10MB</p>
              </div>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </FormField>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="brand" loading={loading} disabled={methods.length === 0}>
              Submit top-up
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
