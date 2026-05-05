/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { advanceOnEnter } from '@/lib/form-utils';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { StatusPill } from '@/components/ui/status-pill';
import { CheckCircle2, XCircle, Plus, Wallet, RefreshCw, FileText, ExternalLink, History, X, Upload } from 'lucide-react';
const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'] as const;

type WalletUser = {
  sr: number;
  userId: string;
  consumerName: string;
  accountBalance: number;
  totalTransactions: number;
  createdAt: string;
};

type PendingTopup = {
  id: string;
  userId: string;
  amount: number;
  paymentMode: string;
  currency: string;
  status: string;
  createdAt: string;
  receiptUrl?: string | null;
};

type ConsumerTransaction = {
  id: string;
  amount: number;
  paymentMode: string;
  status: string;
  referenceNo?: string | null;
  createdAt: string;
  verifiedAt?: string | null;
};

export function WalletBoard() {
  const [users, setUsers] = useState<WalletUser[]>([]);
  const [pending, setPending] = useState<PendingTopup[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isConsumer, setIsConsumer] = useState<boolean | null>(null);
  const [myWallet, setMyWallet] = useState<{ balance: number; transactions: ConsumerTransaction[] } | null>(null);

  const [txUserId, setTxUserId] = useState<string | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const [topup, setTopup] = useState({
    userId: '',
    amount: '',
    paymentMode: 'JAZZ_CASH',
    currency: 'PKR',
    receiptUrl: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isConsumer) {
        const result = await apiClient.get<{ balance: number; transactions: ConsumerTransaction[] }>('/wallet/me');
        setMyWallet(result);
      } else {
        const result = await apiClient.get<any>('/wallet?limit=200');
        setUsers(result.items ?? []);
        setPending(result.pendingTopups ?? []);
      }
    } catch (error: any) {
      setMessage(error.message || 'Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  }, [isConsumer]);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
      const role = user?.role ?? '';
      setIsConsumer(CONSUMER_ROLES.includes(role as (typeof CONSUMER_ROLES)[number]));
    } catch {
      setIsConsumer(false);
    }
  }, []);

  useEffect(() => {
    if (isConsumer === null) return;
    load();
  }, [load, isConsumer]);

  const getConsumerTxVariant = (status: string) => {
    if (status === 'VERIFIED') return 'success' as const;
    if (status === 'PENDING_VERIFICATION') return 'warning' as const;
    if (status === 'REJECTED') return 'error' as const;
    return 'neutral' as const;
  };

  const submitTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(topup.amount);
    if (!topup.userId || amount <= 0) {
      setMessage('Select user and valid amount');
      return;
    }

    try {
      await apiClient.post('/wallet/topup', {
        userId: topup.userId,
        amount,
        paymentMode: topup.paymentMode,
        currency: topup.currency,
        receiptUrl: topup.receiptUrl || undefined,
      });
      setMessage('Topup created (pending verification)');
      setTopup({ ...topup, amount: '', receiptUrl: '' });
      load();
    } catch (error: any) {
      setMessage(error.message || 'Topup failed');
    }
  };

  const verify = async (id: string) => {
    try {
      await apiClient.post(`/wallet/transactions/${id}/verify`);
      setMessage('Topup verified successfully');
      load();
    } catch (error: any) {
      setMessage(error.message || 'Verify failed');
    }
  };

  const reject = async (id: string) => {
    try {
      await apiClient.post(`/wallet/transactions/${id}/reject`);
      setMessage('Topup rejected');
      load();
    } catch (error: any) {
      setMessage(error.message || 'Reject failed');
    }
  };

  const viewTransactions = async (userId: string) => {
    setTxUserId(userId);
    setTxHistory([]);
    setTxLoading(true);
    try {
      const result = await apiClient.get<any[]>(`/wallet/${userId}/transactions`);
      setTxHistory(result);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load transaction history');
      setTxUserId(null);
    } finally {
      setTxLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingReceipt(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const data = await apiClient.post<{ url: string }>('/wallet/receipt', formData);
      setTopup(c => ({ ...c, receiptUrl: data.url }));
      setMessage('Receipt uploaded');
    } catch (err: any) {
      setMessage(err.message || 'Failed to upload receipt');
    } finally {
      setUploadingReceipt(false);
    }
  };

  if (isConsumer === null) {
    return (
      <div className="py-20 text-center text-slate-500 animate-pulse">Loading wallet...</div>
    );
  }

  if (isConsumer) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="My Wallet"
          description="View your balance and latest top-up transactions."
          action={
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          }
        />

        {message && (
          <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('failed') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
            {message}
          </div>
        )}

        <PanelCard>
          <h3 className="text-sm font-semibold text-slate-700">My Wallet Balance</h3>
          <p className="mt-2 text-3xl font-bold text-slate-900">PKR {Number(myWallet?.balance || 0).toLocaleString()}</p>
        </PanelCard>

        <PanelCard>
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Transaction History</h3>
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Mode</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reference No</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(myWallet?.transactions ?? []).map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-4 py-3 text-sm text-slate-900">{Number(transaction.amount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{transaction.paymentMode.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-3">
                    <StatusPill label={transaction.status} variant={getConsumerTxVariant(transaction.status)} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{transaction.referenceNo || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{new Date(transaction.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {(myWallet?.transactions?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No transactions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </PanelCard>

        <PanelCard className="bg-slate-50 border-slate-200">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Top Up Request</h4>
          <p className="text-sm text-slate-600">
            To top up your wallet, make a bank transfer to [instructions] and contact your representative.
          </p>
        </PanelCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Wallet & Topups" 
        description="Verify pending topups and manage consumer balances."
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const blob = await apiClient.getBlob('/wallet/export?format=csv');
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'wallet-export.csv';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch (err: any) {
                  setMessage(err?.message || 'Export failed');
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
            >
              ↓ Export CSV
            </button>
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

      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('failed') || message.toLowerCase().includes('select valid') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Pane: Pending Reviews */}
        <div className="lg:col-span-2 space-y-6">
          <PanelCard className="border-warning-200 shadow-sm">
            <div className="p-6 border-b border-border-soft flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-warning-500"></span>
                  </span>
                  Pending Verifications
                </h3>
                <p className="text-sm text-slate-500 mt-1">Transactions waiting for confirmation.</p>
              </div>
              <div className="text-2xl font-bold text-slate-900">{pending.length}</div>
            </div>
            
            <div className="p-0">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User & Tx</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Receipt</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {pending.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50 group transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-slate-900">{tx.userId}</div>
                        <div className="text-xs text-slate-500 mt-0.5 max-w-[150px] truncate">{tx.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-900">{tx.amount.toLocaleString()} {tx.currency}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{tx.paymentMode.replace('_', ' ')}</div>
                      </td>
                      <td className="px-6 py-4">
                        {tx.receiptUrl ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                // Translate legacy /uploads/wallet-receipts/<f>
                                // and the canonical /wallet/receipt/<f> to the
                                // authenticated download endpoint.
                                const m = String(tx.receiptUrl).match(
                                  /(?:^|\/)(?:uploads\/wallet-receipts|wallet\/receipt)\/([^/?#]+)$/,
                                );
                                if (!m) {
                                  setMessage('Invalid receipt URL');
                                  return;
                                }
                                const blob = await apiClient.getBlob(`/wallet/receipt/${m[1]}`);
                                const objectUrl = URL.createObjectURL(blob);
                                window.open(objectUrl, '_blank', 'noopener');
                                // Revoke shortly after open so the new tab can render it.
                                setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
                              } catch (err: any) {
                                setMessage(err?.message || 'Receipt download failed');
                              }
                            }}
                            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 font-medium"
                          >
                            <FileText className="h-4 w-4" /> View
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-sm text-slate-400 italic">None attached</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => verify(tx.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                            <CheckCircle2 className="h-4 w-4" /> Verify
                          </button>
                          <button onClick={() => reject(tx.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors">
                            <XCircle className="h-4 w-4" /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pending.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center">
                         <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-3">
                           <CheckCircle2 className="h-6 w-6 text-slate-400" />
                         </div>
                         <h3 className="text-sm font-semibold text-slate-900">All caught up</h3>
                         <p className="text-sm text-slate-500 mt-1">No pending topups require your attention.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>

          {/* Users/Ledger Table */}
          <div className="pt-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 px-1">Consumer Wallets</h3>
            <DataTableShell>
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Consumer</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Balance</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Tx Count</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.userId} onClick={() => viewTransactions(user.userId)} className="hover:bg-slate-50 transition-colors cursor-pointer group">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900 text-sm group-hover:text-primary-600 transition-colors flex items-center gap-2">
                          {user.consumerName} <History className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-slate-400" />
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{user.userId}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-bold text-slate-900 text-sm">{user.accountBalance.toLocaleString()}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-sm text-slate-600 font-medium">{user.totalTransactions}</div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-sm text-slate-500">No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>

        {/* Side Pane: Create Topup */}
        <div className="space-y-6">
          <PanelCard className="p-6">
            <div className="flex flex-col items-center mb-6 pb-6 border-b border-slate-100">
              <div className="h-12 w-12 bg-primary-50 rounded-full flex items-center justify-center mb-3">
                <Wallet className="h-6 w-6 text-primary-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Initiate Topup</h3>
              <p className="text-sm text-slate-500 text-center mt-1">Manually credit a user's wallet.</p>
            </div>

            <form onSubmit={submitTopup} onKeyDown={advanceOnEnter} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">User ID</span>
                <input
                  required
                  className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm sm:leading-6"
                  placeholder="Enter User ID"
                  value={topup.userId}
                  onChange={(e) => setTopup((c) => ({ ...c, userId: e.target.value }))}
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Amount</span>
                  <input
                    required
                    type="number"
                    min="1"
                    className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm sm:leading-6"
                    placeholder="0.00"
                    value={topup.amount}
                    onChange={(e) => setTopup((c) => ({ ...c, amount: e.target.value }))}
                  />
                </label>
                <label className="block">
                <span className="text-sm font-medium text-slate-700">Currency</span>
                <select
                  className="mt-1 block w-full rounded-xl border-0 py-2.5 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm sm:leading-6"
                  value={topup.currency}
                  onChange={(e) => setTopup((c) => ({ ...c, currency: e.target.value }))}
                >
                  <option value="PKR">PKR</option>
                  <option value="USD">USD</option>
                </select>
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Payment Mode</span>
                <select
                  className="mt-1 block w-full rounded-xl border-0 py-2.5 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm sm:leading-6"
                  value={topup.paymentMode}
                  onChange={(e) => setTopup((c) => ({ ...c, paymentMode: e.target.value }))}
                >
                  <option value="JAZZ_CASH">JazzCash</option>
                  <option value="EASY_PAISA">EasyPaisa</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Receipt Attachment (Optional)</span>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="file"
                    id="receipt-upload"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                  />
                  <label htmlFor="receipt-upload" className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition-colors">
                    <Upload className="h-4 w-4 text-slate-400" /> {uploadingReceipt ? 'Uploading...' : 'Choose File'}
                  </label>
                  {topup.receiptUrl && <span className="text-xs text-emerald-600 font-medium truncate max-w-[120px]">File attached <CheckCircle2 className="h-3 w-3 inline" /></span>}
                </div>
              </label>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full justify-center items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Create Request
                </button>
              </div>
            </form>
          </PanelCard>

          <PanelCard className="p-6 bg-slate-50 border-slate-200">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Payment Instructions</h4>
            <p className="text-xs text-slate-600 mb-3">Please transfer funds to the official Wusuq corporate accounts before initiating a topup request.</p>
            <ul className="text-xs text-slate-700 space-y-2 font-medium">
              <li className="flex flex-col"><span className="text-slate-500">Bank Transfer (Meezan Bank)</span> <span>AC: 0101-234567-001</span></li>
              <li className="flex flex-col"><span className="text-slate-500">JazzCash / EasyPaisa B2B</span> <span>0300-1234567</span></li>
            </ul>
          </PanelCard>
        </div>
      </div>

      {txUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setTxUserId(null)}></div>
          <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 flex-shrink-0">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2"><History className="h-5 w-5 text-slate-400" /> Transaction History</h3>
              <button onClick={() => setTxUserId(null)} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            
            <div className="overflow-y-auto p-0">
              {txLoading ? (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary-600" /> Loading transactions...
                </div>
              ) : txHistory.length === 0 ? (
                <div className="p-12 text-center text-slate-500 truncate">No transactions found for user {txUserId}.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {txHistory.map(t => (
                    <div key={t.id} className="p-4 px-6 hover:bg-slate-50 flex justify-between items-center">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 capitalize">{t.type.replace('_', ' ')}</div>
                        <div className="text-xs text-slate-500 mt-1">{new Date(t.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${t.type === 'TOPUP' ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {t.type === 'TOPUP' ? '+' : '-'}{t.amount.toLocaleString()} {t.currency}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{t.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setTxUserId(null)} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm border border-slate-200 hover:bg-slate-100">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
