/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Check, ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { StatusPill } from '@/components/ui/status-pill';

type TicketRow = {
  id: string;
  batchNo: string;
  consumer: { id: string; name: string } | null;
  service: { id: string; name: string; category: string } | null;
  serviceCity: string | null;
  caseType: string | null;
  charges: {
    serviceCost: number;
    deliveryCharges: number;
    printingCharges: number;
    attestedCharges: number;
    nonAttestedCharges: number;
    additionalCharges: number;
    additionalServiceCost: number;
    discountPrice: number;
    taxRate: number;
    taxAmount: number;
    promoDiscount: number;
  };
  totalAmount: number;
  amountPaid: number;
  remaining: number;
  status: string;
  clerkPayout: number;
  invoice: { invoiceNo: string; status: string } | null;
};

type Filters = {
  search: string;
  ticketStatus: string;
  dateFrom: string;
  dateTo: string;
};

type ChargeEdit = {
  serviceCost: string;
  deliveryCharges: string;
  printingCharges: string;
  attestedCharges: string;
  nonAttestedCharges: string;
  additionalCharges: string;
  additionalServiceCost: string;
  discountPrice: string;
};

const TICKET_STATUSES = ['UNPAID', 'PAID', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED', 'DELIVERED'];

function statusVariant(s: string): 'success' | 'warning' | 'neutral' | 'info' {
  if (s === 'COMPLETED' || s === 'DELIVERED') return 'success';
  if (s === 'UNPAID') return 'warning';
  if (s === 'PAID' || s === 'ASSIGNED' || s === 'IN_PROGRESS') return 'info';
  return 'neutral';
}

export function TicketChargesBoard() {
  const [items, setItems] = useState<TicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const [filters, setFilters] = useState<Filters>({
    search: '', ticketStatus: '', dateFrom: '', dateTo: '',
  });
  const [pendingFilters, setPendingFilters] = useState<Filters>(filters);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [chargeEdit, setChargeEdit] = useState<ChargeEdit | null>(null);
  const [saving, setSaving] = useState(false);

  const buildQuery = useCallback((f: Filters, p: number) => {
    const params = new URLSearchParams();
    params.set('page', String(p));
    params.set('limit', String(limit));
    if (f.search) params.set('search', f.search);
    if (f.ticketStatus) params.set('ticketStatus', f.ticketStatus);
    if (f.dateFrom) params.set('dateFrom', f.dateFrom);
    if (f.dateTo) params.set('dateTo', f.dateTo);
    return params.toString();
  }, []);

  const load = useCallback(async (f = filters, p = page) => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>(`/finance?${buildQuery(f, p)}`);
      setItems(result.items ?? []);
      setTotal(result.total ?? 0);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filters, page, buildQuery]);

  useEffect(() => { load(); }, [load]);

  const applyFilters = () => {
    setFilters(pendingFilters);
    setPage(1);
  };

  const resetFilters = () => {
    const empty: Filters = { search: '', ticketStatus: '', dateFrom: '', dateTo: '' };
    setPendingFilters(empty);
    setFilters(empty);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const openEdit = (item: TicketRow) => {
    setEditId(item.id);
    setExpandedId(item.id);
    setChargeEdit({
      serviceCost: String(item.charges.serviceCost),
      deliveryCharges: String(item.charges.deliveryCharges),
      printingCharges: String(item.charges.printingCharges),
      attestedCharges: String(item.charges.attestedCharges),
      nonAttestedCharges: String(item.charges.nonAttestedCharges),
      additionalCharges: String(item.charges.additionalCharges),
      additionalServiceCost: String(item.charges.additionalServiceCost),
      discountPrice: String(item.charges.discountPrice),
    });
  };

  const cancelEdit = () => { setEditId(null); setChargeEdit(null); };

  const saveCharges = async (ticketId: string) => {
    if (!chargeEdit) return;
    setSaving(true);
    try {
      await apiClient.patch(`/finance/${ticketId}/charge`, {
        serviceCost: Number(chargeEdit.serviceCost),
        deliveryCharges: Number(chargeEdit.deliveryCharges),
        printingCharges: Number(chargeEdit.printingCharges),
        attestedCharges: Number(chargeEdit.attestedCharges),
        nonAttestedCharges: Number(chargeEdit.nonAttestedCharges),
        additionalCharges: Number(chargeEdit.additionalCharges),
        additionalServiceCost: Number(chargeEdit.additionalServiceCost),
        discountPrice: Number(chargeEdit.discountPrice),
      });
      setMessage('Charges updated.');
      cancelEdit();
      load();
    } catch (err: any) {
      setMessage(err.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const chargeFields: { key: keyof ChargeEdit; label: string; hint?: string }[] = [
    { key: 'serviceCost', label: 'Service Cost' },
    { key: 'deliveryCharges', label: 'Delivery' },
    { key: 'printingCharges', label: 'Printing' },
    { key: 'attestedCharges', label: 'Attested' },
    { key: 'nonAttestedCharges', label: 'Non-Attested' },
    { key: 'additionalCharges', label: 'Additional Cost', hint: 'Separate line; not taxed.' },
    { key: 'additionalServiceCost', label: 'Additional Service Cost', hint: 'Added to the taxable service base.' },
    { key: 'discountPrice', label: 'Discount' },
  ];

  const activeFilterCount = useMemo(() =>
    [filters.ticketStatus, filters.dateFrom, filters.dateTo, filters.search].filter(Boolean).length,
    [filters]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Ticket Charges"
        description="View and edit the charge breakdown for any individual ticket."
        action={
          <button onClick={() => load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('fail') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            placeholder="Search batch no. or consumer…"
            className="rounded border border-slate-200 py-1.5 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
            value={pendingFilters.search}
            onChange={e => setPendingFilters(f => ({ ...f, search: e.target.value }))}
          />
          <select
            className="rounded border border-slate-200 py-1.5 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
            value={pendingFilters.ticketStatus}
            onChange={e => setPendingFilters(f => ({ ...f, ticketStatus: e.target.value }))}
          >
            <option value="">All Ticket Status</option>
            {TICKET_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <input
            type="date"
            className="rounded border border-slate-200 py-1.5 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
            value={pendingFilters.dateFrom}
            onChange={e => setPendingFilters(f => ({ ...f, dateFrom: e.target.value }))}
          />
          <input
            type="date"
            className="rounded border border-slate-200 py-1.5 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
            value={pendingFilters.dateTo}
            onChange={e => setPendingFilters(f => ({ ...f, dateTo: e.target.value }))}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{total} ticket{total !== 1 ? 's' : ''} found{activeFilterCount > 0 ? ` (${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''} active)` : ''}</span>
          <div className="flex gap-2">
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors">
                Clear filters
              </button>
            )}
            <button
              onClick={applyFilters}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTableShell>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-8 px-4 py-3" />
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Ticket</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Consumer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Service</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Total</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Paid</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Remaining</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {items.map(item => {
              const isExpanded = expandedId === item.id;
              const isEditing = editId === item.id;

              return [
                /* Main row */
                <tr
                  key={item.id}
                  className="hover:bg-slate-50 transition-colors group cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <td className="px-4 py-3 text-slate-400">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-bold text-primary-700">{item.batchNo}</div>
                    {item.serviceCity && <div className="text-xs text-slate-400">{item.serviceCity}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-800">{item.consumer?.name ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-700">{item.service?.name ?? '—'}</div>
                    <div className="text-xs text-slate-400">{item.service?.category ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">
                    PKR {(item.totalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-emerald-700 font-semibold">
                    {(item.amountPaid ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-rose-700 font-semibold">
                    {(item.remaining ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusPill label={(item.status ?? '—').replace(/_/g, ' ')} variant={statusVariant(item.status ?? '')} />
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => isEditing ? cancelEdit() : openEdit(item)}
                      className="sm:opacity-0 sm:group-hover:opacity-100 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-primary-300 hover:text-primary-700 transition-all"
                    >
                      {isEditing ? <><X className="h-3.5 w-3.5" /> Cancel</> : 'Edit Charges'}
                    </button>
                  </td>
                </tr>,

                /* Expanded charge panel */
                isExpanded ? (
                  <tr key={`${item.id}-detail`} className="bg-slate-50">
                    <td colSpan={9} className="px-6 py-5">
                      {isEditing && chargeEdit ? (
                        /* Edit mode */
                        <div className="space-y-4">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Edit Charges — {item.batchNo}</p>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {chargeFields.map(({ key, label, hint }) => (
                              <label key={key} className="block">
                                <span className="text-xs font-semibold text-slate-500">{label}</span>
                                {hint && <span className="block text-xs text-slate-500">{hint}</span>}
                                <input
                                  type="number" min="0" step="0.01"
                                  className="mt-1 block w-full rounded border border-slate-200 py-1.5 px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-600"
                                  value={chargeEdit[key]}
                                  onChange={e => setChargeEdit(c => c && ({ ...c, [key]: e.target.value }))}
                                />
                              </label>
                            ))}
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button onClick={cancelEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                              <X className="h-4 w-4" /> Cancel
                            </button>
                            <button onClick={() => saveCharges(item.id)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                              <Check className="h-4 w-4" /> Save Charges
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Charge Breakdown — {item.batchNo}</p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {([
                              ['Service Cost', item.charges.serviceCost],
                              ['Delivery', item.charges.deliveryCharges],
                              ['Printing', item.charges.printingCharges],
                              ['Attested', item.charges.attestedCharges],
                              ['Non-Attested', item.charges.nonAttestedCharges],
                              ['Additional Cost', item.charges.additionalCharges],
                              ['Additional Service Cost', item.charges.additionalServiceCost],
                            ] as [string, number][])
                              .filter(([, v]) => v > 0)
                              .map(([label, value]) => (
                                <div key={label} className="flex items-center justify-between rounded-lg bg-white border border-slate-100 px-3 py-2">
                                  <span className="text-xs text-slate-500">{label}</span>
                                  <span className="text-sm font-semibold text-slate-800">PKR {value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                              ))}
                            {item.charges.discountPrice > 0 && (
                              <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                                <span className="text-xs text-emerald-600">Discount</span>
                                <span className="text-sm font-semibold text-emerald-700">− PKR {item.charges.discountPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            {item.charges.promoDiscount > 0 && (
                              <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                                <span className="text-xs text-emerald-600">Promo</span>
                                <span className="text-sm font-semibold text-emerald-700">− PKR {item.charges.promoDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            {item.charges.taxAmount > 0 && (
                              <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                                <span className="text-xs text-amber-700">Tax ({Math.round((item.charges.taxRate ?? 0) * 100)}%)</span>
                                <span className="text-sm font-semibold text-amber-800">PKR {item.charges.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-6 pt-1 border-t border-slate-100">
                            <div className="text-xs text-slate-500">Total: <span className="font-bold text-slate-900 text-sm">PKR {(item.totalAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                            <div className="text-xs text-slate-500">Paid: <span className="font-bold text-emerald-700 text-sm">{(item.amountPaid ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                            <div className="text-xs text-slate-500">Remaining: <span className="font-bold text-rose-700 text-sm">{(item.remaining ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                            <div className="text-xs text-slate-500">Clerk Payout: <span className="font-bold text-violet-700 text-sm">{(item.clerkPayout ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                            <button
                              onClick={() => openEdit(item)}
                              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
                            >
                              Edit Charges
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : null,
              ];
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">
                  {loading ? 'Loading…' : 'No tickets found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-slate-500">Page {page} of {totalPages} ({total} total)</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
