/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { formatMoney, toCurrency } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import { downloadInvoice } from '@/lib/download-invoice';
import { Button } from '@/components/ui/button';
import { PanelCard } from '@/components/ui/panel-card';
import { Skeleton } from '@/components/ui/skeleton';
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

function formatIssueDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusVariant(status: string): 'success' | 'warning' | 'info' {
  if (status === 'PAID') return 'success';
  if (status === 'PARTIALLY_PAID') return 'warning';
  return 'info'; // GENERATED
}

// Consumer-facing invoice list. GET /invoices scopes to `consumerId ===
// actor.sub` server-side (never a client filter), so this simply lists
// whatever the API returns.
export function ConsumerInvoicesBoard() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
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

  const handleDownload = async (invoice: InvoiceRow) => {
    if (downloadingId) return;
    setDownloadingId(invoice.id);
    try {
      await downloadInvoice(invoice.id, invoice.invoiceNo);
    } catch (err: any) {
      toast.error('Download failed', err?.message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My invoices</h1>
        <p className="mt-1 text-sm text-slate-500">Invoices issued for your paid tickets.</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <PanelCard className="text-center py-16">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
            <FileText className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-slate-900">No invoices yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Invoices appear here once one is issued for your tickets.
          </p>
        </PanelCard>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <PanelCard
              key={inv.id}
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{inv.invoiceNo}</p>
                  <p className="text-xs text-slate-500">
                    {formatIssueDate(inv.issueDate)} · {inv._count.items} ticket
                    {inv._count.items === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatMoney(Number(inv.grandTotal), toCurrency(inv.currency))}
                  </p>
                  <div className="mt-1">
                    <StatusPill label={inv.status.replace(/_/g, ' ')} variant={statusVariant(inv.status)} />
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={downloadingId === inv.id}
                  onClick={() => handleDownload(inv)}
                  leftIcon={<Download className="h-3.5 w-3.5" />}
                >
                  {downloadingId === inv.id ? 'Preparing…' : 'Download'}
                </Button>
              </div>
            </PanelCard>
          ))}
        </div>
      )}
    </div>
  );
}
