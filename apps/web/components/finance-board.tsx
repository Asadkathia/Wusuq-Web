'use client';

import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

type FinanceItem = {
  id: string;
  batchNo: string;
  consumer: { id: string; name: string };
  service: { id: string; name: string; category: string };
  totalAmount: number;
  amountPaid: number;
  remaining: number;
  paymentStatus: string;
  invoice?: { invoiceNo: string; status: string } | null;
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

export function FinanceBoard() {
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest('/finance?limit=200');
      setItems(result.items ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load finance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reconcile = async (ticketId: string) => {
    const amount = Number(amounts[ticketId] ?? 0);
    if (amount <= 0) {
      setMessage('Enter valid amount');
      return;
    }

    try {
      await apiRequest(`/finance/${ticketId}/reconcile`, 'POST', {
        amount,
        paymentMode: 'BANK_TRANSFER',
        currency: 'PKR',
      });
      setMessage('Payment reconciled');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reconcile failed');
    }
  };

  const generateInvoice = async (ticketId: string) => {
    try {
      await apiRequest(`/finance/${ticketId}/invoice/generate`, 'POST');
      setMessage('Invoice generated');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Generate failed');
    }
  };

  const sendInvoice = async (ticketId: string) => {
    try {
      await apiRequest(`/finance/${ticketId}/invoice/send`, 'POST');
      setMessage('Invoice sent');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Send failed');
    }
  };

  const downloadInvoice = async (ticketId: string) => {
    try {
      const result = await apiRequest(`/finance/${ticketId}/invoice/download`);
      const blob = new Blob([result.content], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Invoice downloaded');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Download failed');
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-semibold">Finance</h2>
      <button
        type="button"
        className="mt-4 rounded border border-slate-300 px-3 py-2 text-sm"
        onClick={() => void load()}
        disabled={loading}
      >
        Refresh
      </button>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border border-slate-200 text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2">Batch No</th>
              <th className="p-2">Consumer</th>
              <th className="p-2">Service</th>
              <th className="p-2">Total</th>
              <th className="p-2">Paid</th>
              <th className="p-2">Remaining</th>
              <th className="p-2">Payment Status</th>
              <th className="p-2">Invoice</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="p-2">{item.batchNo}</td>
                <td className="p-2">{item.consumer.name}</td>
                <td className="p-2">{item.service.name}</td>
                <td className="p-2">{item.totalAmount}</td>
                <td className="p-2">{item.amountPaid}</td>
                <td className="p-2">{item.remaining}</td>
                <td className="p-2">{item.paymentStatus}</td>
                <td className="p-2">
                  {item.invoice ? `${item.invoice.invoiceNo} (${item.invoice.status})` : '-'}
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    <input
                      className="w-24 rounded border border-slate-300 px-2 py-1"
                      placeholder="amount"
                      value={amounts[item.id] ?? ''}
                      onChange={(event) =>
                        setAmounts((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void reconcile(item.id)}
                    >
                      Reconcile
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void generateInvoice(item.id)}
                    >
                      Generate
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void sendInvoice(item.id)}
                    >
                      Send
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void downloadInvoice(item.id)}
                    >
                      Download
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
