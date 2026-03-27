/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TicketStatus } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusPill } from '@/components/ui/status-pill';
import { PanelCard } from '@/components/ui/panel-card';
import { UserCircle, MapPin, Tag, RefreshCw, CheckSquare, Clock, History, FileOutput, Eye } from 'lucide-react';
import { TicketDetailPanel } from './ticket-detail-panel';

type TicketBoardProps = {
  title: string;
  status: TicketStatus;
};

type TicketRow = {
  id: string;
  batchNo: string;
  serviceCity: string | null;
  caseType: string | null;
  status: TicketStatus;
  consumer: { id: string; name: string };
  service: { id: string; name: string; category: string; type: string };
};

type Representative = {
  id: string;
  name: string;
  city?: string | null;
  district?: string | null;
};

export function TicketBoard({ title, status }: TicketBoardProps) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkAction, setBulkAction] = useState('complete');

  const [dateRange, setDateRange] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');

  const [viewTicketId, setViewTicketId] = useState<string | null>(null);

  const [assignTicket, setAssignTicket] = useState<TicketRow | null>(null);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [representativeId, setRepresentativeId] = useState('');
  const [clerkCost, setClerkCost] = useState('');

  const [timelineTicketId, setTimelineTicketId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<{
    history: Array<{ id: string; from: string | null; to: string; createdAt: string }>;
    assignments: Array<{
      id: string;
      createdAt: string;
      representative: { id: string; name: string };
    }>;
  } | null>(null);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, checked]) => checked).map(([id]) => id),
    [selected],
  );

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ status, limit: '200' });
      if (dateRange !== 'all') q.set('dateRange', dateRange);
      if (serviceFilter !== 'all') q.set('serviceCategory', serviceFilter);
      
      const result = await apiClient.get<any>(`/tickets?${q.toString()}`);
      setTickets(result.items ?? []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [status, dateRange, serviceFilter]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const filteredTickets = useMemo(() => {
    if (!search) return tickets;
    const lower = search.toLowerCase();
    return tickets.filter(t => 
       t.batchNo.toLowerCase().includes(lower) || 
       t.consumer.name.toLowerCase().includes(lower) ||
       t.service.name.toLowerCase().includes(lower)
    );
  }, [tickets, search]);

  const toggleAll = (checked: boolean) => {
    const newSelected: Record<string, boolean> = {};
    filteredTickets.forEach(t => { newSelected[t.id] = checked; });
    setSelected(newSelected);
  };

  const getStatusVariant = (st: string) => {
    if (st === 'COMPLETED') return 'success';
    if (st === 'PENDING') return 'warning';
    if (st === 'ASSIGNED' || st === 'IN_PROGRESS') return 'info';
    return 'neutral';
  };

  const runBulkAction = async () => {
    if (selectedIds.length === 0) return setMessage('Select at least one ticket');
    try {
      await apiClient.post('/tickets/bulk-actions', { action: bulkAction, ticketIds: selectedIds });
      setMessage('Bulk action applied');
      setSelected({});
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Bulk action failed');
    }
  };

  const openAssign = async (ticket: TicketRow) => {
    setAssignTicket(ticket);
    setRepresentativeId('');
    setClerkCost('');
    try {
      const query = ticket.serviceCity ? `?city=${encodeURIComponent(ticket.serviceCity)}` : '';
      const reps = await apiClient.get<Representative[]>(`/tickets/representatives${query}`);
      setRepresentatives(reps);
    } catch {
      setRepresentatives([]);
    }
  };

  const submitAssign = async () => {
    if (!assignTicket || !representativeId) return setMessage('Select representative');
    try {
      await apiClient.post(`/tickets/${assignTicket.id}/assign`, {
        representativeId,
        clerkCost: clerkCost ? Number(clerkCost) : undefined,
      });
      setAssignTicket(null);
      setMessage('Ticket assigned');
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Assignment failed');
    }
  };

  const openTimeline = async (ticketId: string) => {
    try {
      const result = await apiClient.get<any>(`/tickets/${ticketId}/timeline`);
      setTimeline(result);
      setTimelineTicketId(ticketId);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load timeline');
    }
  };

  const regenerateTicket = async (ticketId: string) => {
    try {
      await apiClient.post(`/tickets/${ticketId}/regenerate`);
      setMessage('Ticket regenerated');
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Regenerate failed');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader 
        title={title} 
        description={`Manage ${status.toLowerCase()} tickets and assignments.`}
        action={
          <button
            onClick={loadTickets}
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
            searchPlaceholder="Search batch, consumer, or service..."
            onSearch={setSearch}
            actions={
              <div className="flex items-center gap-2">
                <select 
                  className="rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={dateRange} 
                  onChange={e => setDateRange(e.target.value)}
                >
                  <option value="all">Any Date</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                </select>
                <select 
                  className="rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={serviceFilter} 
                  onChange={e => setServiceFilter(e.target.value)}
                >
                  <option value="all">Any Service</option>
                  <option value="JUDICIAL">Judicial</option>
                  <option value="NON_JUDICIAL">Non-Judicial</option>
                </select>
                <span className="h-6 w-px bg-slate-200 mx-1"></span>
                <select
                  className="rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value)}
                >
                  <option value="complete">Complete Tickets</option>
                  <option value="immature">Immature Tickets</option>
                  <option value="delete">Delete Tickets</option>
                  <option value="download-invoice">Download Invoice</option>
                  <option value="send-invoice">Send Invoice</option>
                </select>
                <button
                  type="button"
                  onClick={runBulkAction}
                  disabled={selectedIds.length === 0}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  Apply
                </button>
              </div>
            }
          />
        }
      >
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                    checked={filteredTickets.length > 0 && selectedIds.length === filteredTickets.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                  <span>Batch No</span>
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Consumer</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Service Details</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredTickets.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600 mt-0.5"
                      checked={Boolean(selected[ticket.id])}
                      onChange={(e) => setSelected(s => ({ ...s, [ticket.id]: e.target.checked }))}
                    />
                    <div className="text-sm font-medium text-slate-900">{ticket.batchNo}</div>
                  </div>
                </td>
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
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setViewTicketId(ticket.id)} className="text-slate-600 hover:text-primary-700 bg-slate-100 hover:bg-primary-50 px-3 py-1.5 rounded-md flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> View Details
                    </button>
                    {status !== 'COMPLETED' && (
                      <button onClick={() => openAssign(ticket)} className="text-primary-600 hover:text-primary-900 bg-primary-50 px-3 py-1.5 rounded-md flex items-center gap-1">
                        <CheckSquare className="h-3.5 w-3.5" /> Assign
                      </button>
                    )}
                    <button onClick={() => openTimeline(ticket.id)} className="text-slate-600 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-md flex items-center gap-1">
                      <History className="h-3.5 w-3.5" /> Timeline
                    </button>
                    <button onClick={() => regenerateTicket(ticket.id)} className="text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-3 py-1.5 rounded-md flex items-center gap-1" title="Regenerate Ticket">
                      <FileOutput className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredTickets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <FilterBar /> {/* Just as an icon placeholder, wait no */}
                    </div>
                    No tickets found matching your criteria.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>

      {/* Assignment Modal (Inline for now) */}
      {assignTicket && (
        <PanelCard className="mt-6">
          <SectionHeader title={`Assign Ticket ${assignTicket.batchNo}`} description="Select a representative to forward this ticket to." />
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Representative</span>
              <select
                className="mt-1 block w-full rounded-xl border-0 py-2.5 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm sm:leading-6"
                value={representativeId}
                onChange={(e) => setRepresentativeId(e.target.value)}
              >
                <option value="">Select Representative</option>
                {representatives.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name} ({rep.city || '-'} / {rep.district || '-'})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Clerk Cost Override (Optional)</span>
              <input
                type="number"
                className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm sm:leading-6"
                placeholder="0.00"
                value={clerkCost}
                onChange={(e) => setClerkCost(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={submitAssign}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 transition-colors"
            >
              Confirm Assignment
            </button>
            <button
              onClick={() => setAssignTicket(null)}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </PanelCard>
      )}

      {/* Timeline Modal */}
      {timelineTicketId && timeline && (
        <PanelCard className="mt-6 bg-slate-50 border-slate-200">
          <SectionHeader title={`Timeline for ${timelineTicketId}`} />
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-900 border-b border-slate-200 pb-2"><Clock className="h-4 w-4" /> Status History</h4>
              <ul className="mt-4 space-y-4">
                {timeline.history.map((item, idx) => (
                  <li key={item.id} className="relative flex gap-4">
                    <div className="absolute top-5 left-1.5 -bottom-5 w-px bg-slate-200" />
                    <div className="relative flex h-3 w-3 mt-1.5 flex-none items-center justify-center bg-white rounded-full ring-2 ring-primary-600" />
                    <div className="flex-auto py-0.5 text-sm leading-5">
                      <span className="font-medium text-slate-900">{item.to}</span>
                      {item.from && <span className="text-slate-500"> (from {item.from})</span>}
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
                {timeline.history.length === 0 && <p className="text-sm text-slate-500 mt-2">No status history found.</p>}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-900 border-b border-slate-200 pb-2"><History className="h-4 w-4" /> Assignments</h4>
              <ul className="mt-4 space-y-4">
                {timeline.assignments.map((item) => (
                  <li key={item.id} className="relative flex gap-4">
                     <div className="absolute top-5 left-1.5 -bottom-5 w-px bg-slate-200" />
                     <div className="relative flex h-3 w-3 mt-1.5 flex-none items-center justify-center bg-white rounded-full ring-2 ring-emerald-500" />
                     <div className="flex-auto py-0.5 text-sm leading-5">
                       <span className="font-medium text-slate-900">{item.representative.name}</span> assigned
                       <p className="text-xs text-slate-500 mt-0.5">{new Date(item.createdAt).toLocaleString()}</p>
                     </div>
                  </li>
                ))}
                {timeline.assignments.length === 0 && <p className="text-sm text-slate-500 mt-2">No assignments found.</p>}
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-slate-200 pt-4 flex justify-end">
            <button onClick={() => { setTimelineTicketId(null); setTimeline(null); }} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition-colors">
              Close Timeline
            </button>
          </div>
        </PanelCard>
      )}

      {message && (
        <div className={`mt-4 rounded-lg p-4 text-sm font-medium ${message.toLowerCase().includes('failed') || message.toLowerCase().includes('select') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {viewTicketId && (
        <TicketDetailPanel ticketId={viewTicketId} onClose={() => setViewTicketId(null)} />
      )}
    </div>
  );
}
