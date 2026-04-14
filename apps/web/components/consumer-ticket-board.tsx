'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusPill } from '@/components/ui/status-pill';
import { RefreshCw, UserCircle, MapPin, Tag, Eye } from 'lucide-react';
import { TicketDetailPanel } from '@/components/ticket-detail-panel';

type TicketStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_APPROVAL' | 'COMPLETED';

type TicketRow = {
  id: string;
  batchNo: string;
  serviceCity: string | null;
  caseType: string | null;
  status: TicketStatus;
  consumer: { id: string; name: string };
  service: { id: string; name: string; category: string; type: string };
};

export function ConsumerTicketBoard() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [viewTicketId, setViewTicketId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { id?: string } | null;
      setCurrentUserId(user?.id ?? null);
    } catch {
      setCurrentUserId(null);
    }
  }, []);

  const loadTickets = useCallback(async () => {
    if (!currentUserId) return;

    setLoading(true);
    setMessage('');
    try {
      const q = new URLSearchParams({ limit: '200', consumerId: currentUserId });
      if (dateRange !== 'all') q.set('dateRange', dateRange);

      const result = await apiClient.get<{ items?: TicketRow[] }>(`/tickets?${q.toString()}`);
      setTickets(result.items ?? []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, dateRange]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const filteredTickets = useMemo(() => {
    if (!search) return tickets;
    const lower = search.toLowerCase();
    return tickets.filter((ticket) =>
      ticket.batchNo.toLowerCase().includes(lower) ||
      ticket.consumer.name.toLowerCase().includes(lower) ||
      ticket.service.name.toLowerCase().includes(lower)
    );
  }, [tickets, search]);

  const getStatusVariant = (status: TicketStatus) => {
    if (status === 'COMPLETED') return 'success' as const;
    if (status === 'PENDING') return 'warning' as const;
    if (status === 'ASSIGNED' || status === 'IN_PROGRESS') return 'info' as const;
    return 'neutral' as const;
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="My Tickets"
        description="Track every ticket tied to your account across all statuses."
        action={
          <button
            onClick={loadTickets}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft transition-colors hover:bg-surface-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <DataTableShell
        header={
          <FilterBar
            searchPlaceholder="Search batch, service, or your name..."
            onSearch={setSearch}
            actions={
              <select
                className="rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
              >
                <option value="all">Any Date</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            }
          />
        }
      >
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Batch No</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Consumer</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Service Details</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
              <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredTickets.map((ticket) => (
              <tr key={ticket.id} className="group transition-colors hover:bg-slate-50">
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{ticket.batchNo}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <UserCircle className="h-4 w-4 text-slate-400" />
                    <span className="text-sm text-slate-700">{ticket.consumer.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-slate-900">{ticket.service.name}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ticket.serviceCity || 'Anywhere'}</span>
                    <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {ticket.caseType || 'Standard'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusPill label={ticket.status} variant={getStatusVariant(ticket.status)} />
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => setViewTicketId(ticket.id)}
                      className="flex items-center gap-1 rounded-md bg-slate-100 px-3 py-1.5 text-slate-600 hover:bg-primary-50 hover:text-primary-700"
                    >
                      <Eye className="h-3.5 w-3.5" /> View Details
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredTickets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                  No tickets found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>

      {message && (
        <div className={`rounded-lg p-4 text-sm font-medium ${message.toLowerCase().includes('failed') ? 'border border-rose-200 bg-rose-50 text-rose-800' : 'border border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {message}
        </div>
      )}

      {viewTicketId && <TicketDetailPanel ticketId={viewTicketId} onClose={() => setViewTicketId(null)} />}
    </div>
  );
}
