'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TicketStatus } from '@wusuq/shared';

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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

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

export function TicketBoard({ title, status }: TicketBoardProps) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkAction, setBulkAction] = useState('complete');

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
      const result = await apiRequest(`/tickets?status=${status}&limit=200`);
      setTickets(result.items ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const runBulkAction = async () => {
    if (selectedIds.length === 0) {
      setMessage('Select at least one ticket');
      return;
    }

    try {
      await apiRequest('/tickets/bulk-actions', 'POST', {
        action: bulkAction,
        ticketIds: selectedIds,
      });
      setMessage('Bulk action applied');
      setSelected({});
      await loadTickets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bulk action failed');
    }
  };

  const openAssign = async (ticket: TicketRow) => {
    setAssignTicket(ticket);
    setRepresentativeId('');
    setClerkCost('');

    try {
      const query = ticket.serviceCity ? `?city=${encodeURIComponent(ticket.serviceCity)}` : '';
      const reps = await apiRequest(`/tickets/representatives${query}`);
      setRepresentatives(reps);
    } catch {
      setRepresentatives([]);
    }
  };

  const submitAssign = async () => {
    if (!assignTicket || !representativeId) {
      setMessage('Select representative');
      return;
    }

    try {
      await apiRequest(`/tickets/${assignTicket.id}/assign`, 'POST', {
        representativeId,
        clerkCost: clerkCost ? Number(clerkCost) : undefined,
      });
      setAssignTicket(null);
      setMessage('Ticket assigned');
      await loadTickets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Assignment failed');
    }
  };

  const openTimeline = async (ticketId: string) => {
    try {
      const result = await apiRequest(`/tickets/${ticketId}/timeline`);
      setTimeline(result);
      setTimelineTicketId(ticketId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load timeline');
    }
  };

  const regenerateTicket = async (ticketId: string) => {
    try {
      await apiRequest(`/tickets/${ticketId}/regenerate`, 'POST');
      setMessage('Ticket regenerated');
      await loadTickets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Regenerate failed');
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-semibold">{title}</h2>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="rounded border border-slate-300 p-2 text-sm"
          value={bulkAction}
          onChange={(event) => setBulkAction(event.target.value)}
        >
          <option value="complete">Complete Tickets</option>
          <option value="immature">Immature Tickets</option>
          <option value="delete">Delete Tickets</option>
          <option value="download-invoice">Download Invoice</option>
          <option value="send-invoice">Send Invoice</option>
        </select>
        <button
          type="button"
          className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
          onClick={() => void runBulkAction()}
        >
          Apply Bulk Action
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          onClick={() => void loadTickets()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border border-slate-200 text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2">Select</th>
              <th className="p-2">Batch No</th>
              <th className="p-2">Consumer</th>
              <th className="p-2">Service</th>
              <th className="p-2">City</th>
              <th className="p-2">Case Type</th>
              <th className="p-2">Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="border-t border-slate-200">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[ticket.id])}
                    onChange={(event) =>
                      setSelected((current) => ({
                        ...current,
                        [ticket.id]: event.target.checked,
                      }))
                    }
                  />
                </td>
                <td className="p-2">{ticket.batchNo}</td>
                <td className="p-2">{ticket.consumer.name}</td>
                <td className="p-2">{ticket.service.name}</td>
                <td className="p-2">{ticket.serviceCity ?? '-'}</td>
                <td className="p-2">{ticket.caseType ?? '-'}</td>
                <td className="p-2">{ticket.status}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void openAssign(ticket)}
                    >
                      Assign
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void openTimeline(ticket.id)}
                    >
                      Timeline
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void regenerateTicket(ticket.id)}
                    >
                      Regenerate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {assignTicket ? (
        <div className="mt-6 rounded border border-slate-300 p-4">
          <h3 className="text-lg font-semibold">Assign Ticket {assignTicket.batchNo}</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Representative</span>
              <select
                className="w-full rounded border border-slate-300 p-2"
                value={representativeId}
                onChange={(event) => setRepresentativeId(event.target.value)}
              >
                <option value="">Select Representative</option>
                {representatives.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name} ({rep.city ?? '-'} / {rep.district ?? '-'})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span>Clerk Cost</span>
              <input
                className="w-full rounded border border-slate-300 p-2"
                value={clerkCost}
                onChange={(event) => setClerkCost(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
              onClick={() => void submitAssign()}
            >
              Submit Assignment
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              onClick={() => setAssignTicket(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {timelineTicketId && timeline ? (
        <div className="mt-6 rounded border border-slate-300 p-4">
          <h3 className="text-lg font-semibold">Timeline - {timelineTicketId}</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-medium">Status History</h4>
              <ul className="mt-2 space-y-1 text-sm">
                {timeline.history.map((item) => (
                  <li key={item.id}>
                    {item.from ?? 'N/A'} -&gt; {item.to} ({new Date(item.createdAt).toLocaleString()})
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-medium">Assignments</h4>
              <ul className="mt-2 space-y-1 text-sm">
                {timeline.assignments.map((item) => (
                  <li key={item.id}>
                    {item.representative.name} ({new Date(item.createdAt).toLocaleString()})
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            className="mt-3 rounded border border-slate-300 px-3 py-2 text-sm"
            onClick={() => {
              setTimelineTicketId(null);
              setTimeline(null);
            }}
          >
            Close Timeline
          </button>
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
