/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
 
 
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import { SectionHeader } from '@/components/ui/section-header';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatCard } from '@/components/ui/stat-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Banknote, FileText, Send, Download, CheckCircle, RefreshCw, HandCoins, Pencil, X, Check } from 'lucide-react';

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
  paymentStatus: string;
  invoice?: { invoiceNo: string; status: string } | null;
};

export function FinanceBoard() {
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [editServiceCost, setEditServiceCost] = useState('');
  const [editDelivery, setEditDelivery] = useState('');
  const [editPrinting, setEditPrinting] = useState('');
  const [editAttested, setEditAttested] = useState('');
  const [editNonAttested, setEditNonAttested] = useState('');
  const [editAdditionalCharges, setEditAdditionalCharges] = useState('');
  const [editAdditional, setEditAdditional] = useState('');
  const [editDiscount, setEditDiscount] = useState('');

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

  useEffect(() => {
    load();
  }, [load]);

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
    const amount = Number(amounts[ticketId] ?? 0);
    if (amount <= 0) return setMessage('Enter valid amount');

    try {
      await apiClient.post(`/finance/${ticketId}/reconcile`, {
        amount,
        paymentMode: 'BANK_TRANSFER',
        currency: 'PKR',
      });
      setMessage('Payment reconciled');
      setAmounts(s => ({ ...s, [ticketId]: '' }));
      load();
    } catch (error: any) {
      setMessage('Reconcile failed');
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
                    label={item.paymentStatus} 
                    variant={item.paymentStatus === 'PAID' ? 'success' : item.paymentStatus === 'PARTIAL' ? 'warning' : 'neutral'} 
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
                      <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                        <input
                          className="w-24 rounded-md border-0 py-1.5 pl-3 pr-2 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
                          placeholder="Amount"
                          type="number"
                          value={amounts[item.id] ?? ''}
                          onChange={(e) => setAmounts(s => ({ ...s, [item.id]: e.target.value }))}
                        />
                        <button onClick={() => reconcile(item.id)} className="bg-primary-600 hover:bg-primary-500 text-white p-1.5 rounded-md shadow-sm transition-colors text-xs font-semibold flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5" /> Reconcile
                        </button>
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
