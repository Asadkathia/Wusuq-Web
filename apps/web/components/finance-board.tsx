/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */


'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useMemo, startTransition } from 'react';
import { apiClient } from '@/lib/api-client';
import { paymentsClient, type PendingWalletTransaction } from '@/lib/payments-client';
import { paymentSettingsClient, type PaymentSettings, type UpdatePaymentSettingsPayload } from '@/lib/payment-settings-client';
import { SectionHeader } from '@/components/ui/section-header';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatCard } from '@/components/ui/stat-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Banknote, FileText, Send, Download, CheckCircle, RefreshCw, HandCoins, Pencil, X, Check, CheckCircle2, XCircle, ExternalLink, Building2, SlidersHorizontal, Upload } from 'lucide-react';

type FinanceItem = {
  id: string;
  batchNo: string;
  consumer: { id: string; name: string };
  service: { id: string; name: string; category: string };
  charges: {
    serviceCost: number;
    deliveryCharges: number;
    printingCharges: number;
    attestedCharges: number;
    nonAttestedCharges: number;
    additionalCharges: number;
    discountPrice: number;
    additionalServiceCost: number;
  };
  totalAmount: number;
  amountPaid: number;
  remaining: number;
  clerkPayout: number;
  status: string;
  invoice?: { invoiceNo: string; status: string } | null;
};

export function FinanceBoard() {
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  // ── Reconcile proof files (per-ticket, optional) ─────────────────────
  const [reconcileFiles, setReconcileFiles] = useState<Record<string, File>>({});
  // Fix 1: in-flight guard — keyed by ticket id
  const [reconciling, setReconciling] = useState<Record<string, boolean>>({});
  // Fix 3: bump key to remount <input type="file"> after successful reconcile
  const [fileInputKeys, setFileInputKeys] = useState<Record<string, number>>({});

  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [editServiceCost, setEditServiceCost] = useState('');
  const [editDelivery, setEditDelivery] = useState('');
  const [editPrinting, setEditPrinting] = useState('');
  const [editAttested, setEditAttested] = useState('');
  const [editNonAttested, setEditNonAttested] = useState('');
  const [editAdditionalCharges, setEditAdditionalCharges] = useState('');
  const [editAdditional, setEditAdditional] = useState('');
  const [editDiscount, setEditDiscount] = useState('');

  // ── Payment approval queue ─────────────────────────────────────────────
  const [pendingTxns, setPendingTxns] = useState<PendingWalletTransaction[]>([]);
  const [txnActionLoading, setTxnActionLoading] = useState<string | null>(null);

  // ── Wallet adjustment form ─────────────────────────────────────────────
  const [adjustUserId, setAdjustUserId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  // ── Bank-details editor ────────────────────────────────────────────────
  const [bankSettings, setBankSettings] = useState<PaymentSettings | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankForm, setBankForm] = useState<UpdatePaymentSettingsPayload>({
    bankName: '',
    accountTitle: '',
    accountNumber: '',
    iban: '',
    instructions: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>('/finance?limit=200');
      setItems(result.items ?? []);
    } catch (error: any) {
      if (error.message.includes('401')) {
        setMessage('Session expired. Please sign in again.');
      } else {
        setMessage(error.message || 'Failed to load finance');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPendingTxns = useCallback(async () => {
    try {
      const result = await apiClient.get<any>('/wallet?limit=200');
      const all: PendingWalletTransaction[] = result.pendingTopups ?? [];
      // Filter to TOPUP and TICKET_PAYMENT types only
      startTransition(() => {
        setPendingTxns(
          all.filter(
            (t) => t.type === 'TOPUP' || t.type === 'TICKET_PAYMENT',
          ),
        );
      });
    } catch {
      // silently ignore — admin wallet read may not be available in all roles
    }
  }, []);

  const loadBankSettings = useCallback(async () => {
    setBankLoading(true);
    try {
      const settings = await paymentSettingsClient.get();
      startTransition(() => {
        setBankSettings(settings);
        if (settings) {
          setBankForm({
            bankName: settings.bankName ?? '',
            accountTitle: settings.accountTitle ?? '',
            accountNumber: settings.accountNumber ?? '',
            iban: settings.iban ?? '',
            instructions: settings.instructions ?? '',
          });
        }
      });
    } catch {
      // settings may not exist yet
    } finally {
      setBankLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadPendingTxns();
    loadBankSettings();
  }, [load, loadPendingTxns, loadBankSettings]);

  const stats = useMemo(() => {
    const totalOut = items.reduce((acc, item) => acc + item.remaining, 0);
    const totalCol = items.reduce((acc, item) => acc + item.amountPaid, 0);
    const generated = items.filter(i => i.invoice).length;
    return { outstanding: totalOut, collected: totalCol, invoices: generated };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const l = search.toLowerCase();
    return items.filter(i => i.batchNo.toLowerCase().includes(l) || i.consumer.name.toLowerCase().includes(l) || i.service.name.toLowerCase().includes(l) || (i.invoice?.invoiceNo || '').toLowerCase().includes(l));
  }, [items, search]);

  const reconcile = async (ticketId: string) => {
    // Fix 1: prevent double-submission while an upload/POST is in flight
    if (reconciling[ticketId]) return;

    const amount = Number(amounts[ticketId] ?? 0);
    if (amount <= 0) return setMessage('Enter valid amount');

    setMessage(''); // clear stale feedback before new attempt
    setReconciling(s => ({ ...s, [ticketId]: true }));

    try {
      // Upload proof first if a file was attached — abort reconcile on failure.
      let receiptUrl: string | undefined;
      const proofFile = reconcileFiles[ticketId];
      if (proofFile) {
        try {
          const form = new FormData();
          form.append('file', proofFile);
          const upload = await apiClient.post<{ url: string }>('/wallet/receipt', form);
          receiptUrl = upload.url;
        } catch (uploadErr: any) {
          setMessage(uploadErr.message || 'Proof upload failed — reconcile cancelled');
          return;
        }
      }

      await apiClient.post(`/finance/${ticketId}/reconcile`, {
        amount,
        paymentMode: 'BANK_TRANSFER',
        currency: 'PKR',
        ...(receiptUrl ? { receiptUrl } : {}),
      });
      setMessage('Payment reconciled');
      setAmounts(s => ({ ...s, [ticketId]: '' }));
      setReconcileFiles(s => {
        const next = { ...s };
        delete next[ticketId];
        return next;
      });
      // Fix 3: bump key so the file <input> remounts — allows re-selecting the same filename
      setFileInputKeys(s => ({ ...s, [ticketId]: (s[ticketId] ?? 0) + 1 }));
      load();
    } catch (error: any) {
      setMessage(error.message || 'Reconcile failed');
    } finally {
      // Fix 1: always clear in-flight marker so the button re-enables
      setReconciling(s => {
        const next = { ...s };
        delete next[ticketId];
        return next;
      });
    }
  };

  const resetChargeEdit = () => {
    setEditingChargeId(null);
    setEditServiceCost('');
    setEditDelivery('');
    setEditPrinting('');
    setEditAttested('');
    setEditNonAttested('');
    setEditAdditionalCharges('');
    setEditAdditional('');
    setEditDiscount('');
  };

  const updateCharge = async (ticketId: string) => {
    try {
      const body: Record<string, number> = {};
      if (editServiceCost !== '') body.serviceCost = Number(editServiceCost);
      if (editDelivery !== '') body.deliveryCharges = Number(editDelivery);
      if (editPrinting !== '') body.printingCharges = Number(editPrinting);
      if (editAttested !== '') body.attestedCharges = Number(editAttested);
      if (editNonAttested !== '') body.nonAttestedCharges = Number(editNonAttested);
      if (editAdditionalCharges !== '') body.additionalCharges = Number(editAdditionalCharges);
      if (editAdditional !== '') body.additionalServiceCost = Number(editAdditional);
      if (editDiscount !== '') body.discountPrice = Number(editDiscount);
      if (Object.keys(body).length === 0) return setMessage('No changes to save');
      await apiClient.patch(`/finance/${ticketId}/charge`, body);
      setMessage('Charge updated');
      resetChargeEdit();
      load();
    } catch (error: any) {
      setMessage(error.message || 'Update failed');
    }
  };

  const generateInvoice = async (ticketId: string) => {
    try {
      await apiClient.post(`/finance/${ticketId}/invoice/generate`);
      setMessage('Invoice generated');
      load();
    } catch (error: any) {
      setMessage(error.message || 'Generate failed');
    }
  };

  const sendInvoice = async (ticketId: string) => {
    try {
      await apiClient.post(`/finance/${ticketId}/invoice/send`);
      setMessage('Invoice sent');
      load();
    } catch (error: any) {
      setMessage(error.message || 'Send failed');
    }
  };

  const downloadInvoice = async (ticketId: string) => {
    try {
      const result = await apiClient.get<any>(`/finance/${ticketId}/invoice/download`);
      const isPdf = result.contentType === 'application/pdf';
      let blob: Blob;
      if (isPdf) {
        const binary = atob(result.content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], { type: 'application/pdf' });
      } else {
        blob = new Blob([result.content], { type: result.contentType });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename || `invoice-${ticketId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Invoice downloaded');
    } catch (error: any) {
      setMessage(error.message || 'Download failed');
    }
  };

  // ── Payment approval queue actions ────────────────────────────────────
  const approveTxn = async (id: string) => {
    setTxnActionLoading(id);
    try {
      await paymentsClient.verifyTransaction(id);
      setMessage('Payment approved and wallet credited.');
      await loadPendingTxns();
      await load();
    } catch (error: any) {
      setMessage(error.message || 'Approve failed');
    } finally {
      setTxnActionLoading(null);
    }
  };

  const rejectTxn = async (id: string) => {
    setTxnActionLoading(id);
    try {
      await paymentsClient.rejectTransaction(id);
      setMessage('Payment rejected.');
      await loadPendingTxns();
    } catch (error: any) {
      setMessage(error.message || 'Reject failed');
    } finally {
      setTxnActionLoading(null);
    }
  };

  const viewReceipt = async (receiptUrl: string) => {
    try {
      if (!receiptUrl || typeof receiptUrl !== 'string') {
        setMessage('Invalid receipt');
        return;
      }
      const m = receiptUrl.match(
        /(?:^|\/)(?:uploads\/wallet-receipts|wallet\/receipt)\/([^/?#]+)$/,
      );
      if (!m || !m[1]) {
        setMessage('Invalid receipt');
        return;
      }
      const receiptId = m[1];
      if (!/^[\w-]+$/.test(receiptId)) {
        setMessage('Invalid receipt');
        return;
      }
      const { blob } = await apiClient.getBlob(`/wallet/receipt/${receiptId}`);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error: any) {
      setMessage(error.message || 'Receipt download failed');
    }
  };

  // ── Wallet adjustment ──────────────────────────────────────────────────
  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(adjustAmount);
    if (!adjustUserId.trim()) return setMessage('User ID is required');
    if (!adjustNote.trim()) return setMessage('Note is required');

    setAdjustLoading(true);
    try {
      await paymentsClient.adjustWallet(adjustUserId.trim(), amount, adjustNote.trim());
      setMessage(
        `Wallet ${amount >= 0 ? 'credited' : 'debited'} by PKR ${Math.abs(amount).toLocaleString()}.`,
      );
      setAdjustUserId('');
      setAdjustAmount('');
      setAdjustNote('');
      await loadPendingTxns();
    } catch (error: any) {
      setMessage(error.message || 'Adjustment failed');
    } finally {
      setAdjustLoading(false);
    }
  };

  // ── Bank-details editor ────────────────────────────────────────────────
  const saveBankSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.bankName.trim()) return setMessage('Bank name is required');
    if (!bankForm.accountTitle.trim()) return setMessage('Account title is required');
    if (!bankForm.accountNumber.trim()) return setMessage('Account number is required');

    setBankSaving(true);
    try {
      const saved = await paymentSettingsClient.update({
        bankName: bankForm.bankName.trim(),
        accountTitle: bankForm.accountTitle.trim(),
        accountNumber: bankForm.accountNumber.trim(),
        iban: bankForm.iban?.trim() || undefined,
        instructions: bankForm.instructions?.trim() || undefined,
      });
      startTransition(() => {
        setBankSettings(saved);
      });
      setMessage('Bank details saved successfully.');
    } catch (error: any) {
      setMessage(error.message || 'Failed to save bank details');
    } finally {
      setBankSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Finance Ledger" 
        description="Monitor receivables, reconcile payments, and manage invoices."
        action={
          <div className="flex gap-2">
            <a
              href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api'}/finance/export?format=csv`}
              download="finance-export.csv"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
            >
              ↓ Export CSV
            </a>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Outstanding Balance" value={`PKR ${stats.outstanding.toLocaleString()}`} icon={<Banknote className="h-6 w-6 text-slate-400" />} />
        <StatCard title="Total Collected" value={`PKR ${stats.collected.toLocaleString()}`} icon={<HandCoins className="h-6 w-6 text-slate-400" />} />
        <StatCard title="Issued Invoices" value={stats.invoices.toString()} icon={<FileText className="h-6 w-6 text-slate-400" />} />
      </div>

      {/* ── Payment Approval Queue ─────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-100 bg-amber-50">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
              Payment Approval Queue
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">TOPUP and ticket payment receipts awaiting review.</p>
          </div>
          <span className="text-2xl font-bold text-slate-900">{pendingTxns.length}</span>
        </div>

        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User / Tx</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Receipt</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {pendingTxns.map((tx) => (
              <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-slate-900 truncate max-w-[160px]">{tx.userId}</div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">{tx.id}</div>
                  {tx.ticketId && (
                    <div className="text-xs text-primary-600 mt-0.5 truncate max-w-[160px]">Ticket: {tx.ticketId}</div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <StatusPill
                    label={tx.type === 'TICKET_PAYMENT' ? 'Ticket Payment' : 'Top-up'}
                    variant={tx.type === 'TICKET_PAYMENT' ? 'info' : 'neutral'}
                  />
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-slate-900">PKR {Number(tx.amount).toLocaleString()}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{tx.paymentMode.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{new Date(tx.createdAt).toLocaleDateString()}</div>
                </td>
                <td className="px-6 py-4">
                  {tx.receiptUrl ? (
                    <button
                      type="button"
                      onClick={() => viewReceipt(tx.receiptUrl!)}
                      className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 font-medium"
                    >
                      <FileText className="h-4 w-4" /> View
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  ) : (
                    <span className="text-sm text-slate-400 italic">None</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={txnActionLoading === tx.id}
                      onClick={() => approveTxn(tx.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </button>
                    <button
                      type="button"
                      disabled={txnActionLoading === tx.id}
                      onClick={() => rejectTxn(tx.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pendingTxns.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-3">
                    <CheckCircle2 className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900">All caught up</p>
                  <p className="text-sm text-slate-500 mt-1">No pending payments require review.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Admin Tools Row: Wallet Adjustment + Bank Details ─────────── */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* Wallet Adjustment */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-full bg-violet-50 flex items-center justify-center flex-shrink-0">
              <SlidersHorizontal className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Wallet Adjustment</h2>
              <p className="text-sm text-slate-500">Credit or debit a consumer wallet (admin only).</p>
            </div>
          </div>

          <form onSubmit={submitAdjustment} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">User ID</span>
              <input
                required
                className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
                placeholder="Paste user ID…"
                value={adjustUserId}
                onChange={(e) => setAdjustUserId(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Amount (negative to debit)</span>
              <input
                required
                type="number"
                className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
                placeholder="e.g. 5000 or -1000"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Reason / Note</span>
              <input
                required
                className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
                placeholder="e.g. Manual credit — bank receipt #123"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
              />
            </label>

            <button
              type="submit"
              disabled={adjustLoading}
              className="flex w-full justify-center items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 disabled:opacity-50 transition-colors"
            >
              {adjustLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Apply Adjustment
            </button>
          </form>
        </div>

        {/* Bank Details Editor */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-full bg-sky-50 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Bank Payment Details</h2>
              <p className="text-sm text-slate-500">
                {bankSettings
                  ? `Last updated ${new Date(bankSettings.updatedAt).toLocaleDateString()}`
                  : bankLoading
                  ? 'Loading…'
                  : 'No details saved yet'}
              </p>
            </div>
          </div>

          <form onSubmit={saveBankSettings} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Bank Name</span>
                <input
                  required
                  className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  placeholder="e.g. HBL"
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm((f) => ({ ...f, bankName: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Account Title</span>
                <input
                  required
                  className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  placeholder="e.g. Wusuq Pvt Ltd"
                  value={bankForm.accountTitle}
                  onChange={(e) => setBankForm((f) => ({ ...f, accountTitle: e.target.value }))}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Account Number</span>
                <input
                  required
                  className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  placeholder="0101-234567-001"
                  value={bankForm.accountNumber}
                  onChange={(e) =>
                    setBankForm((f) => ({ ...f, accountNumber: e.target.value }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">IBAN (optional)</span>
                <input
                  className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  placeholder="PK36SCBL0000001123456702"
                  value={bankForm.iban ?? ''}
                  onChange={(e) => setBankForm((f) => ({ ...f, iban: e.target.value }))}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Payment Instructions (optional)
              </span>
              <textarea
                rows={3}
                className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm resize-none"
                placeholder="Any additional instructions shown to the consumer…"
                value={bankForm.instructions ?? ''}
                onChange={(e) =>
                  setBankForm((f) => ({ ...f, instructions: e.target.value }))
                }
              />
            </label>

            <button
              type="submit"
              disabled={bankSaving || bankLoading}
              className="flex w-full justify-center items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50 transition-colors"
            >
              {bankSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save Bank Details
            </button>
          </form>
        </div>
      </div>

      <DataTableShell
        header={
          <FilterBar 
            searchPlaceholder="Search batch, client, or invoice..."
            onSearch={setSearch}
          />
        }
      >
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Order</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Financials</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Action Rail</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-slate-900">{item.batchNo}</div>
                  <div className="text-sm text-slate-500">{item.consumer.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{item.service.name}</div>
                </td>
                <td className="px-6 py-4">
                  {editingChargeId === item.id ? (
                    <div className="flex flex-col gap-1 mb-1">
                      <div className="grid grid-cols-2 gap-1">
                        <input type="number" className="rounded border-slate-300 py-0.5 px-1.5 text-xs text-slate-900" placeholder="Service cost" value={editServiceCost} onChange={e => setEditServiceCost(e.target.value)} autoFocus />
                        <input type="number" className="rounded border-slate-300 py-0.5 px-1.5 text-xs text-slate-900" placeholder="Delivery" value={editDelivery} onChange={e => setEditDelivery(e.target.value)} />
                        <input type="number" className="rounded border-slate-300 py-0.5 px-1.5 text-xs text-slate-900" placeholder="Printing" value={editPrinting} onChange={e => setEditPrinting(e.target.value)} />
                        <input type="number" className="rounded border-slate-300 py-0.5 px-1.5 text-xs text-slate-900" placeholder="Attested" value={editAttested} onChange={e => setEditAttested(e.target.value)} />
                        <input type="number" className="rounded border-slate-300 py-0.5 px-1.5 text-xs text-slate-900" placeholder="Non-att." value={editNonAttested} onChange={e => setEditNonAttested(e.target.value)} />
                        <input type="number" className="rounded border-slate-300 py-0.5 px-1.5 text-xs text-slate-900" placeholder="Add. Charges" value={editAdditionalCharges} onChange={e => setEditAdditionalCharges(e.target.value)} />
                        <input type="number" className="rounded border-slate-300 py-0.5 px-1.5 text-xs text-slate-900" placeholder="Add. Service" value={editAdditional} onChange={e => setEditAdditional(e.target.value)} />
                        <input type="number" className="rounded border-slate-300 py-0.5 px-1.5 text-xs text-slate-900" placeholder="Discount" value={editDiscount} onChange={e => setEditDiscount(e.target.value)} />
                      </div>
                      <div className="flex gap-1 mt-0.5">
                        <button onClick={() => updateCharge(item.id)} className="text-emerald-600 hover:text-emerald-700 p-0.5"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={resetChargeEdit} className="text-slate-400 hover:text-slate-600 p-0.5"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-900 flex items-center gap-1.5 group/charge">
                      Total: <span className="font-medium">{item.totalAmount}</span>
                      <button onClick={() => { setEditingChargeId(item.id); setEditServiceCost(String(item.charges?.serviceCost ?? '')); setEditDelivery(String(item.charges?.deliveryCharges ?? '')); setEditPrinting(String(item.charges?.printingCharges ?? '')); setEditAttested(String(item.charges?.attestedCharges ?? '')); setEditNonAttested(String(item.charges?.nonAttestedCharges ?? '')); setEditAdditionalCharges(String(item.charges?.additionalCharges ?? '')); setEditAdditional(String(item.charges?.additionalServiceCost ?? '')); setEditDiscount(String(item.charges?.discountPrice ?? '')); }} className="opacity-0 group-hover/charge:opacity-100 text-slate-400 hover:text-primary-600 transition-all p-0.5" title="Edit Charge">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <div className="text-sm text-emerald-600">Paid: {item.amountPaid}</div>
                  {item.remaining > 0 && <div className="text-sm text-rose-600 font-medium mt-1">Due: {item.remaining}</div>}
                  {item.clerkPayout > 0 && <div className="text-sm text-violet-600 mt-1">Clerk: {item.clerkPayout}</div>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusPill
                    label={item.status}
                    variant={
                      item.status === 'COMPLETED' || item.status === 'DELIVERED'
                        ? 'success'
                        : item.status === 'UNPAID'
                        ? 'warning'
                        : 'info'
                    }
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {item.invoice ? (
                    <div>
                      <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5"><FileText className="h-4 w-4 text-slate-400" /> {item.invoice.invoiceNo}</div>
                      <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider">{item.invoice.status}</div>
                    </div>
                  ) : <span className="text-sm text-slate-400">-</span>}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-2 items-end">
                    {/* Reconcile Row */}
                    {item.remaining > 0 && (
                      <div className="flex flex-col gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2">
                          <input
                            className="w-24 rounded-md border-0 py-1.5 pl-3 pr-2 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
                            placeholder="Amount"
                            type="number"
                            value={amounts[item.id] ?? ''}
                            onChange={(e) => setAmounts(s => ({ ...s, [item.id]: e.target.value }))}
                          />
                          <button
                            onClick={() => reconcile(item.id)}
                            disabled={!!reconciling[item.id]}
                            className="bg-primary-600 hover:bg-primary-500 text-white p-1.5 rounded-md shadow-sm transition-colors text-xs font-semibold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {reconciling[item.id]
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <CheckCircle className="h-3.5 w-3.5" />}
                            {reconciling[item.id] ? '…' : 'Reconcile'}
                          </button>
                        </div>
                        {/* Optional payment proof attachment */}
                        <label className={`flex items-center gap-1.5 cursor-pointer group/proof ${reconciling[item.id] ? 'pointer-events-none opacity-50' : ''}`}>
                          <span className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${reconcileFiles[item.id] ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-slate-400 border border-slate-300 group-hover/proof:border-primary-400 group-hover/proof:text-primary-500'}`}>
                            <Upload className="h-3 w-3" />
                          </span>
                          <span className="text-xs text-slate-500 truncate max-w-[130px]">
                            {reconcileFiles[item.id]?.name ?? 'Attach proof (optional)'}
                          </span>
                          {/* Fix 3: key remounts the input after success so the same filename triggers onChange */}
                          <input
                            key={fileInputKeys[item.id] ?? 0}
                            type="file"
                            accept="image/*,application/pdf"
                            className="sr-only"
                            disabled={!!reconciling[item.id]}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                // Fix 2: reject files larger than the API body-parser limit (10 MB)
                                if (f.size > 10 * 1024 * 1024) {
                                  setMessage('Proof must be under 10 MB');
                                  e.target.value = '';
                                  return;
                                }
                                setReconcileFiles(s => ({ ...s, [item.id]: f }));
                              } else {
                                setReconcileFiles(s => {
                                  const next = { ...s };
                                  delete next[item.id];
                                  return next;
                                });
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}
                    
                    {/* Invoice Actions Row */}
                    <div className="flex gap-2">
                       {!item.invoice ? (
                         <button onClick={() => generateInvoice(item.id)} className="text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md shadow-sm text-xs font-semibold flex items-center gap-1.5">
                           <FileText className="h-3.5 w-3.5 text-slate-400" /> Generate Invoice
                         </button>
                       ) : (
                         <>
                           <button onClick={() => downloadInvoice(item.id)} className="text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 p-1.5 rounded-md shadow-sm" title="Download Invoice">
                             <Download className="h-4 w-4" />
                           </button>
                           <button onClick={() => sendInvoice(item.id)} className="text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 p-1.5 rounded-md shadow-sm" title="Send Invoice Email">
                             <Send className="h-4 w-4" />
                           </button>
                         </>
                       )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                  No records found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>

      {message && (
        <div className={`mt-4 rounded-lg p-4 text-sm font-medium ${message.toLowerCase().includes('failed') || message.toLowerCase().includes('valid amount') || message.toLowerCase().includes('expired') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
          {message.includes('sign in') && (
            <Link className="ml-2 font-semibold underline" href="/login">
              Go to login
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
