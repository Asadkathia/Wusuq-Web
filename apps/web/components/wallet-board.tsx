'use client';

import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

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

async function apiRequest(path: string, method = 'GET', body?: unknown) {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('wusuq_access_token') : null;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

export function WalletBoard() {
  const [users, setUsers] = useState<WalletUser[]>([]);
  const [pending, setPending] = useState<PendingTopup[]>([]);
  const [message, setMessage] = useState('');

  const [topup, setTopup] = useState({
    userId: '',
    amount: '',
    paymentMode: 'BANK_TRANSFER',
    currency: 'PKR',
    receiptUrl: '',
  });

  const load = useCallback(async () => {
    try {
      const result = await apiRequest('/wallet?limit=200');
      setUsers(result.items ?? []);
      setPending(result.pendingTopups ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load wallet data');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const submitTopup = async () => {
    const amount = Number(topup.amount);
    if (!topup.userId || amount <= 0) {
      setMessage('Select user and valid amount');
      return;
    }

    try {
      await apiRequest('/wallet/topup', 'POST', {
        userId: topup.userId,
        amount,
        paymentMode: topup.paymentMode,
        currency: topup.currency,
        receiptUrl: topup.receiptUrl || undefined,
      });
      setMessage('Topup created (pending verification)');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Topup failed');
    }
  };

  const verify = async (id: string) => {
    try {
      await apiRequest(`/wallet/transactions/${id}/verify`, 'POST', {});
      setMessage('Topup verified');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Verify failed');
    }
  };

  const reject = async (id: string) => {
    try {
      await apiRequest(`/wallet/transactions/${id}/reject`, 'POST', {});
      setMessage('Topup rejected');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reject failed');
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-semibold">Wallet</h2>

      <div className="mt-4 grid gap-3 rounded border border-slate-300 p-4 md:grid-cols-5">
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="User ID"
          value={topup.userId}
          onChange={(event) => setTopup((c) => ({ ...c, userId: event.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Amount"
          value={topup.amount}
          onChange={(event) => setTopup((c) => ({ ...c, amount: event.target.value }))}
        />
        <select
          className="rounded border border-slate-300 p-2"
          value={topup.paymentMode}
          onChange={(event) =>
            setTopup((c) => ({ ...c, paymentMode: event.target.value }))
          }
        >
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="JAZZ_CASH">Jazz Cash</option>
          <option value="EASY_PAISA">Easy Paisa</option>
        </select>
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Currency"
          value={topup.currency}
          onChange={(event) => setTopup((c) => ({ ...c, currency: event.target.value }))}
        />
        <button
          type="button"
          className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
          onClick={() => void submitTopup()}
        >
          Create Topup
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border border-slate-200 text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2">Sr #</th>
              <th className="p-2">Consumer Name</th>
              <th className="p-2">User ID</th>
              <th className="p-2">Account Balance</th>
              <th className="p-2">Total Transactions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId} className="border-t border-slate-200">
                <td className="p-2">{user.sr}</td>
                <td className="p-2">{user.consumerName}</td>
                <td className="p-2">{user.userId}</td>
                <td className="p-2">{user.accountBalance}</td>
                <td className="p-2">{user.totalTransactions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-lg font-semibold">Pending Topups</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full border border-slate-200 text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2">Transaction</th>
              <th className="p-2">User</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Mode</th>
              <th className="p-2">Receipt</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((tx) => (
              <tr key={tx.id} className="border-t border-slate-200">
                <td className="p-2">{tx.id}</td>
                <td className="p-2">{tx.userId}</td>
                <td className="p-2">
                  {tx.amount} {tx.currency}
                </td>
                <td className="p-2">{tx.paymentMode}</td>
                <td className="p-2">{tx.receiptUrl ?? '-'}</td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void verify(tx.id)}
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void reject(tx.id)}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
