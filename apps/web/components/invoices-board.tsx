/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, RefreshCw } from 'lucide-react';
import { formatMoney, toCurrency } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import { downloadInvoice } from '@/lib/download-invoice';
import { SectionHeader } from '@/components/ui/section-header';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';

type InvoiceRow = {
  id: string;
  invoiceNo: string;
  issueDate: string;
  currency: 'PKR' | 'USD';
  grandTotal: number | string;
  status: string;
  consumer: { id: string; name: string; email: string };
  _count: { items: number };
};

// Mirrors the PDF's own date stamp (apps/api/src/invoices/invoice.pdf.ts
// `fmtDate` — UTC DD-MM-YYYY) so the list and the downloaded document agree.
function formatIssueDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

function statusVariant(status: string): 'success' | 'warning' | 'info' {
  if (status === 'PAID') return 'success';
  if (status === 'PARTIALLY_PAID') return 'warning';
  return 'info'; // GENERATED
}

export function InvoicesBoard() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // GET /invoices returns a bare array (staff see all, a consumer sees
      // only their own — but this board only renders in the staff portal).
      const result = await apiClient.get<InvoiceRow[]>('/invoices');
      setInvoices(Array.isArray(result) ? result : []);
    } catch (err: any) {
      toast.error('Unable to load invoices', err?.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return invoices;
    return invoices.filter(
      (inv) =>
        inv.invoiceNo.toLowerCase().includes(s) ||
        inv.consumer.name.toLowerCase().includes(s) ||
        inv.consumer.email.toLowerCase().includes(s),
    );
  }, [invoices, search]);

  const handleDownload = async (invoice: InvoiceRow) => {
    if (downloadingId) return;
    setDownloadingId(invoice.id);
    try {
      await downloadInvoice(invoice.id, invoice.invoiceNo);
    } catch (err: any) {
      // Surface the server's message verbatim — these are human-written
      // ("Ticket 035210 is already on another invoice.").
      toast.error('Download failed', err?.message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Invoices"
        description="Multi-ticket invoices issued to consumers."
        action={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <DataTableShell
        header={
          <FilterBar
            searchPlaceholder="Search invoice #, consumer name, or email..."
            onSearch={setSearch}
          />
        }
      >
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice #</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Consumer</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Items</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Total</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="relative px-6 py-3"><span className="sr-only">Download</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filtered.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <FileText className="h-4 w-4 text-slate-400" /> {inv.invoiceNo}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {formatIssueDate(inv.issueDate)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-slate-900">{inv.consumer.name}</div>
                  <div className="text-xs text-slate-500">{inv.consumer.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{inv._count.items}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 tabular-nums">
                  {formatMoney(Number(inv.grandTotal), toCurrency(inv.currency))}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusPill label={inv.status.replace(/_/g, ' ')} variant={statusVariant(inv.status)} />
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => handleDownload(inv)}
                    disabled={downloadingId === inv.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
                    title="Download invoice"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloadingId === inv.id ? 'Preparing…' : 'Download'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                  No invoices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}
