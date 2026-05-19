/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TicketStatus } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusPill } from '@/components/ui/status-pill';
import { PanelCard } from '@/components/ui/panel-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserCircle, MapPin, Tag, RefreshCw, CheckSquare, Clock, History, FileOutput, Eye, PlayCircle, Upload, X, XCircle } from 'lucide-react';
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
  clerkApprovalStatus?: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
  clerkReceiptUrl?: string | null;
  serviceCost?: number | string | null;
  totalAmount?: number | string | null;
  deliveryCharges?: number | string | null;
  printingCharges?: number | string | null;
  attestedCharges?: number | string | null;
  nonAttestedCharges?: number | string | null;
  additionalCharges?: number | string | null;
  consumer: { id: string; name: string };
  service: { id: string; name: string; category: string; type: string };
};

type Representative = {
  id: string;
  name: string;
  city?: string | null;
  district?: string | null;
};

type ClerkCostsForm = {
  deliveryCharges: string;
  printingCharges: string;
  attestedCharges: string;
  nonAttestedCharges: string;
  additionalCharges: string;
  noOfPages: string;
  costPerPage: string;
};

const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'] as const;
const EMPTY_CLERK_COSTS: ClerkCostsForm = {
  deliveryCharges: '',
  printingCharges: '',
  attestedCharges: '',
  nonAttestedCharges: '',
  additionalCharges: '',
  noOfPages: '',
  costPerPage: '',
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
  const [forceAssign, setForceAssign] = useState(false);
  const [assignWarning, setAssignWarning] = useState('');

  const [timelineTicketId, setTimelineTicketId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<{
    history: Array<{ id: string; from: string | null; to: string; createdAt: string }>;
    assignments: Array<{
      id: string;
      createdAt: string;
      representative: { id: string; name: string };
    }>;
  } | null>(null);

  // Clerk (representative) role detection
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isClerk, setIsClerk] = useState(false);
  const [isConsumer, setIsConsumer] = useState(false);
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
      if (!u) return;

      if (u.role === 'representative') {
        setIsClerk(true);
        setCurrentUserId(u.id ?? null);
      }
      if (CONSUMER_ROLES.includes(u.role as (typeof CONSUMER_ROLES)[number])) {
        setIsConsumer(true);
        setCurrentUserId(u.id ?? null);
      }
    } catch {}
  }, []);

  // Clerk upload panel state
  const [uploadTicket, setUploadTicket] = useState<TicketRow | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadVisibleToConsumer, setUploadVisibleToConsumer] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clerk receipt submission state (ASA-7)
  const [receiptTicket, setReceiptTicket] = useState<TicketRow | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submittingReceipt, setSubmittingReceipt] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  // Admin: verify clerk receipt
  const [verifyTicket, setVerifyTicket] = useState<TicketRow | null>(null);
  const [verifyRejectReason, setVerifyRejectReason] = useState('');
  const [isVerifyRejectMode, setIsVerifyRejectMode] = useState(false);
  const [costsTicket, setCostsTicket] = useState<TicketRow | null>(null);
  const [clerkCosts, setClerkCosts] = useState<ClerkCostsForm>(EMPTY_CLERK_COSTS);
  const [rejectTicket, setRejectTicket] = useState<TicketRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [sendBackTicket, setSendBackTicket] = useState<TicketRow | null>(null);
  const [sendBackReason, setSendBackReason] = useState('');
  const clerkCostFields: Array<{
    label: string;
    key: keyof ClerkCostsForm;
  }> = [
    { label: 'Additional Cost', key: 'additionalCharges' },
    { label: 'Delivery Charges', key: 'deliveryCharges' },
    { label: 'No. of Pages', key: 'noOfPages' },
    { label: 'Cost Per Page', key: 'costPerPage' },
    { label: 'Non-Attested Charges', key: 'nonAttestedCharges' },
    { label: 'Attested Charges', key: 'attestedCharges' },
  ];

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
      if (isClerk && currentUserId) q.set('representativeId', currentUserId);
      if (isConsumer && currentUserId) q.set('consumerId', currentUserId);

      const result = await apiClient.get<any>(`/tickets?${q.toString()}`);
      setTickets(result.items ?? []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [status, dateRange, serviceFilter, isClerk, isConsumer, currentUserId]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const isAdmin = !isClerk && !isConsumer;

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
    if (st === 'WAITING_APPROVAL') return 'warning';
    return 'neutral';
  };

  const openCostsModal = (ticket: TicketRow) => {
    setCostsTicket(ticket);
    setClerkCosts({
      deliveryCharges: ticket.deliveryCharges ? String(ticket.deliveryCharges) : '',
      printingCharges: ticket.printingCharges ? String(ticket.printingCharges) : '',
      attestedCharges: ticket.attestedCharges ? String(ticket.attestedCharges) : '',
      nonAttestedCharges: ticket.nonAttestedCharges ? String(ticket.nonAttestedCharges) : '',
      additionalCharges: ticket.additionalCharges ? String(ticket.additionalCharges) : '',
      noOfPages: '',
      costPerPage: '',
    });
  };

  const hasSubmittedClerkCosts = (ticket: TicketRow) => {
    const serviceCost = Number(ticket.serviceCost || 0);
    const totalAmount = Number(ticket.totalAmount || 0);
    return (
      ticket.status === 'WAITING_APPROVAL' ||
      totalAmount > serviceCost ||
      Number(ticket.deliveryCharges || 0) > 0 ||
      Number(ticket.printingCharges || 0) > 0 ||
      Number(ticket.attestedCharges || 0) > 0 ||
      Number(ticket.nonAttestedCharges || 0) > 0 ||
      Number(ticket.additionalCharges || 0) > 0
    );
  };

  const canUploadForAdminApproval = (ticket: TicketRow) =>
    hasSubmittedClerkCosts(ticket) &&
    ticket.clerkApprovalStatus !== 'SUBMITTED' &&
    ticket.clerkApprovalStatus !== 'VERIFIED';

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
    setForceAssign(false);
    setAssignWarning('');
    try {
      const query = ticket.serviceCity ? `?city=${encodeURIComponent(ticket.serviceCity)}` : '';
      const reps = await apiClient.get<Representative[]>(`/tickets/representatives${query}`);
      setRepresentatives(reps);
      if (!reps.length) {
        setAssignWarning('No active representatives found. Add a representative user first.');
      }
    } catch (error: any) {
      setRepresentatives([]);
      setAssignWarning(error?.message || 'Failed to load representatives.');
    }
  };

  const submitAssign = async () => {
    if (!assignTicket) return;
    if (!representativeId) {
      setAssignWarning('Select a representative before confirming.');
      return;
    }
    try {
      setAssignWarning('');
      await apiClient.post(`/tickets/${assignTicket.id}/assign`, {
        representativeId,
        clerkCost: clerkCost ? Number(clerkCost) : undefined,
        forceAssign,
      });
      setAssignTicket(null);
      setMessage('Ticket assigned');
      loadTickets();
    } catch (error: any) {
      const msg = error?.message || 'Assignment failed';
      setAssignWarning(msg);
      setMessage(msg);
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

  // Admin: mark a single IN_PROGRESS ticket as completed
  const completeTicket = async (ticket: TicketRow) => {
    if (!confirm(`Mark ticket ${ticket.batchNo} as Completed? Payment status will be set to Paid.`)) return;
    try {
      const updated = await apiClient.patch<{
        caseId?: string | null;
        caseRecommendations?: Array<{ next: string; priority: number; reason?: string }>;
      }>(`/tickets/${ticket.id}/status`, { status: 'COMPLETED' });
      const recs = updated.caseRecommendations ?? [];
      if (updated.caseId && recs.length > 0) {
        const { FLOW_LABELS, isFlowKey } = await import('@wusuq/shared');
        const labels = recs
          .slice(0, 2)
          .map((r) => (isFlowKey(r.next) ? FLOW_LABELS[r.next] : r.next));
        setMessage(
          `✅ ${ticket.batchNo} completed. Suggested next on this case: ${labels.join(', ')}.`,
        );
      } else {
        setMessage(`Ticket ${ticket.batchNo} marked as Completed.`);
      }
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Failed to complete ticket');
    }
  };

  // Clerk: accept assigned ticket → IN_PROGRESS
  const acceptTicket = async (ticket: TicketRow) => {
    if (!confirm(`Accept ticket ${ticket.batchNo}? This will move it to In Progress.`)) return;
    try {
      await apiClient.patch(`/tickets/${ticket.id}/status`, { status: 'IN_PROGRESS' });
      setMessage(`Ticket ${ticket.batchNo} accepted and moved to In Progress.`);
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Failed to accept ticket');
    }
  };

  const submitClerkReceipt = async () => {
    if (!receiptTicket || !receiptFile) return setMessage('Select a receipt image to upload');
    setSubmittingReceipt(true);
    try {
      const formData = new FormData();
      formData.append('file', receiptFile);
      await apiClient.post(`/tickets/${receiptTicket.id}/clerk-receipt`, formData);
      setMessage('Submitted to admin for approval');
      setReceiptTicket(null);
      setReceiptFile(null);
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Receipt submission failed');
    } finally {
      setSubmittingReceipt(false);
    }
  };

  const handleVerifyClerkReceipt = async (decision: 'VERIFIED' | 'REJECTED') => {
    if (!verifyTicket) return;
    try {
      await apiClient.post(`/tickets/${verifyTicket.id}/clerk-receipt/verify`, {
        decision,
        reason: decision === 'REJECTED' ? verifyRejectReason || undefined : undefined,
      });
      setMessage(`Receipt ${decision.toLowerCase()}`);
      setVerifyTicket(null);
      setVerifyRejectReason('');
      setIsVerifyRejectMode(false);
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Verify failed');
    }
  };

  const submitClerkCosts = async () => {
    if (!costsTicket) return;
    try {
      const noOfPages = Number(clerkCosts.noOfPages) || 0;
      const costPerPage = Number(clerkCosts.costPerPage) || 0;
      await apiClient.post(`/tickets/${costsTicket.id}/clerk-costs`, {
        deliveryCharges: Number(clerkCosts.deliveryCharges) || 0,
        printingCharges: noOfPages * costPerPage,
        attestedCharges: Number(clerkCosts.attestedCharges) || 0,
        nonAttestedCharges: Number(clerkCosts.nonAttestedCharges) || 0,
        additionalCharges: Number(clerkCosts.additionalCharges) || 0,
        noOfPages,
        costPerPage,
      });
      setMessage('Costs submitted — ticket moved to Waiting Approval');
      setCostsTicket(null);
      setClerkCosts(EMPTY_CLERK_COSTS);
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Failed to submit costs');
    }
  };

  const rejectAssignment = async () => {
    if (!rejectTicket) return;
    try {
      await apiClient.post(`/tickets/${rejectTicket.id}/reject-assignment`, {
        reason: rejectReason,
      });
      setMessage(`Ticket ${rejectTicket.batchNo} rejected and returned to pending.`);
      setRejectTicket(null);
      setRejectReason('');
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Failed to reject assignment');
    }
  };

  const sendBackToClerk = async () => {
    if (!sendBackTicket) return;
    try {
      await apiClient.patch(`/tickets/${sendBackTicket.id}/status`, {
        status: 'IN_PROGRESS',
        note: sendBackReason || undefined,
      });
      setMessage(`Ticket ${sendBackTicket.batchNo} sent back to clerk.`);
      setSendBackTicket(null);
      setSendBackReason('');
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Failed to send ticket back');
    }
  };

  // Clerk: upload document (receipt or case file) for an IN_PROGRESS ticket
  const submitUpload = async () => {
    if (!uploadTicket || !uploadFile) return setMessage('Select a file to upload');
    setUploading(true);
    try {
      const currentTicket = uploadTicket;
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('visibleToConsumer', String(uploadVisibleToConsumer));
      await apiClient.post(`/tickets/${currentTicket.id}/documents/upload`, formData);
      setMessage('Document uploaded. Add payments to continue.');
      setUploadTicket(null);
      setUploadFile(null);
      setUploadVisibleToConsumer(false);
      openCostsModal(currentTicket);
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Upload failed');
    } finally {
      setUploading(false);
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
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <select
                  className="w-full sm:w-auto rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={dateRange}
                  onChange={e => setDateRange(e.target.value)}
                >
                  <option value="all">Any Date</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                </select>
                <select
                  className="w-full sm:w-auto rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={serviceFilter}
                  onChange={e => setServiceFilter(e.target.value)}
                >
                  <option value="all">Any Service</option>
                  <option value="JUDICIAL">Judicial</option>
                  <option value="NON_JUDICIAL">Non-Judicial</option>
                </select>
                {isAdmin && (
                  <>
                    <span className="hidden sm:block h-6 w-px bg-slate-200 mx-1" aria-hidden="true"></span>
                    <select
                      className="w-full sm:w-auto rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                      value={bulkAction}
                      onChange={(e) => setBulkAction(e.target.value)}
                    >
                      <option value="complete">Complete Tickets</option>
                      <option value="delete">Delete Tickets</option>
                      <option value="download-invoice">Download Invoice</option>
                      <option value="send-invoice">Send Invoice</option>
                    </select>
                    <button
                      type="button"
                      onClick={runBulkAction}
                      disabled={selectedIds.length === 0}
                      className="w-full sm:w-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                      Apply
                    </button>
                  </>
                )}
              </div>
            }
          />
        }
      >
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                      checked={filteredTickets.length > 0 && selectedIds.length === filteredTickets.length}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                    <span>Batch No</span>
                  </div>
                ) : (
                  <span>Batch No</span>
                )}
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
                    {isAdmin ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600 mt-0.5"
                        checked={Boolean(selected[ticket.id])}
                        onChange={(e) => setSelected(s => ({ ...s, [ticket.id]: e.target.checked }))}
                      />
                    ) : null}
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
                  <div className="flex flex-wrap items-center justify-end gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setViewTicketId(ticket.id)} className="text-slate-600 hover:text-primary-700 bg-slate-100 hover:bg-primary-50 px-3 py-1.5 rounded-md flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> View Details
                    </button>
                    {isClerk ? (
                      <>
                        {status === 'ASSIGNED' && (
                          <>
                            <button onClick={() => acceptTicket(ticket)} className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-md flex items-center gap-1">
                              <PlayCircle className="h-3.5 w-3.5" /> Accept
                            </button>
                            <button
                              onClick={() => {
                                setRejectTicket(ticket);
                                setRejectReason('');
                              }}
                              className="text-rose-600 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-md flex items-center gap-1"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </button>
                          </>
                        )}
                        {status === 'IN_PROGRESS' && (
                          <>
                            <button onClick={() => setUploadTicket(ticket)} className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md flex items-center gap-1">
                              <Upload className="h-3.5 w-3.5" /> Upload Work Documents
                            </button>
                            {!hasSubmittedClerkCosts(ticket) ? (
                              <button
                                onClick={() => openCostsModal(ticket)}
                                className="bg-slate-900 px-3 py-1.5 rounded-md flex items-center gap-1 text-white hover:bg-slate-800"
                              >
                                <CheckSquare className="h-3.5 w-3.5" /> Update Payments
                              </button>
                            ) : null}
                            {canUploadForAdminApproval(ticket) ? (
                              <button onClick={() => { setReceiptTicket(ticket); setReceiptFile(null); }} className="text-amber-600 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-md flex items-center gap-1">
                                <CheckSquare className="h-3.5 w-3.5" /> Submit to Admin
                              </button>
                            ) : null}
                          </>
                        )}
                        {status === 'WAITING_APPROVAL' && canUploadForAdminApproval(ticket) && (
                          <button onClick={() => { setReceiptTicket(ticket); setReceiptFile(null); }} className="text-amber-600 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-md flex items-center gap-1">
                            <CheckSquare className="h-3.5 w-3.5" /> Submit to Admin
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {status === 'PENDING' && (
                          <button onClick={() => openAssign(ticket)} className="text-primary-600 hover:text-primary-900 bg-primary-50 px-3 py-1.5 rounded-md flex items-center gap-1">
                            <CheckSquare className="h-3.5 w-3.5" /> Assign
                          </button>
                        )}
                        {status === 'IN_PROGRESS' && ticket.clerkApprovalStatus === 'SUBMITTED' && (
                          <>
                            <button onClick={() => { setVerifyTicket(ticket); setVerifyRejectReason(''); setIsVerifyRejectMode(false); }} className="text-amber-600 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-md flex items-center gap-1">
                              <Eye className="h-3.5 w-3.5" /> Verify Receipt
                            </button>
                          </>
                        )}
                        {status === 'WAITING_APPROVAL' && (
                          <>
                            {ticket.clerkApprovalStatus === 'SUBMITTED' ? (
                              <button onClick={() => { setVerifyTicket(ticket); setVerifyRejectReason(''); setIsVerifyRejectMode(false); }} className="text-amber-600 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-md flex items-center gap-1">
                                <Eye className="h-3.5 w-3.5" /> Verify Receipt
                              </button>
                            ) : null}
                            <button
                              onClick={() => completeTicket(ticket)}
                              className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-md flex items-center gap-1"
                            >
                              <PlayCircle className="h-3.5 w-3.5" /> Approve & Complete
                            </button>
                            <button
                              onClick={() => {
                                setSendBackTicket(ticket);
                                setSendBackReason('');
                              }}
                              className="text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-md flex items-center gap-1"
                            >
                              <History className="h-3.5 w-3.5" /> Send Back to Clerk
                            </button>
                          </>
                        )}
                        <button onClick={() => openTimeline(ticket.id)} className="text-slate-600 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-md flex items-center gap-1">
                          <History className="h-3.5 w-3.5" /> Timeline
                        </button>
                        <button onClick={() => regenerateTicket(ticket.id)} className="text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-3 py-1.5 rounded-md flex items-center gap-1" title="Regenerate Ticket">
                          <FileOutput className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
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

      {/* Assignment Modal */}
      {assignTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setAssignTicket(null)}
        >
        <PanelCard
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
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
          {assignWarning && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {assignWarning}
            </div>
          )}
          <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={forceAssign}
              onChange={(e) => setForceAssign(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
            />
            Override city restriction and assign anyway
          </label>
          <div className="mt-6 flex gap-3">
            <button
              onClick={submitAssign}
              disabled={!representativeId}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary-600"
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
        </div>
      )}

      {rejectTicket && (
        <PanelCard className="mt-6 border-rose-200 bg-rose-50/30">
          <div className="flex items-start justify-between">
            <SectionHeader
              title={`Reject Ticket ${rejectTicket.batchNo}`}
              description="Provide a reason so the admin can reassign this ticket."
            />
            <button onClick={() => setRejectTicket(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Rejection Reason</span>
              <textarea
                rows={4}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mt-2 block w-full rounded-xl border-0 px-3 py-2.5 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 sm:text-sm"
                placeholder="Explain why you cannot take this assignment."
              />
            </label>
            <div className="flex gap-3">
              <button
                onClick={rejectAssignment}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 transition-colors"
              >
                Confirm Rejection
              </button>
              <button
                onClick={() => setRejectTicket(null)}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </PanelCard>
      )}

      <Dialog open={Boolean(costsTicket)} onOpenChange={(open) => { if (!open) setCostsTicket(null); }}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Update ticket payments{costsTicket ? ` — ${costsTicket.batchNo}` : ''}</DialogTitle>
            <DialogDescription>Submit your final cost breakdown before the admin-approval upload step.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {clerkCostFields.map(({ label, key }) => (
              <FormField key={key} label={label} htmlFor={`cc-${key}`}>
                <Input
                  id={`cc-${key}`}
                  type="number"
                  min="0"
                  value={clerkCosts[key]}
                  onChange={(e) =>
                    setClerkCosts((current) => ({ ...current, [key]: e.target.value }))
                  }
                  placeholder="0"
                />
              </FormField>
            ))}
            <FormField label="Printing charges" hint="Computed automatically">
              <div className="flex h-11 items-center rounded-xl border border-border-soft bg-surface-muted px-4 text-sm">
                <span className="flex-1 font-semibold tabular-nums text-slate-900">
                  PKR {((Number(clerkCosts.noOfPages) || 0) * (Number(clerkCosts.costPerPage) || 0)).toLocaleString()}
                </span>
                <span className="text-xs text-slate-500">
                  {clerkCosts.noOfPages || '0'} × {clerkCosts.costPerPage || '0'}
                </span>
              </div>
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCostsTicket(null)}>Cancel</Button>
            <Button variant="primary" onClick={submitClerkCosts}>Submit costs</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Timeline Modal */}
      {timelineTicketId && timeline && (
        <PanelCard className="mt-6 bg-slate-50 border-slate-200">
          <SectionHeader title={`Timeline for ${timelineTicketId}`} />
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-900 border-b border-slate-200 pb-2"><Clock className="h-4 w-4" /> Status History</h4>
              <ul className="mt-4 space-y-4">
                {timeline.history.map((item) => (
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

      {/* Clerk: Upload Work Documents Panel */}
      {uploadTicket && (
        <PanelCard className="mt-6">
          <div className="flex items-start justify-between">
            <SectionHeader
              title={`Upload Work Documents — ${uploadTicket.batchNo}`}
              description="Upload case files, proofs, or supporting documents before entering the payment breakdown."
            />
            <button onClick={() => { setUploadTicket(null); setUploadFile(null); setUploadVisibleToConsumer(false); }} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Select File</span>
              <p className="text-xs text-slate-500 mt-0.5">Allowed: PDF, JPG, PNG, DOC, DOCX — max 10 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {uploadFile && (
              <p className="text-xs text-slate-500">Selected: <span className="font-medium text-slate-800">{uploadFile.name}</span> ({(uploadFile.size / 1024).toFixed(1)} KB)</p>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={uploadVisibleToConsumer}
                onChange={(e) => setUploadVisibleToConsumer(e.target.checked)}
              />
              Visible to consumer
            </label>
            <div className="flex gap-3 pt-2">
              <button
                onClick={submitUpload}
                disabled={!uploadFile || uploading}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <button
                onClick={() => { setUploadTicket(null); setUploadFile(null); setUploadVisibleToConsumer(false); }}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </PanelCard>
      )}

      {/* Clerk: Submit To Admin Panel */}
      {receiptTicket && (
        <PanelCard className="mt-6">
          <div className="flex items-start justify-between">
            <SectionHeader title={`Submit To Admin — ${receiptTicket.batchNo}`} description="Upload the final receipt or proof package for admin approval." />
            <button onClick={() => { setReceiptTicket(null); setReceiptFile(null); }} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Approval File</span>
              <p className="text-xs text-slate-500 mt-0.5">Allowed: JPG, PNG, PDF — max 10 MB</p>
              <input
                ref={receiptInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-amber-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-amber-700 hover:file:bg-amber-100"
                onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {receiptFile && (
              <p className="text-xs text-slate-500">Selected: <span className="font-medium text-slate-800">{receiptFile.name}</span> ({(receiptFile.size / 1024).toFixed(1)} KB)</p>
            )}
            <div className="flex gap-3">
              <button onClick={submitClerkReceipt} disabled={!receiptFile || submittingReceipt} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-500 disabled:opacity-50 transition-colors">
                {submittingReceipt ? 'Submitting...' : 'Submit to Admin'}
              </button>
              <button onClick={() => { setReceiptTicket(null); setReceiptFile(null); }} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50 transition-colors">Cancel</button>
            </div>
          </div>
        </PanelCard>
      )}

      {/* Admin: Verify Clerk Receipt Panel */}
      {verifyTicket && (
        <PanelCard className="mt-6 border-amber-200 bg-amber-50/30">
          <div className="flex items-start justify-between">
            <SectionHeader title={`Verify Clerk Receipt — ${verifyTicket.batchNo}`} description="Approve or reject the clerk's submitted payment receipt." />
            <button onClick={() => { setVerifyTicket(null); setVerifyRejectReason(''); setIsVerifyRejectMode(false); }} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors"><X className="h-5 w-5" /></button>
          </div>
          {isVerifyRejectMode && (
            <label className="mt-4 block">
              <span className="text-sm font-medium text-slate-700">Rejection Reason</span>
              <textarea
                rows={3}
                value={verifyRejectReason}
                onChange={(e) => setVerifyRejectReason(e.target.value)}
                className="mt-2 block w-full rounded-xl border-0 px-3 py-2.5 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 sm:text-sm"
                placeholder="Explain what the clerk needs to fix before resubmitting."
              />
            </label>
          )}
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => handleVerifyClerkReceipt('VERIFIED')}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
            >
              Approve
            </button>
            {isVerifyRejectMode ? (
              <button
                onClick={() => handleVerifyClerkReceipt('REJECTED')}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 transition-colors"
              >
                Confirm Reject
              </button>
            ) : (
              <button
                onClick={() => setIsVerifyRejectMode(true)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 transition-colors"
              >
                Reject
              </button>
            )}
            <button onClick={() => { setVerifyTicket(null); setVerifyRejectReason(''); setIsVerifyRejectMode(false); }} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50 transition-colors">Cancel</button>
          </div>
        </PanelCard>
      )}

      {sendBackTicket && (
        <PanelCard className="mt-6 border-amber-200 bg-amber-50/30">
          <div className="flex items-start justify-between">
            <SectionHeader
              title={`Send Back Ticket ${sendBackTicket.batchNo}`}
              description="Optionally include what the clerk needs to revise before resubmitting."
            />
            <button onClick={() => setSendBackTicket(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Reason</span>
              <textarea
                rows={3}
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                className="mt-2 block w-full rounded-xl border-0 px-3 py-2.5 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 sm:text-sm"
                placeholder="Describe what the clerk should correct."
              />
            </label>
            <div className="flex gap-3">
              <button
                onClick={sendBackToClerk}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-500 transition-colors"
              >
                Send Back
              </button>
              <button
                onClick={() => setSendBackTicket(null)}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
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
