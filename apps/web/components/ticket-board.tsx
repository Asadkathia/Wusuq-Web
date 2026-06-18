/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TicketStatus } from '@wusuq/shared';
import { chargeCapabilitiesFor } from '@wusuq/shared';
import { TICKET_STATUSES } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import { paymentsClient } from '@/lib/payments-client';
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
  deliveryStatus?: 'PENDING' | 'DISPATCHED' | null;
  trackingNo?: string | null;
  dispatchProofUrl?: string | null;
  serviceCost?: number | string | null;
  totalAmount?: number | string | null;
  amountPaid?: number | string | null;
  remainderFinalizedAt?: string | null;
  deliveryCharges?: number | string | null;
  printingCharges?: number | string | null;
  attestedCharges?: number | string | null;
  nonAttestedCharges?: number | string | null;
  additionalCharges?: number | string | null;
  intakeFlow?: string | null;
  createdBy?: string | null;
  defaultClerkCost?: number | null;
  scheduledDate?: string | null;
  hearingType?: string | null;
  payload?: Record<string, string> | null;
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
  const [overrideClerkCost, setOverrideClerkCost] = useState(false);
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

  // Role detection from localStorage
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

  // Clerk upload panel state — two-zone multi-file upload
  const [uploadTicket, setUploadTicket] = useState<TicketRow | null>(null);
  const [workFiles, setWorkFiles] = useState<File[]>([]);
  const [deliverableFiles, setDeliverableFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const workInputRef = useRef<HTMLInputElement>(null);
  const deliverableInputRef = useRef<HTMLInputElement>(null);

  // Admin: bulk assign selected pending tickets
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkRepresentatives, setBulkRepresentatives] = useState<Representative[]>([]);
  const [bulkRepresentativeId, setBulkRepresentativeId] = useState('');
  const [bulkForceAssign, setBulkForceAssign] = useState(false);
  const [bulkAssignWarning, setBulkAssignWarning] = useState('');

  // Clerk: next-hearing capture (inside costs / completion flow)
  const [nextHearingEnabled, setNextHearingEnabled] = useState(false);
  const [nextHearingDate, setNextHearingDate] = useState('');
  const [nextHearingType, setNextHearingType] = useState('');

  // Selected ticket IDs for multi-ticket pending-list checkboxes (admin only)
  const [pendingSelected, setPendingSelected] = useState<Record<string, boolean>>({});

  // Clerk receipt submission state (ASA-7)
  const [receiptTicket, setReceiptTicket] = useState<TicketRow | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submittingReceipt, setSubmittingReceipt] = useState(false);
  // Clerk dispatch (physical flows): mark a completed ticket dispatched with a
  // courier proof + tracking no.
  const [dispatchTicket, setDispatchTicket] = useState<TicketRow | null>(null);
  const [dispatchFile, setDispatchFile] = useState<File | null>(null);
  const [dispatchTracking, setDispatchTracking] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  // Admin: verify clerk receipt
  const [costsTicket, setCostsTicket] = useState<TicketRow | null>(null);
  const [clerkCosts, setClerkCosts] = useState<ClerkCostsForm>(EMPTY_CLERK_COSTS);
  const [rejectTicket, setRejectTicket] = useState<TicketRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [sendBackTicket, setSendBackTicket] = useState<TicketRow | null>(null);
  const [sendBackReason, setSendBackReason] = useState('');

  // Admin: Finalize remainder (phase-2 charges)
  type FinalizeForm = {
    attestedCharges: string;
    nonAttestedCharges: string;
    printingCharges: string;
    deliveryCharges: string;
  };
  const EMPTY_FINALIZE: FinalizeForm = {
    attestedCharges: '',
    nonAttestedCharges: '',
    printingCharges: '',
    deliveryCharges: '',
  };
  const [finalizeTicket, setFinalizeTicket] = useState<TicketRow | null>(null);
  const [finalizeForm, setFinalizeForm] = useState<FinalizeForm>(EMPTY_FINALIZE);
  const [finalizing, setFinalizing] = useState(false);

  const openFinalizeModal = (ticket: TicketRow) => {
    setFinalizeTicket(ticket);
    setFinalizeForm({
      attestedCharges: ticket.attestedCharges ? String(ticket.attestedCharges) : '',
      nonAttestedCharges: ticket.nonAttestedCharges ? String(ticket.nonAttestedCharges) : '',
      printingCharges: ticket.printingCharges ? String(ticket.printingCharges) : '',
      deliveryCharges: ticket.deliveryCharges ? String(ticket.deliveryCharges) : '',
    });
  };

  // Admin "Review & Complete": one step — verify the clerk receipt, finalize
  // any phase-2 charges, and complete the ticket (digital flows auto-deliver).
  const submitFinalize = async () => {
    if (!finalizeTicket) return;
    setFinalizing(true);
    try {
      await paymentsClient.reviewAndComplete(finalizeTicket.id, {
        attestedCharges: Number(finalizeForm.attestedCharges) || 0,
        nonAttestedCharges: Number(finalizeForm.nonAttestedCharges) || 0,
        printingCharges: Number(finalizeForm.printingCharges) || 0,
        deliveryCharges: Number(finalizeForm.deliveryCharges) || 0,
      });
      setMessage(`Ticket ${finalizeTicket.batchNo} reviewed & completed.`);
      setFinalizeTicket(null);
      setFinalizeForm(EMPTY_FINALIZE);
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Review & complete failed');
    } finally {
      setFinalizing(false);
    }
  };

  // Admin "Confirm delivered" — only for a physical ticket the clerk dispatched.
  const confirmDelivered = async (ticket: TicketRow) => {
    if (!confirm(`Confirm ${ticket.batchNo} delivered to the consumer?`)) return;
    try {
      await apiClient.patch(`/tickets/${ticket.id}/status`, {
        status: 'DELIVERED',
      });
      setMessage(`Ticket ${ticket.batchNo} marked delivered.`);
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Failed to mark delivered');
    }
  };

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
  // Any staff/admin/finance user (non-clerk, non-consumer) gets the status
  // override control; the backend @RequirePermissions('tickets.write') is the
  // real guard. (The previous role-string allowlist was brittle — it omitted
  // manager_admin/staff_admin/lead_admin and referenced a non-existent 'admin'.)
  const isAdminOrFinance = isAdmin;

  const handleStatusOverride = async (ticket: TicketRow, newStatus: string) => {
    if (newStatus === ticket.status) return;
    // Normal transitions for the 7-status machine
    const NORMAL_NEXT: Record<string, string> = {
      UNPAID: 'PAID',
      PAID: 'ASSIGNED',
      ASSIGNED: 'IN_PROGRESS',
      IN_PROGRESS: 'WAITING_APPROVAL',
      WAITING_APPROVAL: 'COMPLETED',
      COMPLETED: 'DELIVERED',
    };
    const isNormalNext = NORMAL_NEXT[ticket.status] === newStatus;
    if (!isNormalNext) {
      const confirmed = window.confirm(
        `Override ticket ${ticket.batchNo} status from ${ticket.status} → ${newStatus}?\n\nThis bypasses the normal workflow and will be recorded in the audit log.`,
      );
      if (!confirmed) return;
    }
    try {
      await paymentsClient.overrideStatus(ticket.id, newStatus);
      setMessage(`Ticket ${ticket.batchNo} status set to ${newStatus}`);
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Status override failed');
    }
  };

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
    if (st === 'COMPLETED' || st === 'DELIVERED') return 'success';
    if (st === 'UNPAID') return 'warning';
    if (st === 'PAID') return 'info';
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
    setClerkCost(ticket.defaultClerkCost != null ? String(ticket.defaultClerkCost) : '');
    setOverrideClerkCost(false);
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
      const resolvedClerkCost = overrideClerkCost
        ? (clerkCost ? Number(clerkCost) : undefined)
        : (assignTicket.defaultClerkCost != null ? assignTicket.defaultClerkCost : undefined);
      await apiClient.post(`/tickets/${assignTicket.id}/assign`, {
        representativeId,
        clerkCost: resolvedClerkCost,
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

  // Clerk: accept assigned ticket → IN_PROGRESS. Uses the dedicated
  // accept-assignment endpoint (tickets.clerk + assignee-bound) — clerks no
  // longer hold tickets.write, so the generic status PATCH would 403.
  const acceptTicket = async (ticket: TicketRow) => {
    if (!confirm(`Accept ticket ${ticket.batchNo}? This will move it to In Progress.`)) return;
    try {
      await apiClient.post(`/tickets/${ticket.id}/accept-assignment`, {});
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

  // Clerk: mark a completed physical ticket dispatched (courier proof + tracking).
  const submitDispatch = async () => {
    if (!dispatchTicket) return;
    setDispatching(true);
    try {
      const formData = new FormData();
      if (dispatchFile) formData.append('file', dispatchFile);
      if (dispatchTracking.trim()) formData.append('trackingNo', dispatchTracking.trim());
      await apiClient.post(`/tickets/${dispatchTicket.id}/dispatch`, formData);
      setMessage(`Ticket ${dispatchTicket.batchNo} marked dispatched.`);
      setDispatchTicket(null);
      setDispatchFile(null);
      setDispatchTracking('');
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Dispatch failed');
    } finally {
      setDispatching(false);
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
      await paymentsClient.sendBackToClerk(
        sendBackTicket.id,
        sendBackReason || undefined,
      );
      setMessage(`Ticket ${sendBackTicket.batchNo} sent back to clerk.`);
      setSendBackTicket(null);
      setSendBackReason('');
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Failed to send ticket back');
    }
  };

  // Clerk: two-zone multi-file document upload for an IN_PROGRESS ticket
  const submitUpload = async () => {
    if (!uploadTicket) return;
    const allFiles: Array<{ file: File; category: 'WORK_DOCUMENT' | 'DELIVERABLE_PDF' }> = [
      ...workFiles.map((f) => ({ file: f, category: 'WORK_DOCUMENT' as const })),
      ...deliverableFiles.map((f) => ({ file: f, category: 'DELIVERABLE_PDF' as const })),
    ];
    if (allFiles.length === 0) return setMessage('Select at least one file to upload');
    setUploading(true);
    try {
      const currentTicket = uploadTicket;
      let uploadedCount = 0;
      for (const { file, category } of allFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        formData.append('visibleToConsumer', category === 'DELIVERABLE_PDF' ? 'true' : 'false');
        await apiClient.post(`/tickets/${currentTicket.id}/documents/upload`, formData);
        uploadedCount++;
      }
      setMessage(`${uploadedCount} file(s) uploaded. Add payments to continue.`);
      setUploadTicket(null);
      setWorkFiles([]);
      setDeliverableFiles([]);
      openCostsModal(currentTicket);
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Admin: open bulk-assign dialog for selected unpaid/paid tickets
  const openBulkAssign = async () => {
    const ids = (status === 'UNPAID' || status === 'PAID')
      ? Object.entries(pendingSelected).filter(([, v]) => v).map(([id]) => id)
      : selectedIds;
    if (ids.length === 0) return setMessage('Select at least one ticket to bulk-assign');
    setBulkRepresentativeId('');
    setBulkForceAssign(false);
    setBulkAssignWarning('');
    try {
      const reps = await apiClient.get<Representative[]>('/tickets/representatives');
      setBulkRepresentatives(reps);
      if (!reps.length) setBulkAssignWarning('No active representatives found.');
    } catch (error: any) {
      setBulkRepresentatives([]);
      setBulkAssignWarning(error?.message || 'Failed to load representatives.');
    }
    setBulkAssignOpen(true);
  };

  const submitBulkAssign = async () => {
    const ids = (status === 'UNPAID' || status === 'PAID')
      ? Object.entries(pendingSelected).filter(([, v]) => v).map(([id]) => id)
      : selectedIds;
    if (ids.length === 0) return;
    if (!bulkRepresentativeId) {
      setBulkAssignWarning('Select a representative before confirming.');
      return;
    }
    try {
      setBulkAssignWarning('');
      const result = await paymentsClient.assignBulk({
        ticketIds: ids,
        representativeId: bulkRepresentativeId,
        forceAssign: bulkForceAssign || undefined,
      });
      const skippedMsg = result.skipped.length
        ? ` Skipped ${result.skipped.length}: ${result.skipped.map((s) => s.reason).join('; ')}`
        : '';
      setMessage(`Assigned ${result.assigned.length} ticket(s).${skippedMsg}`);
      setBulkAssignOpen(false);
      setPendingSelected({});
      setSelected({});
      loadTickets();
    } catch (error: any) {
      setBulkAssignWarning(error?.message || 'Bulk assignment failed');
      setMessage(error?.message || 'Bulk assignment failed');
    }
  };

  // Clerk: record next-hearing date on a ticket. Returns true on success.
  const submitNextHearing = async (ticketId: string): Promise<boolean> => {
    if (!nextHearingDate) return true; // nothing to save, treat as success
    try {
      await paymentsClient.recordNextHearing(ticketId, {
        scheduledDate: nextHearingDate,
        hearingType: nextHearingType || undefined,
      });
      setMessage('Next hearing date recorded.');
      setNextHearingEnabled(false);
      setNextHearingDate('');
      setNextHearingType('');
      loadTickets();
      return true;
    } catch (error: any) {
      setMessage(error.message || 'Failed to record next hearing');
      return false;
    }
  };

  // Admin: generate a new follow-up ticket from a completed ticket's next-hearing date
  const generateNextHearing = async (ticket: TicketRow) => {
    if (!confirm(`Generate a follow-up hearing ticket from ${ticket.batchNo}?`)) return;
    try {
      const result = await paymentsClient.generateNextHearing(ticket.id);
      setMessage(`Follow-up ticket generated: ${result.batchNo}`);
      loadTickets();
    } catch (error: any) {
      setMessage(error.message || 'Failed to generate next-hearing ticket');
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
                    {status === 'UNPAID' || status === 'PAID' ? (
                      <button
                        type="button"
                        onClick={openBulkAssign}
                        disabled={Object.values(pendingSelected).filter(Boolean).length === 0}
                        className="w-full sm:w-auto rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors"
                      >
                        Assign selected to clerk
                      </button>
                    ) : (
                      <>
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
                      checked={
                        filteredTickets.length > 0 &&
                        (status === 'UNPAID' || status === 'PAID'
                          ? filteredTickets.every((t) => pendingSelected[t.id])
                          : selectedIds.length === filteredTickets.length)
                      }
                      onChange={(e) => {
                        if (status === 'UNPAID' || status === 'PAID') {
                          const next: Record<string, boolean> = {};
                          filteredTickets.forEach((t) => { next[t.id] = e.target.checked; });
                          setPendingSelected(next);
                        } else {
                          toggleAll(e.target.checked);
                        }
                      }}
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
                        checked={status === 'UNPAID' || status === 'PAID' ? Boolean(pendingSelected[ticket.id]) : Boolean(selected[ticket.id])}
                        onChange={(e) => {
                          if (status === 'UNPAID' || status === 'PAID') {
                            setPendingSelected((s) => ({ ...s, [ticket.id]: e.target.checked }));
                          } else {
                            setSelected((s) => ({ ...s, [ticket.id]: e.target.checked }));
                          }
                        }}
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
                  {isAdminOrFinance ? (
                    <select
                      className="rounded-lg border-0 py-1.5 pl-2 pr-7 text-xs font-medium shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600"
                      value={ticket.status}
                      onChange={(e) => handleStatusOverride(ticket, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      title="Override ticket status (admin only)"
                    >
                      {TICKET_STATUSES.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  ) : (
                    <StatusPill label={ticket.status} variant={getStatusVariant(ticket.status)} />
                  )}
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
                        {status === 'COMPLETED' &&
                          chargeCapabilitiesFor(ticket.intakeFlow).delivery &&
                          ticket.deliveryStatus !== 'DISPATCHED' && (
                            <button
                              onClick={() => { setDispatchTicket(ticket); setDispatchFile(null); setDispatchTracking(''); }}
                              className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md flex items-center gap-1"
                            >
                              <Upload className="h-3.5 w-3.5" /> Mark Dispatched
                            </button>
                          )}
                      </>
                    ) : (
                      <>
                        {(status === 'UNPAID' || status === 'PAID') && (
                          <button onClick={() => openAssign(ticket)} className="text-primary-600 hover:text-primary-900 bg-primary-50 px-3 py-1.5 rounded-md flex items-center gap-1">
                            <CheckSquare className="h-3.5 w-3.5" /> Assign
                          </button>
                        )}
                        {status === 'WAITING_APPROVAL' && (
                          <>
                            {/* One step: verify the clerk receipt + finalize any
                                charges + complete (digital auto-delivers). */}
                            <button
                              onClick={() => openFinalizeModal(ticket)}
                              className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-md flex items-center gap-1"
                            >
                              <PlayCircle className="h-3.5 w-3.5" /> Review &amp; Complete
                            </button>
                            <button
                              onClick={() => {
                                setSendBackTicket(ticket);
                                setSendBackReason('');
                              }}
                              className="text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-md flex items-center gap-1"
                            >
                              <History className="h-3.5 w-3.5" /> Send Back
                            </button>
                          </>
                        )}
                        {status === 'COMPLETED' &&
                          chargeCapabilitiesFor(ticket.intakeFlow).delivery &&
                          ticket.deliveryStatus === 'DISPATCHED' && (
                            <button
                              onClick={() => confirmDelivered(ticket)}
                              className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-md flex items-center gap-1"
                              title={
                                ticket.trackingNo
                                  ? `Dispatched · tracking ${ticket.trackingNo}`
                                  : 'Confirm the consumer received the dispatched files'
                              }
                            >
                              <CheckSquare className="h-3.5 w-3.5" /> Confirm Delivered
                            </button>
                          )}
                        <button onClick={() => openTimeline(ticket.id)} className="text-slate-600 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-md flex items-center gap-1">
                          <History className="h-3.5 w-3.5" /> Timeline
                        </button>
                        {status === 'COMPLETED' && ticket.scheduledDate && (
                          <button
                            onClick={() => generateNextHearing(ticket)}
                            className="text-teal-600 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-md flex items-center gap-1"
                            title="Generate follow-up hearing ticket"
                          >
                            <Clock className="h-3.5 w-3.5" /> Next Hearing
                          </button>
                        )}
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

            <div className="block">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Clerk Cost</span>
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overrideClerkCost}
                    onChange={(e) => {
                      setOverrideClerkCost(e.target.checked);
                      if (!e.target.checked) {
                        setClerkCost(assignTicket.defaultClerkCost != null ? String(assignTicket.defaultClerkCost) : '');
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                  />
                  Override clerk cost
                </label>
              </div>
              <input
                type="number"
                className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm sm:leading-6 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                placeholder="0.00"
                value={clerkCost}
                disabled={!overrideClerkCost}
                onChange={(e) => setClerkCost(e.target.value)}
              />
              {!overrideClerkCost && assignTicket.defaultClerkCost == null && (
                <p className="mt-1 text-xs text-slate-400">No default cost — enable override to set a value.</p>
              )}
            </div>
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

      <Dialog open={Boolean(costsTicket)} onOpenChange={(open) => {
        if (!open) {
          setCostsTicket(null);
          setNextHearingEnabled(false);
          setNextHearingDate('');
          setNextHearingType('');
        }
      }}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Update ticket payments{costsTicket ? ` — ${costsTicket.batchNo}` : ''}</DialogTitle>
            <DialogDescription>Submit your final cost breakdown before the admin-approval upload step.</DialogDescription>
          </DialogHeader>
          {costsTicket && (() => {
            const caps = chargeCapabilitiesFor(costsTicket.intakeFlow);
            const visibleFields = clerkCostFields.filter(({ key }) => {
              if (key === 'attestedCharges' || key === 'nonAttestedCharges') return caps.attestation;
              if (key === 'deliveryCharges') return caps.delivery;
              if (key === 'additionalCharges') return true; // always show additional
              // noOfPages and costPerPage drive printing
              if (key === 'noOfPages' || key === 'costPerPage') return caps.printing;
              return true;
            });
            const noCaps = !caps.attestation && !caps.printing && !caps.delivery && !caps.pdf;
            return (
              <div className="space-y-6">
                {noCaps ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    This service type has no billable phase-2 charges.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {visibleFields.map(({ label, key }) => (
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
                    {caps.printing && (
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
                    )}
                  </div>
                )}

                {/* Clerk: optional next-hearing capture (PENDING tickets only) */}
                {isClerk && costsTicket.status === 'IN_PROGRESS' && (
                  <div className="rounded-xl border border-border-soft p-4 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={nextHearingEnabled}
                        onChange={(e) => {
                          setNextHearingEnabled(e.target.checked);
                          if (!e.target.checked) { setNextHearingDate(''); setNextHearingType(''); }
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                      />
                      <span className="text-sm font-medium text-slate-700">Record next hearing date</span>
                    </label>
                    {nextHearingEnabled && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label="Hearing date" htmlFor="nh-date">
                          <Input
                            id="nh-date"
                            type="date"
                            value={nextHearingDate}
                            onChange={(e) => setNextHearingDate(e.target.value)}
                          />
                        </FormField>
                        <FormField label="Hearing type (optional)" htmlFor="nh-type">
                          <Input
                            id="nh-type"
                            type="text"
                            placeholder="e.g. Arguments, Evidence"
                            value={nextHearingType}
                            onChange={(e) => setNextHearingType(e.target.value)}
                          />
                        </FormField>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCostsTicket(null); setNextHearingEnabled(false); setNextHearingDate(''); setNextHearingType(''); }}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (costsTicket && nextHearingEnabled && nextHearingDate) {
                  const hearingSaved = await submitNextHearing(costsTicket.id);
                  if (!hearingSaved) return;
                }
                submitClerkCosts();
              }}
            >
              Submit costs
            </Button>
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

      {/* Clerk: Two-zone Upload Panel (Work Documents + Deliverable PDFs) */}
      {uploadTicket && (
        <PanelCard className="mt-6">
          <div className="flex items-start justify-between">
            <SectionHeader
              title={`Upload Documents — ${uploadTicket.batchNo}`}
              description="Upload work documents and deliverable PDFs. Deliverables are automatically visible to the consumer."
            />
            <button
              onClick={() => { setUploadTicket(null); setWorkFiles([]); setDeliverableFiles([]); }}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {/* Zone 1: Work Documents */}
            <div className="rounded-xl border border-border-soft p-4 space-y-3">
              <div>
                <span className="text-sm font-semibold text-slate-800">Work documents</span>
                <p className="text-xs text-slate-500 mt-0.5">Internal case files, proofs, notes — not visible to consumer</p>
              </div>
              <input
                ref={workInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                onChange={(e) => setWorkFiles(Array.from(e.target.files ?? []))}
              />
              {workFiles.length > 0 && (
                <ul className="space-y-1">
                  {workFiles.map((f, i) => (
                    <li key={i} className="text-xs text-slate-600 flex items-center gap-1">
                      <span className="font-medium">{f.name}</span>
                      <span className="text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Zone 2: Deliverable PDFs */}
            <div className="rounded-xl border border-border-soft p-4 space-y-3">
              <div>
                <span className="text-sm font-semibold text-slate-800">Deliverable PDF(s)</span>
                <p className="text-xs text-slate-500 mt-0.5">Final certified documents — automatically visible to consumer</p>
              </div>
              <input
                ref={deliverableInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
                onChange={(e) => setDeliverableFiles(Array.from(e.target.files ?? []))}
              />
              {deliverableFiles.length > 0 && (
                <ul className="space-y-1">
                  {deliverableFiles.map((f, i) => (
                    <li key={i} className="text-xs text-slate-600 flex items-center gap-1">
                      <span className="font-medium">{f.name}</span>
                      <span className="text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-3 pt-2">
            <button
              onClick={submitUpload}
              disabled={(workFiles.length === 0 && deliverableFiles.length === 0) || uploading}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploading...' : `Upload ${workFiles.length + deliverableFiles.length > 0 ? `(${workFiles.length + deliverableFiles.length})` : ''}`}
            </button>
            <button
              onClick={() => { setUploadTicket(null); setWorkFiles([]); setDeliverableFiles([]); }}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
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

      {/* Clerk: Mark Dispatched (physical flows) */}
      {dispatchTicket && (
        <PanelCard className="mt-6">
          <div className="flex items-start justify-between">
            <SectionHeader title={`Mark Dispatched — ${dispatchTicket.batchNo}`} description="Confirm you sent the physical files for delivery. Attach a courier receipt and/or tracking number." />
            <button onClick={() => { setDispatchTicket(null); setDispatchFile(null); setDispatchTracking(''); }} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Tracking number</span>
              <input
                type="text"
                value={dispatchTracking}
                onChange={(e) => setDispatchTracking(e.target.value)}
                placeholder="e.g. TCS-123456789"
                className="mt-2 block w-full rounded-xl border-0 px-3 py-2.5 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 sm:text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Courier proof <span className="font-normal text-slate-400">(optional)</span></span>
              <p className="text-xs text-slate-500 mt-0.5">Allowed: JPG, PNG, PDF — max 10 MB</p>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                onChange={(e) => setDispatchFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {dispatchFile && (
              <p className="text-xs text-slate-500">Selected: <span className="font-medium text-slate-800">{dispatchFile.name}</span></p>
            )}
            <div className="flex gap-3">
              <button onClick={submitDispatch} disabled={dispatching || (!dispatchFile && !dispatchTracking.trim())} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                {dispatching ? 'Saving…' : 'Mark Dispatched'}
              </button>
              <button onClick={() => { setDispatchTicket(null); setDispatchFile(null); setDispatchTracking(''); }} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50 transition-colors">Cancel</button>
            </div>
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

      {/* Admin: Finalize Phase-2 Charges */}
      <Dialog open={Boolean(finalizeTicket)} onOpenChange={(open) => { if (!open) { setFinalizeTicket(null); setFinalizeForm(EMPTY_FINALIZE); } }}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Review &amp; Complete{finalizeTicket ? ` — ${finalizeTicket.batchNo}` : ''}</DialogTitle>
            <DialogDescription>Verify the clerk&rsquo;s submission, finalize any phase-2 charges, and complete the ticket. Digital services are delivered automatically once fully paid.</DialogDescription>
          </DialogHeader>
          {finalizeTicket && (() => {
            const caps = chargeCapabilitiesFor(finalizeTicket.intakeFlow);
            const hasAnyCap = caps.attestation || caps.printing || caps.delivery || caps.pdf;
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-100">
                  <CheckSquare className="h-4 w-4 shrink-0" />
                  {finalizeTicket.clerkReceiptUrl
                    ? 'Clerk receipt submitted.'
                    : 'No clerk receipt on file.'}
                  {!hasAnyCap ? ' No phase-2 charges for this service.' : ''}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {caps.attestation && (
                    <>
                      <FormField label="Attested Charges" htmlFor="fin-attested">
                        <Input id="fin-attested" type="number" min="0" placeholder="0"
                          value={finalizeForm.attestedCharges}
                          onChange={(e) => setFinalizeForm((f) => ({ ...f, attestedCharges: e.target.value }))} />
                      </FormField>
                      <FormField label="Non-Attested Charges" htmlFor="fin-non-attested">
                        <Input id="fin-non-attested" type="number" min="0" placeholder="0"
                          value={finalizeForm.nonAttestedCharges}
                          onChange={(e) => setFinalizeForm((f) => ({ ...f, nonAttestedCharges: e.target.value }))} />
                      </FormField>
                    </>
                  )}
                  {caps.printing && (
                    <FormField label="Printing Charges" htmlFor="fin-printing">
                      <Input id="fin-printing" type="number" min="0" placeholder="0"
                        value={finalizeForm.printingCharges}
                        onChange={(e) => setFinalizeForm((f) => ({ ...f, printingCharges: e.target.value }))} />
                    </FormField>
                  )}
                  {caps.delivery && (
                    <FormField label="Delivery Charges" htmlFor="fin-delivery">
                      <Input id="fin-delivery" type="number" min="0" placeholder="0"
                        value={finalizeForm.deliveryCharges}
                        onChange={(e) => setFinalizeForm((f) => ({ ...f, deliveryCharges: e.target.value }))} />
                    </FormField>
                  )}
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <span className="font-medium">Base (service cost):</span>{' '}
                  PKR {Number(finalizeTicket.serviceCost || 0).toLocaleString()}
                  {' + '}
                  <span className="font-medium">Phase-2 total:</span>{' '}
                  PKR {(
                    (caps.attestation ? (Number(finalizeForm.attestedCharges) || 0) + (Number(finalizeForm.nonAttestedCharges) || 0) : 0) +
                    (caps.printing ? (Number(finalizeForm.printingCharges) || 0) : 0) +
                    (caps.delivery ? (Number(finalizeForm.deliveryCharges) || 0) : 0)
                  ).toLocaleString()}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setFinalizeTicket(null); setFinalizeForm(EMPTY_FINALIZE); }}>Cancel</Button>
            <Button
              variant="ghost"
              onClick={() => {
                const t = finalizeTicket;
                setFinalizeTicket(null);
                setFinalizeForm(EMPTY_FINALIZE);
                if (t) { setSendBackTicket(t); setSendBackReason(''); }
              }}
              disabled={finalizing}
            >
              Send back to clerk
            </Button>
            <Button variant="primary" onClick={submitFinalize} disabled={finalizing}>
              {finalizing ? 'Completing…' : 'Approve & Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin: Bulk Assign Modal */}
      {bulkAssignOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setBulkAssignOpen(false)}
        >
          <PanelCard
            className="w-full max-w-lg"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <SectionHeader
              title="Assign selected tickets to clerk"
              description={`Assign ${
                Object.values(pendingSelected).filter(Boolean).length
              } selected ticket(s) to a representative.`}
            />
            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Representative</span>
                <select
                  className="mt-1 block w-full rounded-xl border-0 py-2.5 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm sm:leading-6"
                  value={bulkRepresentativeId}
                  onChange={(e) => setBulkRepresentativeId(e.target.value)}
                >
                  <option value="">Select Representative</option>
                  {bulkRepresentatives.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name} ({rep.city || '-'} / {rep.district || '-'})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bulkForceAssign}
                  onChange={(e) => setBulkForceAssign(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                />
                Override city restriction and assign anyway
              </label>
              {bulkAssignWarning && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {bulkAssignWarning}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={submitBulkAssign}
                  disabled={!bulkRepresentativeId}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 transition-colors disabled:opacity-50"
                >
                  Confirm Assignment
                </button>
                <button
                  onClick={() => setBulkAssignOpen(false)}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </PanelCard>
        </div>
      )}

      {message && (
        <div className={`mt-4 rounded-lg p-4 text-sm font-medium ${message.toLowerCase().includes('failed') || message.toLowerCase().includes('select') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {viewTicketId && (
        <TicketDetailPanel ticketId={viewTicketId} onClose={() => setViewTicketId(null)} isClerkView={isClerk} />
      )}
    </div>
  );
}
