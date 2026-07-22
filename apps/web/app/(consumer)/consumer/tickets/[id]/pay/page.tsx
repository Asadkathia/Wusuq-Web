'use client';

import { FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Building2, CheckCircle2, Clock, Upload } from 'lucide-react';
import { paymentModelFor, formatMoney } from '@wusuq/shared';
import { apiClient, ApiError } from '@/lib/api-client';
import { paymentSettingsClient, PaymentSettings } from '@/lib/payment-settings-client';
import { PaymentMethodDetails, availableMethods, type PayMethod } from '@/components/payment-method-details';
import { isPkrRail, payableInPkr, submitAmountFromPkr } from '@/lib/pay-amount';
import { advanceOnEnter } from '@/lib/form-utils';
import { PanelCard } from '@/components/ui/panel-card';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

interface TicketSummary {
  id: string;
  batchNo: string;
  status?: string | null;
  intakeFlow?: string | null;
  serviceCost?: number | string | null;
  totalAmount?: number | string | null;
  amountPaid?: number | string | null;
  remainderFinalizedAt?: string | null;
  currency?: 'PKR' | 'USD' | null;
  fxRateToPkr?: number | string | null;
  service?: { name?: string | null } | null;
}

function toNum(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function currencyOf(ticket: TicketSummary | null): 'PKR' | 'USD' {
  return ticket?.currency ?? 'PKR';
}

/**
 * Compute the amount currently due for a ticket:
 * - SPLIT, pre-finalize:  serviceCost (phase-1 base only)
 * - SPLIT, finalized:     totalAmount − amountPaid
 * - ONE_TIME:             totalAmount − amountPaid
 */
function computeDueNow(ticket: TicketSummary): number {
  const model = paymentModelFor(ticket.intakeFlow, ticket.currency ?? undefined);
  const serviceCost = toNum(ticket.serviceCost);
  const totalAmount = toNum(ticket.totalAmount);
  const amountPaid = toNum(ticket.amountPaid);

  if (model === 'SPLIT' && !ticket.remainderFinalizedAt) {
    // Phase-1: base cost minus anything already paid toward it
    return Math.max(0, serviceCost - amountPaid);
  }
  // Phase-2 finalized or ONE_TIME: remaining balance of the full total
  return Math.max(0, totalAmount - amountPaid);
}

/**
 * For SPLIT flows, the consumer may choose to pay the full finalized amount
 * upfront (so wallet has excess that auto-settles the remainder later).
 */
function computeFullUpfrontAmount(ticket: TicketSummary): number {
  const model = paymentModelFor(ticket.intakeFlow, ticket.currency ?? undefined);
  if (model !== 'SPLIT') return 0;
  const totalAmount = toNum(ticket.totalAmount);
  const amountPaid = toNum(ticket.amountPaid);
  return Math.max(0, totalAmount - amountPaid);
}

/**
 * The amount field's value follows the PAYMENT RAIL, not just the ticket's
 * currency (task-8 rework):
 *  - PKR ticket, any rail: the raw amount due — there is nothing to convert.
 *  - USD ticket on a domestic PKR rail (JazzCash/EasyPaisa): the PKR
 *    equivalent at the FX rate stamped at intake — '' when no rate is
 *    stamped, so the triple guard (no prefill / disabled input / disabled
 *    submit) below can kick in.
 *  - USD ticket on BANK_TRANSFER: the raw USD amount. The consumer wires
 *    USD directly and the receiving bank converts on arrival, so there is
 *    nothing for us to convert and a missing rate never blocks this rail.
 */
function computeAmountField(ticket: TicketSummary, method: PayMethod | null): string {
  const due = computeDueNow(ticket);
  const currency = currencyOf(ticket);
  if (currency === 'USD' && isPkrRail(method)) {
    const payable = payableInPkr(due, currency, ticket.fxRateToPkr);
    return payable !== null && payable > 0 ? String(payable) : '';
  }
  return due > 0 ? String(due) : '';
}

export default function PayTicketPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const ticketId = params?.id;

  const [ticket, setTicket] = useState<TicketSummary | null>(null);
  const [bankDetails, setBankDetails] = useState<PaymentSettings | null>(null);
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Payment form state
  const [amountStr, setAmountStr] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [, startTransition] = useTransition();
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!ticketId || hasFetched.current) return;
    hasFetched.current = true;

    let cancelled = false;

    (async () => {
      try {
        const [ticketData, settings] = await Promise.all([
          apiClient.get<TicketSummary>(`/tickets/${ticketId}`),
          paymentSettingsClient.get().catch(() => null),
        ]);
        if (cancelled) return;
        startTransition(() => {
          setTicket(ticketData);
          setBankDetails(settings);
          setMethod(availableMethods(settings)[0] ?? null);
          // Amount-field prefill is rail-dependent (see the effect below,
          // keyed on [ticket, method]) — don't duplicate that logic here.
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load ticket';
        startTransition(() => setLoadError(message));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // Recompute the amount field whenever the ticket loads OR the payment
  // method changes. This is what covers the initial prefill AND a method
  // switch — leaving a stale PKR figure sitting in a field now labelled
  // "Amount (USD)" (or vice versa) after a rail switch is exactly the
  // mislabeled-number bug this whole plan exists to remove.
  useEffect(() => {
    if (!ticket) return;
    startTransition(() => setAmountStr(computeAmountField(ticket, method)));
  }, [ticket, method]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ticketId || submitting) return;

    if (!bankDetails || availableMethods(bankDetails).length === 0) {
      setSubmitError('Bank details are not available. Please contact support.');
      return;
    }

    const enteredAmount = Number(amountStr);
    if (!enteredAmount || enteredAmount <= 0) {
      setSubmitError('Please enter a valid amount.');
      return;
    }

    // Conversion follows the RAIL, not just the ticket currency. On a
    // domestic PKR rail (JazzCash/EasyPaisa) a USD ticket's entered figure
    // IS PKR and must be converted back to USD before crediting the wallet
    // ledger — submitting it raw would wildly over-credit a USD wallet (e.g.
    // crediting "9975" as if it were $9,975). On BANK_TRANSFER the consumer
    // wires USD directly and the receiving bank converts on arrival, so
    // whatever they typed is exactly what gets submitted — no conversion, no
    // rate dependency, never blocked by a missing rate. A PKR ticket's
    // entered amount already IS its billing-currency amount on every rail.
    let amount: number;
    if (currencyOf(ticket) === 'USD' && isPkrRail(method)) {
      const converted = submitAmountFromPkr(enteredAmount, currencyOf(ticket), ticket?.fxRateToPkr);
      if (converted === null) {
        setSubmitError('FX rate not set — please contact support.');
        return;
      }
      amount = converted;
    } else {
      amount = enteredAmount;
    }

    startTransition(() => {
      setSubmitError(null);
      setSubmitting(true);
    });

    try {
      // Step 1: Upload receipt if provided
      let receiptUrl: string | undefined;
      if (receiptFile) {
        const form = new FormData();
        form.append('file', receiptFile);
        const upload = await apiClient.post<{ url: string }>('/wallet/receipt', form);
        receiptUrl = upload.url;
      }

      // Step 2: Submit as a wallet topup tagged to this ticket.
      // The backend /wallet/topup endpoint sets the user from JWT; ticketId is
      // forwarded so Task 1.5 can tag it as TICKET_PAYMENT once the DTO is wired.
      await apiClient.post('/wallet/topup', {
        amount,
        paymentMode: method ?? 'BANK_TRANSFER',
        currency: currencyOf(ticket),
        receiptUrl,
        ticketId,
      });

      startTransition(() => setSubmitted(true));
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not submit payment';
      startTransition(() => {
        setSubmitError(message);
        setSubmitting(false);
      });
    }
  };

  const handlePayLater = () => {
    // "Pay later" doesn't change the ticket — it stays UNPAID and its remaining
    // amount shows as a due in the wallet (negative net balance). Confirm so the
    // consumer understands where the amount went.
    const due = ticket ? computeDueNow(ticket) : 0;
    if (due > 0) {
      toast.info(
        `${formatMoney(due, currencyOf(ticket))} added to your wallet as due`,
        'Pay anytime from My Wallet — your ticket is released for processing once paid.',
      );
    }
    router.push('/consumer/dashboard');
  };

  // ── Loading / error states ───────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <PanelCard>
          <h1 className="mb-2 text-lg font-semibold text-slate-900">Unable to load ticket</h1>
          <p className="text-sm text-rose-600">{loadError}</p>
          <div className="mt-4">
            <Link href="/consumer/dashboard" className="text-sm font-medium text-brand-600 underline">
              Back to dashboard
            </Link>
          </div>
        </PanelCard>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <PanelCard>
          <p className="text-sm text-slate-600">Loading ticket…</p>
        </PanelCard>
      </div>
    );
  }

  // ── Already paid (fully settled: amountPaid >= totalAmount) ─────────────

  const totalAmt = toNum(ticket.totalAmount);
  const paidAmt = toNum(ticket.amountPaid);
  if (totalAmt > 0 && paidAmt >= totalAmt) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <PanelCard>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">This ticket is already paid</h1>
              <p className="mt-1 text-sm text-slate-600">
                Ticket <span className="font-mono">{ticket.batchNo}</span> has been fully settled.
              </p>
              <div className="mt-4">
                <Link href="/consumer/dashboard" className="text-sm font-medium text-brand-600 underline">
                  Back to dashboard
                </Link>
              </div>
            </div>
          </div>
        </PanelCard>
      </div>
    );
  }

  // ── Submission success ────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <PanelCard>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Payment submitted</h1>
              <p className="mt-1 text-sm text-slate-600">
                Your payment has been submitted for verification. We&rsquo;ll notify you once it&rsquo;s approved.
              </p>
              <div className="mt-4">
                <Link href="/consumer/dashboard" className="text-sm font-medium text-brand-600 underline">
                  Back to dashboard
                </Link>
              </div>
            </div>
          </div>
        </PanelCard>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const currency = currencyOf(ticket);
  const model = paymentModelFor(ticket.intakeFlow, ticket.currency ?? undefined);
  const dueNow = computeDueNow(ticket);
  const fullUpfront = computeFullUpfrontAmount(ticket);
  // Show "pay full amount upfront" option only for SPLIT flows where total > due-now
  const canPayUpfront = model === 'SPLIT' && fullUpfront > dueNow && fullUpfront > 0;
  const currentAmount = Number(amountStr) || 0;
  const hasPaymentMethod = availableMethods(bankDetails).length > 0;

  // Which rail is picked decides whether a conversion is even in play:
  //  - JazzCash/EasyPaisa (isPkrRail true) are domestic PKR rails — a USD
  //    ticket's payable figure is its PKR equivalent at the rate stamped at
  //    intake, and a missing rate blocks the rail entirely (triple guard).
  //  - BANK_TRANSFER wires USD directly; the receiving bank converts on
  //    arrival, so a missing rate must never block it — the indicative PKR
  //    line below is purely informational.
  const isUsd = currency === 'USD';
  const railIsPkr = isPkrRail(method);
  const payablePkr = isUsd ? payableInPkr(dueNow, currency, ticket.fxRateToPkr) : null;
  const fxRateMissing = isUsd && railIsPkr && payablePkr === null;
  const amountLabel = isUsd && !railIsPkr ? 'Amount (USD)' : 'Amount (PKR)';

  let amountHint: string | undefined;
  if (!fxRateMissing) {
    if (isUsd && railIsPkr && payablePkr !== null) {
      amountHint = `Billed ${formatMoney(dueNow, currency)} · payable ${formatMoney(payablePkr, 'PKR')} at the rate stamped when you ordered — credits ${formatMoney(dueNow, currency)} to your wallet`;
    } else if (isUsd && !railIsPkr && payablePkr !== null) {
      // Informational only: a null rate must not reach here (handled by the
      // `payablePkr !== null` guard) and must never block or disable this rail.
      amountHint = `≈ ${formatMoney(payablePkr, 'PKR')} will reach the account — your bank sets the final rate`;
    }
  }

  const placeholderAmount =
    isUsd && !railIsPkr ? (dueNow > 0 ? dueNow : 50) : payablePkr && payablePkr > 0 ? payablePkr : 5000;

  // ── Main payment form ─────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Complete your payment</h1>
        <p className="mt-1 text-sm text-slate-600">
          Transfer the amount to our bank account and upload your receipt below.
        </p>
      </div>

      {/* Ticket summary */}
      <PanelCard className="mb-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-slate-500">Ticket</span>
            <span className="font-mono text-sm text-slate-900">{ticket.batchNo}</span>
          </div>
          {ticket.service?.name ? (
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-slate-500">Service</span>
              <span className="text-sm text-slate-900">{ticket.service.name}</span>
            </div>
          ) : null}
          {model === 'SPLIT' ? (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="uppercase tracking-wide">Billing</span>
              <span>
                {ticket.remainderFinalizedAt
                  ? 'Final payment (phase 2)'
                  : 'Phase 1 — base charge only'}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border-soft pt-3">
            <span className="text-sm font-medium text-slate-700">Amount due now</span>
            <span className="text-lg font-semibold text-slate-900">
              {formatMoney(dueNow, currency)}
            </span>
          </div>
        </div>
      </PanelCard>

      {/* Payment method details */}
      {availableMethods(bankDetails).length > 0 ? (
        <PanelCard className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-900">Payment details</h2>
          </div>
          <PaymentMethodDetails settings={bankDetails} method={method} onChange={setMethod} />
        </PanelCard>
      ) : (
        <PanelCard className="mb-4">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="text-sm">Bank details are not configured yet. Please contact support.</p>
          </div>
        </PanelCard>
      )}

      {/* Payment form */}
      <PanelCard className="mb-4">
        <form onSubmit={handleSubmit} onKeyDown={advanceOnEnter} className="space-y-4">
          <FormField
            label={amountLabel}
            required
            htmlFor="pay-amount"
            error={fxRateMissing ? 'FX rate not set — please contact support' : undefined}
            hint={amountHint}
          >
            <Input
              id="pay-amount"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder={fxRateMissing ? '' : `e.g., ${placeholderAmount}`}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              disabled={fxRateMissing}
              required
            />
          </FormField>

          {/* Option to pay full SPLIT amount upfront */}
          {canPayUpfront ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAmountStr(String(dueNow))}
                className={[
                  'rounded-xl border px-3 py-2 text-sm font-medium transition-[background-color,border-color,color] duration-150',
                  currentAmount === dueNow
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-border-soft text-slate-700 hover:bg-surface-muted',
                ].join(' ')}
              >
                Phase 1 only — {formatMoney(dueNow, currency)}
              </button>
              <button
                type="button"
                onClick={() => setAmountStr(String(fullUpfront))}
                className={[
                  'rounded-xl border px-3 py-2 text-sm font-medium transition-[background-color,border-color,color] duration-150',
                  currentAmount === fullUpfront
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-border-soft text-slate-700 hover:bg-surface-muted',
                ].join(' ')}
              >
                Full amount upfront — {formatMoney(fullUpfront, currency)}
              </button>
            </div>
          ) : null}

          {/* Receipt upload */}
          <FormField
            label="Payment receipt"
            hint="Upload a photo or PDF of your bank receipt (optional, recommended)"
          >
            <label
              className={[
                'flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 transition-colors',
                receiptFile
                  ? 'border-emerald-300 bg-emerald-50/40'
                  : 'border-border-soft hover:bg-surface-muted',
              ].join(' ')}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500 shrink-0">
                {receiptFile ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {receiptFile ? receiptFile.name : 'Click to upload a file'}
                </p>
                <p className="text-xs text-slate-500">PNG, JPG, or PDF · up to 10 MB</p>
              </div>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={!hasPaymentMethod}
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </FormField>

          {submitError ? (
            <p className="text-sm text-rose-600">{submitError}</p>
          ) : null}

          <div className="flex flex-col gap-3 pt-1">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              disabled={!hasPaymentMethod || submitting || fxRateMissing}
              fullWidth
            >
              Submit payment
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={handlePayLater}
              disabled={submitting}
              leftIcon={<Clock className="h-4 w-4" />}
              fullWidth
            >
              Pay later
            </Button>
          </div>
        </form>
      </PanelCard>
    </div>
  );
}
