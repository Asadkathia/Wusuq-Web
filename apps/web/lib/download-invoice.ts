import { apiClient } from './api-client';

export function invoiceFilename(invoiceNo: string): string {
  return `invoice-${invoiceNo}.pdf`;
}

/**
 * Download an issued invoice. The single implementation — the staff
 * InvoicesBoard and both consumer surfaces (TicketCard + ConsumerTicketDetail)
 * call this rather than each re-rolling the fetch/blob/anchor dance.
 *
 * `GET /invoices/:id/download` streams a raw binary PDF, so `apiClient.getBlob`
 * (which also parses the filename off Content-Disposition) is used directly.
 *
 * Throws on failure so the caller can surface a toast; the retired
 * `downloadTicketInvoice` swallowed errors into `console.error` with no
 * visible feedback.
 */
export async function downloadInvoice(invoiceId: string, invoiceNo: string): Promise<void> {
  const { blob, filename } = await apiClient.getBlob(`/invoices/${invoiceId}/download`);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || invoiceFilename(invoiceNo);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
