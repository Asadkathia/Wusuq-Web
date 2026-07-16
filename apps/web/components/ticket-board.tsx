/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketStatus } from '@wusuq/shared';
import { chargeCapabilitiesFor, computeClerkEarnings, computeTicketTotal, computeWusuqMargin } from '@wusuq/shared';
import { TICKET_STATUSES } from '@wusuq/shared';
import { apiClient } from '@/lib/api-client';
import { relativeTime } from '@/lib/relative-time';
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
import { UserCircle, MapPin, Tag, RefreshCw, CheckSquare, Clock, History, FileOutput, Eye, PlayCircle, Upload, X, XCircle, Calendar, FileText, Download, Trash2, RotateCcw, Pencil, Coins } from 'lucide-react';
import { TicketDetailPanel } from './ticket-detail-panel';
import { flowKeyToSlug } from '@/lib/intake-flows';

type TicketBoardProps = {
  title: string;
  status: TicketStatus;
  // Restore/unarchive follow-up: when true, this board lists ONLY archived
  // tickets (server-side `archived=true` filter, staff-only) and swaps the
  // bulk/per-row "Delete" affordance for "Restore". `status` is still
  // required by the type but unused for the query in this mode — callers
  // pass a placeholder tab value (none of the per-tab action gates below key
  // off DELIVERED, so it renders nothing tab-specific).
  archived?: boolean;
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
  // Money inputs to computeTicketTotal — the API already selects these (findAll),
  // so the finalize-preview total is computed the same way the server persists it
  // (tax on the service base; discount/promo applied) rather than hand-rolled.
  additionalServiceCost?: number | string | null;
  discountPrice?: number | string | null;
  promoDiscount?: number | string | null;
  taxRate?: number | string | null;
  remainderFinalizedAt?: string | null;
  deliveryCharges?: number | string | null;
  printingCharges?: number | string | null;
  attestedCharges?: number | string | null;
  nonAttestedCharges?: number | string | null;
  additionalCharges?: number | string | null;
  intakeFlow?: string | null;
  createdBy?: string | null;
  clerkCost?: number | string | null;
  defaultClerkCost?: number | null;
  assignedRepresentative?: { id: string; name: string } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  statusSince?: string | null;
  scheduledDate?: string | null;
  nextDate?: string | null;
  hearingType?: string | null;
  payload?: Record<string, string> | null;
  case?: { caseNo: string | null; court: string | null; caseYear: number | null } | null;
  assignmentStatus?: 'ACTIVE' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED' | null;
  consumer: { id: string; name: string };
  service: { id: string; name: string; category: string; type: string };
};

type Representative = {
  id: string;
  name: string;
  city?: string | null;
  district?: string | null;
  court?: string | null;
  courtLevel?: string | null;
  // C3: present only when the candidates fetch carried a ticketId (server
  // derives the ticket's tier itself — never client-trusted) — true/false
  // per rep, absent entirely when the ticket has no derivable tier.
  tierMatch?: boolean;
};

type ClerkCostsForm = {
  deliveryCharges: string;
  printingCharges: string;
  // C11: attested/non-attested charges are pages × rate, mirroring printing.
  attestedPages: string;
  attestedCostPerPage: string;
  nonAttestedPages: string;
  nonAttestedCostPerPage: string;
  additionalCharges: string;
  noOfPages: string;
  costPerPage: string;
};

const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'] as const;

// Compact money label, e.g. "Rs 3,500".
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;

// Admin "Edit cost" — a direct charge override (PATCH /finance/:id/charge, no
// pricing re-resolve). Distinct from "Edit ticket" (which re-prices from case
// fields). Labels mirror the manage-cost board + the C9 taxed/untaxed hints.
const COST_EDIT_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: 'serviceCost', label: 'Service Cost' },
  { key: 'additionalServiceCost', label: 'Additional Service Cost', hint: 'Added to the taxable service base.' },
  { key: 'additionalCharges', label: 'Additional Cost', hint: 'Separate line; not taxed.' },
  { key: 'deliveryCharges', label: 'Delivery' },
  { key: 'printingCharges', label: 'Printing' },
  { key: 'attestedCharges', label: 'Attested' },
  { key: 'nonAttestedCharges', label: 'Non-Attested' },
  { key: 'discountPrice', label: 'Discount' },
];

// "{N}{d|h}" since the ticket entered its current status; stale past 7 days.
function statusAge(iso?: string | null): { label: string; stale: boolean } | null {
  if (!iso) return null;
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const days = Math.floor(diff / 86_400_000);
  const label = days >= 1 ? `${days}d` : `${Math.floor(diff / 3_600_000)}h`;
  return { label, stale: days > 7 };
}
const EMPTY_CLERK_COSTS: ClerkCostsForm = {
  deliveryCharges: '',
  printingCharges: '',
  attestedPages: '',
  attestedCostPerPage: '',
  nonAttestedPages: '',
  nonAttestedCostPerPage: '',
  additionalCharges: '',
  noOfPages: '',
  costPerPage: '',
};

export function TicketBoard({ title, status, archived = false }: TicketBoardProps) {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  // Explicit success/error flag for the status banner — replaces the old
  // brittle substring heuristic (Bug #10). Every handler sets it via flash().
  const [messageError, setMessageError] = useState(false);
  const flash = useCallback((text: string, error = false) => {
    setMessage(text);
    setMessageError(error);
  }, []);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkAction, setBulkAction] = useState('complete');

  const [dateRange, setDateRange] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');

  const [viewTicketId, setViewTicketId] = useState<string | null>(null);
  // B12: id of a ticket currently being archived via the per-row delete
  // action, so we can disable/label just that row's button while in flight.
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);

  const [assignTicket, setAssignTicket] = useState<TicketRow | null>(null);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [representativeId, setRepresentativeId] = useState('');
  const [clerkCost, setClerkCost] = useState('');
  const [overrideClerkCost, setOverrideClerkCost] = useState(false);
  const [forceAssign, setForceAssign] = useState(false);
  const [assignWarning, setAssignWarning] = useState('');
  // C3: separate from the city-override toggle above — reveals reps whose
  // courtLevel doesn't match the ticket's derived tier.
  const [showOtherTierReps, setShowOtherTierReps] = useState(false);

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
  // Plan B: `POST /invoices` requires `finance.write`, which only super-admin
  // holds — so "Generate invoice" must be gated on the exact role, not the
  // broader `isAdmin` (any non-clerk/non-consumer staff member) below.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
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
      if (u.role === 'super-admin') {
        setIsSuperAdmin(true);
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

  // C18: clerk bulk-accept for ASSIGNED tickets. Reuses the generic `selected`
  // map (unused by clerks otherwise — that state only drives admin bulk
  // actions on non-pending status boards).
  const [acceptAllBusy, setAcceptAllBusy] = useState(false);

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
  // C12: TCS courier receipt + tracking# captured in the same clerk-costs
  // dialog (reuses the ticket-documents upload path — see submitClerkCosts).
  const [costsProofFile, setCostsProofFile] = useState<File | null>(null);
  const [costsTrackingNo, setCostsTrackingNo] = useState('');
  const [submittingCosts, setSubmittingCosts] = useState(false);
  const [rejectTicket, setRejectTicket] = useState<TicketRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [sendBackTicket, setSendBackTicket] = useState<TicketRow | null>(null);
  const [sendBackReason, setSendBackReason] = useState('');

  // Admin: Finalize remainder (phase-2 charges)
  // B11: printing/attested/non-attested are editable page counts (pages ×
  // rate), mirroring the clerk cost-entry dialog — NOT lump charges.
  type FinalizeForm = {
    noOfPages: string;
    costPerPage: string;
    attestedPages: string;
    attestedCostPerPage: string;
    nonAttestedPages: string;
    nonAttestedCostPerPage: string;
    deliveryCharges: string;
    additionalCharges: string;
  };
  const EMPTY_FINALIZE: FinalizeForm = {
    noOfPages: '',
    costPerPage: '',
    attestedPages: '',
    attestedCostPerPage: '',
    nonAttestedPages: '',
    nonAttestedCostPerPage: '',
    deliveryCharges: '',
    additionalCharges: '',
  };
  const [costEditTicket, setCostEditTicket] = useState<TicketRow | null>(null);
  const [costEditForm, setCostEditForm] = useState<Record<string, string>>({});
  const [costEditSaving, setCostEditSaving] = useState(false);
  const [finalizeTicket, setFinalizeTicket] = useState<TicketRow | null>(null);
  const [finalizeForm, setFinalizeForm] = useState<FinalizeForm>(EMPTY_FINALIZE);
  // Full ticket detail (pages breakdown, clerk report, documents, receipt) —
  // fetched on open since the list row doesn't carry these (Task 4.1).
  const [finalizeDetail, setFinalizeDetail] = useState<any>(null);
  const [finalizing, setFinalizing] = useState(false);

  /** Internal-only: total payout to the clerk given the current (computed)
   *  phase-2 charges. Delegates to the shared single-source formula (adds the
   *  PDF clerk cut when the ticket purchased a PDF). */
  const computeFinalizeClerkEarnings = (
    t: TicketRow,
    charges: {
      attestedCharges: number;
      nonAttestedCharges: number;
      printingCharges: number;
      deliveryCharges: number;
    },
    wantPdf: boolean,
  ): number =>
    computeClerkEarnings({
      clerkCost: t.clerkCost,
      defaultClerkCost: t.defaultClerkCost,
      attestedCharges: charges.attestedCharges,
      nonAttestedCharges: charges.nonAttestedCharges,
      printingCharges: charges.printingCharges,
      deliveryCharges: charges.deliveryCharges,
      wantPdf,
    });

  const openFinalizeModal = async (ticket: TicketRow) => {
    setFinalizeTicket(ticket);
    setFinalizeDetail(null);
    setFinalizeForm({
      ...EMPTY_FINALIZE,
      deliveryCharges: ticket.deliveryCharges ? String(ticket.deliveryCharges) : '',
      additionalCharges: ticket.additionalCharges ? String(ticket.additionalCharges) : '',
    });
    try {
      const detail = await apiClient.get<any>(`/tickets/${ticket.id}`);
      setFinalizeDetail(detail);
      // Prefer the freshly-loaded clerk-entered page breakdown for the
      // editable fields — the admin starts from what the clerk submitted.
      setFinalizeForm((f) => ({
        noOfPages: detail.noOfPages ? String(detail.noOfPages) : f.noOfPages,
        costPerPage: detail.costPerPage ? String(detail.costPerPage) : f.costPerPage,
        attestedPages: detail.attestedPages ? String(detail.attestedPages) : f.attestedPages,
        attestedCostPerPage: detail.attestedCostPerPage ? String(detail.attestedCostPerPage) : f.attestedCostPerPage,
        nonAttestedPages: detail.nonAttestedPages ? String(detail.nonAttestedPages) : f.nonAttestedPages,
        nonAttestedCostPerPage: detail.nonAttestedCostPerPage ? String(detail.nonAttestedCostPerPage) : f.nonAttestedCostPerPage,
        deliveryCharges: detail.deliveryCharges ? String(detail.deliveryCharges) : f.deliveryCharges,
        additionalCharges: detail.additionalCharges ? String(detail.additionalCharges) : f.additionalCharges,
      }));
    } catch {
      // Non-fatal: the dialog still works with the list-row values.
    }
  };

  // Download the clerk receipt (staff-scoped endpoint) and open it.
  const viewClerkReceipt = async (ticketId: string) => {
    try {
      const { blob } = await apiClient.getBlob(`/tickets/${ticketId}/clerk-receipt/download`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: any) {
      flash(error.message || 'Failed to open clerk receipt', true);
    }
  };

  // Download an uploaded ticket document and open it.
  const viewTicketDocument = async (ticketId: string, docId: string, name?: string) => {
    try {
      const { blob, filename } = await apiClient.getBlob(`/tickets/${ticketId}/documents/${docId}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || name || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      flash(error.message || 'Failed to download document', true);
    }
  };

  // Admin "Review & Complete": one step — verify the clerk receipt, finalize
  // any phase-2 charges, and complete the ticket (digital flows auto-deliver).
  const submitFinalize = async () => {
    if (!finalizeTicket) return;
    setFinalizing(true);
    try {
      // B11: send the editable page counts — the backend recomputes
      // attested/non-attested/printing charges as pages × rate. Send a pair
      // ONLY when both fields are filled; a blank pair OMITS the keys so the
      // server keeps the persisted clerk-entered charge (an explicit 0 would
      // win the ?? chain and zero it — critical because finalize is one-shot
      // and irreversible, so a failed prefill must never silently zero charges).
      const pagePair = (pagesStr: string, rateStr: string, pagesKey: string, rateKey: string) => {
        const pages = pagesStr.trim() === '' ? undefined : Number(pagesStr);
        const rate = rateStr.trim() === '' ? undefined : Number(rateStr);
        return pages !== undefined && rate !== undefined
          ? { [pagesKey]: pages, [rateKey]: rate }
          : {};
      };
      const payload = {
        deliveryCharges: Number(finalizeForm.deliveryCharges) || 0,
        additionalCharges: Number(finalizeForm.additionalCharges) || 0,
        ...pagePair(finalizeForm.noOfPages, finalizeForm.costPerPage, 'noOfPages', 'costPerPage'),
        ...pagePair(finalizeForm.attestedPages, finalizeForm.attestedCostPerPage, 'attestedPages', 'attestedCostPerPage'),
        ...pagePair(finalizeForm.nonAttestedPages, finalizeForm.nonAttestedCostPerPage, 'nonAttestedPages', 'nonAttestedCostPerPage'),
      };
      await paymentsClient.reviewAndComplete(finalizeTicket.id, payload);
      flash(`Ticket ${finalizeTicket.batchNo} reviewed & completed.`);
      setFinalizeTicket(null);
      setFinalizeForm(EMPTY_FINALIZE);
      setFinalizeDetail(null);
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Review & complete failed', true);
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
      flash(`Ticket ${ticket.batchNo} marked delivered.`);
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Failed to mark delivered', true);
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
    { label: 'Non-Attested Pages', key: 'nonAttestedPages' },
    { label: 'Non-Attested Cost Per Page', key: 'nonAttestedCostPerPage' },
    { label: 'Attested Pages', key: 'attestedPages' },
    { label: 'Attested Cost Per Page', key: 'attestedCostPerPage' },
  ];

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, checked]) => checked).map(([id]) => id),
    [selected],
  );

  // C3: tier-scoped Assign dialog grouping. `tierMatch` is present on every
  // candidate only when the ticket had a derivable court tier server-side —
  // when absent (e.g. non-judicial flows with no court type), fall back to
  // the flat list with no split/toggle.
  const hasRepTierInfo = useMemo(
    () => representatives.some((rep) => rep.tierMatch !== undefined),
    [representatives],
  );
  const matchingTierReps = useMemo(
    () => (hasRepTierInfo ? representatives.filter((rep) => rep.tierMatch === true) : representatives),
    [representatives, hasRepTierInfo],
  );
  const otherTierReps = useMemo(
    () => (hasRepTierInfo ? representatives.filter((rep) => rep.tierMatch !== true) : []),
    [representatives, hasRepTierInfo],
  );
  const repOptionLabel = (rep: Representative) => {
    const location = `${rep.city || '-'} / ${rep.district || '-'}`;
    const court = rep.court || (rep.courtLevel ? `${rep.courtLevel} court` : '');
    return court ? `${rep.name} (${location} — ${court})` : `${rep.name} (${location})`;
  };

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: '200' });
      // Archived view lists across all statuses — the server-side `archived`
      // filter (staff-only) replaces the per-tab status filter entirely.
      if (archived) {
        q.set('archived', 'true');
      } else {
        q.set('status', status);
      }
      if (dateRange !== 'all') q.set('dateRange', dateRange);
      if (serviceFilter !== 'all') q.set('serviceCategory', serviceFilter);
      if (isClerk && currentUserId) q.set('representativeId', currentUserId);
      if (isConsumer && currentUserId) q.set('consumerId', currentUserId);

      const result = await apiClient.get<any>(`/tickets?${q.toString()}`);
      setTickets(result.items ?? []);
    } catch (error: any) {
      flash(error.message || 'Failed to load tickets', true);
    } finally {
      setLoading(false);
    }
  }, [status, archived, dateRange, serviceFilter, isClerk, isConsumer, currentUserId, flash]);

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
      flash(`Ticket ${ticket.batchNo} status set to ${newStatus}`);
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Status override failed', true);
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
      // C11: pages/rate aren't on the list row (same gap as noOfPages/costPerPage
      // below) — left blank on open, re-entered per submission.
      attestedPages: '',
      attestedCostPerPage: '',
      nonAttestedPages: '',
      nonAttestedCostPerPage: '',
      additionalCharges: ticket.additionalCharges ? String(ticket.additionalCharges) : '',
      noOfPages: '',
      costPerPage: '',
    });
    setCostsProofFile(null);
    setCostsTrackingNo(ticket.trackingNo || '');
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
    if (selectedIds.length === 0) return flash('Select at least one ticket', true);
    // Confirm every bulk action — 'delete' soft-archives (irreversible from the
    // app). Critical on the Unpaid/Paid tabs where the same checkbox also feeds
    // "Assign selected to clerk": naming the action + count stops an accidental
    // Apply from archiving tickets the admin only meant to route (review G1/G2).
    const verb = bulkAction === 'delete' ? 'Archive' : 'Complete';
    if (!window.confirm(`${verb} ${selectedIds.length} selected ticket(s)?${bulkAction === 'delete' ? " They're removed from lists, dues, and settlement — this can't be undone from the app." : ''}`)) {
      return;
    }
    try {
      await apiClient.post('/tickets/bulk-actions', { action: bulkAction, ticketIds: selectedIds });
      flash('Bulk action applied');
      setSelected({});
      setPendingSelected({});
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Bulk action failed', true);
    }
  };

  // Restore/unarchive follow-up: bulk-restores the current selection on the
  // Archived view, reusing the same bulk-actions endpoint with action:'restore'.
  const runRestoreSelected = async () => {
    if (selectedIds.length === 0) return flash('Select at least one ticket', true);
    if (!window.confirm(`Restore ${selectedIds.length} selected ticket(s)? They re-enter the active workflow.`)) {
      return;
    }
    try {
      await apiClient.post('/tickets/bulk-actions', { action: 'restore', ticketIds: selectedIds });
      flash('Selected tickets restored');
      setSelected({});
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Restore failed', true);
    }
  };

  // Plan B: bundle the selected tickets into one multi-ticket invoice.
  // `POST /invoices` is `finance.write` (super-admin only) — every other
  // caller 403s, so the control itself is gated on isSuperAdmin above.
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const runGenerateInvoice = async () => {
    if (generatingInvoice) return;
    if (selectedIds.length === 0) return flash('Select at least one ticket', true);
    if (!window.confirm(`Generate one invoice covering ${selectedIds.length} selected ticket(s)?`)) {
      return;
    }
    setGeneratingInvoice(true);
    try {
      const invoice = await apiClient.post<{ id: string; invoiceNo: string }>('/invoices', {
        ticketIds: selectedIds,
      });
      flash(`Invoice ${invoice.invoiceNo} generated`);
      setSelected({});
      setPendingSelected({});
      loadTickets();
    } catch (error: any) {
      // Surface the server's guard message verbatim — these are written for
      // humans ("Ticket 035210 is already on another invoice.", "All tickets
      // on an invoice must belong to one consumer.").
      flash(error.message || 'Invoice generation failed', true);
    } finally {
      setGeneratingInvoice(false);
    }
  };

  // Task 3.3: by default the dropdown is scoped to reps who serve the ticket's
  // city (the server applies the same match `assign` enforces). Ticking
  // "Override city restriction" widens it to the full pool.
  // C3: always passes ticketId so the server can derive the ticket's court
  // tier itself (never client-trusted) and tag each candidate with
  // `tierMatch`. Auto-selects the sole matching-tier rep when there's
  // exactly one.
  const loadAssignReps = async (ticket: TicketRow, widen: boolean) => {
    try {
      const params = new URLSearchParams({ ticketId: ticket.id });
      if (!widen && ticket.serviceCity) params.set('city', ticket.serviceCity);
      const reps = await apiClient.get<Representative[]>(`/tickets/representatives?${params.toString()}`);
      setRepresentatives(reps);
      const cityScoped = !widen && Boolean(ticket.serviceCity);
      setAssignWarning(
        reps.length
          ? ''
          : cityScoped
            ? `No representative serves ${ticket.serviceCity}. Tick "Override city restriction" to assign one from another city.`
            : 'No active representatives found. Add a representative user first.',
      );
      const matchingTier = reps.filter((rep) => rep.tierMatch === true);
      if (matchingTier.length === 1 && matchingTier[0]) {
        setRepresentativeId(matchingTier[0].id);
      }
    } catch (error: any) {
      setRepresentatives([]);
      setAssignWarning(error?.message || 'Failed to load representatives.');
    }
  };

  const openAssign = async (ticket: TicketRow) => {
    setAssignTicket(ticket);
    setRepresentativeId('');
    setClerkCost(ticket.defaultClerkCost != null ? String(ticket.defaultClerkCost) : '');
    setOverrideClerkCost(false);
    setForceAssign(false);
    setShowOtherTierReps(false);
    setAssignWarning('');
    await loadAssignReps(ticket, false);
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
      flash('Ticket assigned');
      loadTickets();
    } catch (error: any) {
      const msg = error?.message || 'Assignment failed';
      setAssignWarning(msg);
      flash(msg, true);
    }
  };

  const openTimeline = async (ticketId: string) => {
    try {
      const result = await apiClient.get<any>(`/tickets/${ticketId}/timeline`);
      setTimeline(result);
      setTimelineTicketId(ticketId);
    } catch (error: any) {
      flash(error.message || 'Failed to load timeline', true);
    }
  };

  // B3: Navigate to the pre-filled intake wizard instead of calling the old
  // POST /tickets/:id/regenerate endpoint. The old endpoint is left intact
  // for back-compat but is no longer called from the UI.
  const regenerateTicket = (ticketId: string, intakeFlow: string | null | undefined) => {
    if (!intakeFlow) {
      flash('Cannot regenerate: ticket has no intake flow recorded', true);
      return;
    }
    const slug = flowKeyToSlug(intakeFlow);
    if (!slug) {
      flash('Cannot regenerate: unknown service flow', true);
      return;
    }
    // Derive the URL segment from the flow key prefix.
    const category = intakeFlow.startsWith('judicial_') ? 'judicial' : 'non-judicial';
    router.push(
      `/paralegal-services/${category}/${slug}?regenerateFromTicketId=${encodeURIComponent(ticketId)}`,
    );
  };

  // Open the pre-filled intake wizard in EDIT mode (re-prices in place via
  // PATCH /tickets/:id/reprice). Same route the detail panel's "Edit ticket"
  // uses — surfaced on the list row so admins don't have to open View Details.
  const editTicket = (ticketId: string, intakeFlow: string | null | undefined) => {
    if (!intakeFlow) {
      flash('Cannot edit: ticket has no intake flow recorded', true);
      return;
    }
    const slug = flowKeyToSlug(intakeFlow);
    if (!slug) {
      flash('Cannot edit: unknown service flow', true);
      return;
    }
    const category = intakeFlow.startsWith('judicial_') ? 'judicial' : 'non-judicial';
    router.push(
      `/paralegal-services/${category}/${slug}?editTicketId=${encodeURIComponent(ticketId)}`,
    );
  };

  // Open the direct cost-override editor for a ticket (charge columns → PATCH
  // /finance/:id/charge). Prefills from the row's own charge fields.
  const openCostEdit = (t: TicketRow) => {
    setCostEditForm({
      serviceCost: String(Number(t.serviceCost ?? 0)),
      additionalServiceCost: String(Number(t.additionalServiceCost ?? 0)),
      additionalCharges: String(Number(t.additionalCharges ?? 0)),
      deliveryCharges: String(Number(t.deliveryCharges ?? 0)),
      printingCharges: String(Number(t.printingCharges ?? 0)),
      attestedCharges: String(Number(t.attestedCharges ?? 0)),
      nonAttestedCharges: String(Number(t.nonAttestedCharges ?? 0)),
      discountPrice: String(Number(t.discountPrice ?? 0)),
    });
    setCostEditTicket(t);
  };

  const saveCostEdit = async () => {
    if (!costEditTicket || costEditSaving) return;
    setCostEditSaving(true);
    try {
      await apiClient.patch(`/finance/${costEditTicket.id}/charge`, {
        serviceCost: Number(costEditForm.serviceCost) || 0,
        additionalServiceCost: Number(costEditForm.additionalServiceCost) || 0,
        additionalCharges: Number(costEditForm.additionalCharges) || 0,
        deliveryCharges: Number(costEditForm.deliveryCharges) || 0,
        printingCharges: Number(costEditForm.printingCharges) || 0,
        attestedCharges: Number(costEditForm.attestedCharges) || 0,
        nonAttestedCharges: Number(costEditForm.nonAttestedCharges) || 0,
        discountPrice: Number(costEditForm.discountPrice) || 0,
      });
      flash('Ticket cost updated');
      setCostEditTicket(null);
      loadTickets();
    } catch (e: any) {
      flash(e.message || 'Cost update failed', true);
    } finally {
      setCostEditSaving(false);
    }
  };

  // Clerk: accept assigned ticket → IN_PROGRESS. Uses the dedicated
  // accept-assignment endpoint (tickets.clerk + assignee-bound) — clerks no
  // longer hold tickets.write, so the generic status PATCH would 403.
  const acceptTicket = async (ticket: TicketRow) => {
    if (!confirm(`Accept ticket ${ticket.batchNo}? This will move it to In Progress.`)) return;
    try {
      await apiClient.post(`/tickets/${ticket.id}/accept-assignment`, {});
      flash(`Ticket ${ticket.batchNo} accepted and moved to In Progress.`);
      loadTickets();
    } catch (error: any) {
      const msg: string = error?.message || '';
      // Benign race (Bug #10): the ticket already left ASSIGNED. Refresh the
      // list instead of showing a red error.
      if (/only assigned tickets can be accepted/i.test(msg)) {
        flash(`Ticket ${ticket.batchNo} was already accepted — refreshed.`);
        loadTickets();
      } else {
        flash(msg || 'Failed to accept ticket', true);
      }
    }
  };

  // C18: clerk bulk-accept — accept every selected ASSIGNED ticket in
  // parallel via Promise.allSettled so one failure (e.g. a benign race where
  // it was already accepted elsewhere) doesn't block the rest.
  const runAcceptAll = async () => {
    if (acceptAllBusy || selectedIds.length === 0) return;
    setAcceptAllBusy(true);
    try {
      const results = await Promise.allSettled(
        selectedIds.map((id) => apiClient.post(`/tickets/${id}/accept-assignment`, {})),
      );
      const accepted = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - accepted;
      flash(
        failed > 0
          ? `${accepted} accepted, ${failed} failed.`
          : `${accepted} ticket(s) accepted and moved to In Progress.`,
        failed > 0 && accepted === 0,
      );
      setSelected({});
      loadTickets();
    } finally {
      setAcceptAllBusy(false);
    }
  };

  const submitClerkReceipt = async () => {
    if (!receiptTicket || !receiptFile) return flash('Select a receipt image to upload', true);
    setSubmittingReceipt(true);
    try {
      const formData = new FormData();
      formData.append('file', receiptFile);
      await apiClient.post(`/tickets/${receiptTicket.id}/clerk-receipt`, formData);
      flash('Submitted to admin for approval');
      setReceiptTicket(null);
      setReceiptFile(null);
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Receipt submission failed', true);
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
      flash(`Ticket ${dispatchTicket.batchNo} marked dispatched.`);
      setDispatchTicket(null);
      setDispatchFile(null);
      setDispatchTracking('');
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Dispatch failed', true);
    } finally {
      setDispatching(false);
    }
  };

  const submitClerkCosts = async () => {
    if (!costsTicket || submittingCosts) return;
    setSubmittingCosts(true);
    try {
      // Send a pages+rate pair ONLY when the clerk actually filled both — a
      // blank field must OMIT the key so the server's `?? persisted` fallback
      // keeps the existing charge instead of an explicit 0 zeroing it (a 0 wins
      // the ?? chain). Don't send a computed printingCharges lump either — the
      // server derives it from noOfPages×costPerPage.
      const pagePair = (pagesStr: string, rateStr: string, pagesKey: string, rateKey: string) => {
        const pages = pagesStr.trim() === '' ? undefined : Number(pagesStr);
        const rate = rateStr.trim() === '' ? undefined : Number(rateStr);
        return pages !== undefined && rate !== undefined
          ? { [pagesKey]: pages, [rateKey]: rate }
          : {};
      };

      // C12: upload the TCS courier receipt first (if attached) — same
      // upload path the "Upload Work Documents" step uses (the dispatch
      // endpoint itself can't be reused here: it requires status COMPLETED,
      // which the ticket hasn't reached yet at this point in the lifecycle).
      // Abort the whole submit on upload failure so costs and the receipt
      // never desync.
      let dispatchProofUrl: string | undefined;
      if (costsProofFile) {
        try {
          const formData = new FormData();
          formData.append('file', costsProofFile);
          formData.append('category', 'WORK_DOCUMENT');
          formData.append('visibleToConsumer', 'false');
          const doc = await apiClient.post<{ fileUrl?: string }>(
            `/tickets/${costsTicket.id}/documents/upload`,
            formData,
          );
          dispatchProofUrl = doc.fileUrl;
        } catch (uploadErr: any) {
          flash(uploadErr.message || 'Receipt upload failed — costs not submitted', true);
          return;
        }
      }

      await apiClient.post(`/tickets/${costsTicket.id}/clerk-costs`, {
        deliveryCharges: Number(clerkCosts.deliveryCharges) || 0,
        additionalCharges: Number(clerkCosts.additionalCharges) || 0,
        ...pagePair(clerkCosts.noOfPages, clerkCosts.costPerPage, 'noOfPages', 'costPerPage'),
        ...pagePair(clerkCosts.attestedPages, clerkCosts.attestedCostPerPage, 'attestedPages', 'attestedCostPerPage'),
        ...pagePair(clerkCosts.nonAttestedPages, clerkCosts.nonAttestedCostPerPage, 'nonAttestedPages', 'nonAttestedCostPerPage'),
        ...(dispatchProofUrl ? { dispatchProofUrl } : {}),
        ...(costsTrackingNo.trim() ? { trackingNo: costsTrackingNo.trim() } : {}),
      });
      flash('Costs submitted — ticket moved to Waiting Approval');
      setCostsTicket(null);
      setClerkCosts(EMPTY_CLERK_COSTS);
      setCostsProofFile(null);
      setCostsTrackingNo('');
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Failed to submit costs', true);
    } finally {
      setSubmittingCosts(false);
    }
  };

  const rejectAssignment = async () => {
    if (!rejectTicket) return;
    try {
      await apiClient.post(`/tickets/${rejectTicket.id}/reject-assignment`, {
        reason: rejectReason,
      });
      flash(`Ticket ${rejectTicket.batchNo} rejected and returned to pending.`);
      setRejectTicket(null);
      setRejectReason('');
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Failed to reject assignment', true);
    }
  };

  const sendBackToClerk = async () => {
    if (!sendBackTicket) return;
    try {
      await paymentsClient.sendBackToClerk(
        sendBackTicket.id,
        sendBackReason || undefined,
      );
      flash(`Ticket ${sendBackTicket.batchNo} sent back to clerk.`);
      setSendBackTicket(null);
      setSendBackReason('');
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Failed to send ticket back', true);
    }
  };

  // Clerk: two-zone multi-file document upload for an IN_PROGRESS ticket
  const submitUpload = async () => {
    if (!uploadTicket) return;
    const allFiles: Array<{ file: File; category: 'WORK_DOCUMENT' | 'DELIVERABLE_PDF' }> = [
      ...workFiles.map((f) => ({ file: f, category: 'WORK_DOCUMENT' as const })),
      ...deliverableFiles.map((f) => ({ file: f, category: 'DELIVERABLE_PDF' as const })),
    ];
    if (allFiles.length === 0) return flash('Select at least one file to upload', true);
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
      flash(`${uploadedCount} file(s) uploaded. Add payments to continue.`);
      setUploadTicket(null);
      setWorkFiles([]);
      setDeliverableFiles([]);
      openCostsModal(currentTicket);
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Upload failed', true);
    } finally {
      setUploading(false);
    }
  };

  // Admin: open bulk-assign dialog for selected unpaid/paid tickets
  const openBulkAssign = async () => {
    const ids = (status === 'UNPAID' || status === 'PAID')
      ? Object.entries(pendingSelected).filter(([, v]) => v).map(([id]) => id)
      : selectedIds;
    if (ids.length === 0) return flash('Select at least one ticket to bulk-assign', true);
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
      flash(`Assigned ${result.assigned.length} ticket(s).${skippedMsg}`);
      setBulkAssignOpen(false);
      setPendingSelected({});
      setSelected({});
      loadTickets();
    } catch (error: any) {
      setBulkAssignWarning(error?.message || 'Bulk assignment failed');
      flash(error?.message || 'Bulk assignment failed', true);
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
      flash('Next hearing date recorded.');
      setNextHearingEnabled(false);
      setNextHearingDate('');
      setNextHearingType('');
      loadTickets();
      return true;
    } catch (error: any) {
      flash(error.message || 'Failed to record next hearing', true);
      return false;
    }
  };

  // Admin: generate a new follow-up ticket from a completed ticket's next-hearing date
  const generateNextHearing = async (ticket: TicketRow) => {
    if (!confirm(`Generate a follow-up hearing ticket from ${ticket.batchNo}?`)) return;
    try {
      const result = await paymentsClient.generateNextHearing(ticket.id);
      flash(`Follow-up ticket generated: ${result.batchNo}`);
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Failed to generate next-hearing ticket', true);
    }
  };

  // B12: admin-only per-row archive (soft-delete), reusing the same
  // bulk-actions endpoint the toolbar "Delete Tickets" option calls with a
  // single-element ticketIds array.
  const deleteTicket = async (ticket: TicketRow) => {
    if (!confirm("Archive this ticket? It's removed from lists, dues, and settlement. This can't be undone from the app.")) return;
    setDeletingTicketId(ticket.id);
    try {
      await apiClient.post('/tickets/bulk-actions', { action: 'delete', ticketIds: [ticket.id] });
      flash(`Ticket ${ticket.batchNo} archived.`);
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Failed to archive ticket', true);
    } finally {
      setDeletingTicketId(null);
    }
  };

  // Restore/unarchive follow-up: per-row restore on the Archived view, mirroring
  // deleteTicket's shape but flipped (action:'restore', clears archivedAt).
  const restoreTicket = async (ticket: TicketRow) => {
    if (!confirm(`Restore ticket ${ticket.batchNo}? It re-enters the active workflow.`)) return;
    setDeletingTicketId(ticket.id);
    try {
      await apiClient.post('/tickets/bulk-actions', { action: 'restore', ticketIds: [ticket.id] });
      flash(`Ticket ${ticket.batchNo} restored.`);
      loadTickets();
    } catch (error: any) {
      flash(error.message || 'Failed to restore ticket', true);
    } finally {
      setDeletingTicketId(null);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title={title}
        description={archived ? 'Archived tickets — restore them back into the active workflow.' : `Manage ${status.toLowerCase()} tickets and assignments.`}
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
                {isAdmin && archived && (
                  <>
                    <span className="hidden sm:block h-6 w-px bg-slate-200 mx-1" aria-hidden="true"></span>
                    <button
                      type="button"
                      onClick={runRestoreSelected}
                      disabled={selectedIds.length === 0}
                      className="w-full sm:w-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                    >
                      Restore selected
                    </button>
                  </>
                )}
                {isAdmin && !archived && (
                  <>
                    <span className="hidden sm:block h-6 w-px bg-slate-200 mx-1" aria-hidden="true"></span>
                    {(status === 'UNPAID' || status === 'PAID') && (
                      <button
                        type="button"
                        onClick={openBulkAssign}
                        disabled={Object.values(pendingSelected).filter(Boolean).length === 0}
                        className="w-full sm:w-auto rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors"
                      >
                        Assign selected to clerk
                      </button>
                    )}
                    {/* B12: bulk Complete/Delete now available on every tab
                        (not just non-Unpaid/Paid) — Unpaid/Paid show both
                        the Assign button above AND this select+Apply. */}
                    <select
                      className="w-full sm:w-auto rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                      value={bulkAction}
                      onChange={(e) => setBulkAction(e.target.value)}
                    >
                      <option value="complete">Complete Tickets</option>
                      <option value="delete">Delete Tickets</option>
                    </select>
                    <button
                      type="button"
                      onClick={runBulkAction}
                      disabled={selectedIds.length === 0}
                      className="w-full sm:w-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                      Apply
                    </button>
                    {/* Plan B: POST /invoices is finance.write — super-admin
                        only. Every other staff role 403s, so this is gated on
                        the exact role rather than the broader isAdmin. */}
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={runGenerateInvoice}
                        disabled={selectedIds.length === 0 || generatingInvoice}
                        className="w-full sm:w-auto rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 disabled:opacity-50 transition-colors"
                      >
                        {generatingInvoice ? 'Generating…' : 'Generate invoice'}
                      </button>
                    )}
                  </>
                )}
                {isClerk && status === 'ASSIGNED' && selectedIds.length > 0 && (
                  <>
                    <span className="hidden sm:block h-6 w-px bg-slate-200 mx-1" aria-hidden="true"></span>
                    <button
                      type="button"
                      onClick={runAcceptAll}
                      disabled={acceptAllBusy}
                      className="w-full sm:w-auto rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors"
                    >
                      {acceptAllBusy ? 'Accepting…' : `Accept all (${selectedIds.length})`}
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
                      checked={
                        filteredTickets.length > 0 &&
                        (status === 'UNPAID' || status === 'PAID'
                          ? filteredTickets.every((t) => pendingSelected[t.id])
                          : selectedIds.length === filteredTickets.length)
                      }
                      onChange={(e) => {
                        if (status === 'UNPAID' || status === 'PAID') {
                          // B12: Unpaid/Paid checkboxes drive BOTH the
                          // Assign-to-clerk selection (pendingSelected) and
                          // the generic bulk Complete/Delete selection
                          // (selected) — kept in lockstep so `selectedIds`
                          // (derived from `selected`) is populated on these
                          // tabs too.
                          const next: Record<string, boolean> = {};
                          filteredTickets.forEach((t) => { next[t.id] = e.target.checked; });
                          setPendingSelected(next);
                          setSelected(next);
                        } else {
                          toggleAll(e.target.checked);
                        }
                      }}
                    />
                    <span>Batch No</span>
                  </div>
                ) : isClerk && status === 'ASSIGNED' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label="Select all assigned tickets"
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
              {isClerk && (
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Case &amp; Schedule</th>
              )}
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
                            // B12: keep pendingSelected + selected in sync (see header checkbox comment above).
                            setPendingSelected((s) => ({ ...s, [ticket.id]: e.target.checked }));
                            setSelected((s) => ({ ...s, [ticket.id]: e.target.checked }));
                          } else {
                            setSelected((s) => ({ ...s, [ticket.id]: e.target.checked }));
                          }
                        }}
                      />
                    ) : isClerk && status === 'ASSIGNED' ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ticket ${ticket.batchNo}`}
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600 mt-0.5"
                        checked={Boolean(selected[ticket.id])}
                        onChange={(e) => setSelected((s) => ({ ...s, [ticket.id]: e.target.checked }))}
                      />
                    ) : null}
                    <div>
                      <div className="text-sm font-medium text-slate-900">{ticket.batchNo}</div>
                      {ticket.updatedAt && (
                        <div className="text-xs text-slate-400" title={new Date(ticket.updatedAt).toLocaleString()}>
                          updated {relativeTime(ticket.updatedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                     <UserCircle className="h-4 w-4 text-slate-400" />
                     <span className="text-sm text-slate-700">{ticket.consumer.name}</span>
                  </div>
                  {ticket.assignedRepresentative && (
                    <div className="mt-0.5 text-xs text-slate-500 pl-6">
                      → {ticket.assignedRepresentative.name}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-slate-900">{ticket.service.name}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ticket.serviceCity || 'Anywhere'}</span>
                    <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {ticket.caseType || 'Standard'}</span>
                  </div>
                  {(() => {
                    const total = Number(ticket.totalAmount ?? 0);
                    const paid = Number(ticket.amountPaid ?? 0);
                    const due = Math.max(0, total - paid);
                    const age = statusAge(ticket.statusSince ?? ticket.createdAt ?? null);
                    return (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        {/* Consumer money is never shown to clerks (audit 1.1). */}
                        {!isClerk && (
                          <span className="text-slate-500">
                            {total <= 0 ? 'Free' : due > 0 ? `${rs(total)} · ${rs(due)} due` : 'Paid in full'}
                          </span>
                        )}
                        {age && (
                          <span className={age.stale ? 'text-amber-600 font-medium' : 'text-slate-400'}>
                            · {age.label} in {ticket.status.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </td>
                {isClerk && (
                  <td className="px-6 py-4">
                    {/* Case number */}
                    {ticket.case?.caseNo && (
                      <div className="flex items-center gap-1 text-sm text-slate-700 font-medium">
                        <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{ticket.case.caseNo}{ticket.case.caseYear ? ` / ${ticket.case.caseYear}` : ''}</span>
                      </div>
                    )}
                    {/* Next hearing date — prefer nextDate over scheduledDate */}
                    {(ticket.nextDate || ticket.scheduledDate) && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>
                          {new Date(ticket.nextDate ?? ticket.scheduledDate!).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {ticket.hearingType ? ` · ${ticket.hearingType}` : ''}
                        </span>
                      </div>
                    )}
                    {/* Assignment acceptance */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {ticket.assignmentStatus && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          ticket.assignmentStatus === 'ACCEPTED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : ticket.assignmentStatus === 'ACTIVE'
                            ? 'bg-blue-50 text-blue-700'
                            : ticket.assignmentStatus === 'REJECTED'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {ticket.assignmentStatus === 'ACCEPTED' ? 'Accepted' : ticket.assignmentStatus === 'ACTIVE' ? 'Active' : ticket.assignmentStatus === 'REJECTED' ? 'Rejected' : ticket.assignmentStatus}
                        </span>
                      )}
                      {/* Clerk-approval sub-state */}
                      {ticket.clerkApprovalStatus && ticket.clerkApprovalStatus !== 'PENDING' && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          ticket.clerkApprovalStatus === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : ticket.clerkApprovalStatus === 'SUBMITTED'
                            ? 'bg-amber-50 text-amber-700'
                            : ticket.clerkApprovalStatus === 'REJECTED'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {ticket.clerkApprovalStatus === 'VERIFIED' ? 'Receipt ✓' : ticket.clerkApprovalStatus === 'SUBMITTED' ? 'Receipt ↑' : ticket.clerkApprovalStatus === 'REJECTED' ? 'Receipt ✗' : ticket.clerkApprovalStatus}
                        </span>
                      )}
                      {/* Delivery sub-state */}
                      {ticket.deliveryStatus && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          ticket.deliveryStatus === 'DISPATCHED'
                            ? 'bg-teal-50 text-teal-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {ticket.deliveryStatus === 'DISPATCHED' ? 'Dispatched' : 'Pending delivery'}
                        </span>
                      )}
                    </div>
                  </td>
                )}
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
                        {(status === 'IN_PROGRESS' || status === 'WAITING_APPROVAL') && (
                          <button onClick={() => setUploadTicket(ticket)} className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md flex items-center gap-1">
                            <Upload className="h-3.5 w-3.5" /> Upload Work Documents
                          </button>
                        )}
                        {status === 'IN_PROGRESS' && (
                          <>
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
                              onClick={() => { setDispatchTicket(ticket); setDispatchFile(null); setDispatchTracking(ticket.trackingNo || ''); }}
                              className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md flex items-center gap-1"
                            >
                              <Upload className="h-3.5 w-3.5" /> Mark Dispatched
                            </button>
                          )}
                      </>
                    ) : (
                      <>
                        {/* Pay-at-end (Task 3.1): a ticket may be assigned
                            directly from UNPAID — the payment gate is at
                            DELIVERED, not at assign. None of these
                            status-gated actions apply on the Archived view
                            (the tab's `status` prop is a fixed placeholder
                            there), guarded below with !archived for clarity. */}
                        {!archived && (status === 'PAID' || status === 'UNPAID') && (
                          <button onClick={() => openAssign(ticket)} className="text-primary-600 hover:text-primary-900 bg-primary-50 px-3 py-1.5 rounded-md flex items-center gap-1">
                            <CheckSquare className="h-3.5 w-3.5" /> Assign
                          </button>
                        )}
                        {!archived && status === 'WAITING_APPROVAL' && (
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
                        {!archived && status === 'COMPLETED' &&
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
                        {!archived && status === 'COMPLETED' && ticket.scheduledDate && (
                          <button
                            onClick={() => generateNextHearing(ticket)}
                            className="text-teal-600 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-md flex items-center gap-1"
                            title="Generate follow-up hearing ticket"
                          >
                            <Clock className="h-3.5 w-3.5" /> Next Hearing
                          </button>
                        )}
                        {/* Edit ticket (re-price in place) — admin only, mirrors
                            the detail-panel gating (hidden on DELIVERED + archived),
                            now surfaced on the row so it's reachable without opening
                            View Details. */}
                        {isAdmin && !archived && ticket.status !== 'DELIVERED' && (
                          <button onClick={() => editTicket(ticket.id, ticket.intakeFlow)} className="text-slate-600 hover:text-primary-600 bg-slate-100 hover:bg-primary-50 px-3 py-1.5 rounded-md flex items-center gap-1" title="Edit ticket details">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Edit cost — direct charge override (finance.updateCharge),
                            admin-only. Separate from "Edit ticket details" above. */}
                        {isAdmin && !archived && (
                          <button onClick={() => openCostEdit(ticket)} className="text-slate-600 hover:text-emerald-700 bg-slate-100 hover:bg-emerald-50 px-3 py-1.5 rounded-md flex items-center gap-1" title="Edit ticket cost">
                            <Coins className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!archived && (
                          <button onClick={() => regenerateTicket(ticket.id, ticket.intakeFlow)} className="text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-3 py-1.5 rounded-md flex items-center gap-1" title="Regenerate Ticket">
                            <FileOutput className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* B12: admin-only per-row archive (soft-delete).
                            Restore/unarchive follow-up: the Archived view
                            swaps this for a Restore action instead. */}
                        {isAdmin && archived && (
                          <button
                            onClick={() => restoreTicket(ticket)}
                            disabled={deletingTicketId === ticket.id}
                            className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-md flex items-center gap-1 disabled:opacity-50"
                            title="Restore ticket"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> {deletingTicketId === ticket.id ? 'Restoring…' : 'Restore'}
                          </button>
                        )}
                        {isAdmin && !archived && (
                          <button
                            onClick={() => deleteTicket(ticket)}
                            disabled={deletingTicketId === ticket.id}
                            className="text-rose-600 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-md flex items-center gap-1 disabled:opacity-50"
                            title="Archive ticket"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> {deletingTicketId === ticket.id ? 'Archiving…' : 'Delete'}
                          </button>
                        )}
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
          <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 ring-1 ring-inset ring-border-soft">
            <span className="text-sm font-medium text-slate-700">Ticket amount</span>
            <span className="text-sm font-semibold text-slate-900">{rs(Number(assignTicket.totalAmount ?? 0))}</span>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Representative</span>
              <select
                className="mt-1 block w-full rounded-xl border-0 py-2.5 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm sm:leading-6"
                value={representativeId}
                onChange={(e) => setRepresentativeId(e.target.value)}
              >
                <option value="">Select Representative</option>
                {hasRepTierInfo ? (
                  <>
                    {matchingTierReps.length > 0 && (
                      <optgroup label="Matching court tier">
                        {matchingTierReps.map((rep) => (
                          <option key={rep.id} value={rep.id}>
                            {repOptionLabel(rep)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {showOtherTierReps && otherTierReps.length > 0 && (
                      <optgroup label="Other reps">
                        {otherTierReps.map((rep) => (
                          <option key={rep.id} value={rep.id}>
                            {repOptionLabel(rep)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                ) : (
                  representatives.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {repOptionLabel(rep)}
                    </option>
                  ))
                )}
              </select>
              {hasRepTierInfo && otherTierReps.length > 0 && (
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showOtherTierReps}
                    onChange={(e) => setShowOtherTierReps(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                  />
                  Show others ({otherTierReps.length} not matching this ticket&apos;s court tier)
                </label>
              )}
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
              onChange={(e) => {
                const widen = e.target.checked;
                setForceAssign(widen);
                // Reveal the full pool (or re-scope to the city) immediately.
                setRepresentativeId('');
                if (assignTicket) void loadAssignReps(assignTicket, widen);
              }}
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

      {/* Admin "Edit cost" — direct charge override (finance.updateCharge). */}
      <Dialog open={Boolean(costEditTicket)} onOpenChange={(open) => { if (!open) setCostEditTicket(null); }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit ticket cost{costEditTicket ? ` — ${costEditTicket.batchNo}` : ''}</DialogTitle>
            <DialogDescription>
              Directly override this ticket&apos;s charges. This does NOT re-resolve pricing from the case
              (use &quot;Edit ticket details&quot; for that) — the Total recomputes from these values + tax.
            </DialogDescription>
          </DialogHeader>
          {costEditTicket && (() => {
            const num = (k: string) => Number(costEditForm[k]) || 0;
            const preview = computeTicketTotal({
              charges: {
                serviceCost: num('serviceCost'),
                additionalServiceCost: num('additionalServiceCost'),
                deliveryCharges: num('deliveryCharges'),
                printingCharges: num('printingCharges'),
                attestedCharges: num('attestedCharges'),
                nonAttestedCharges: num('nonAttestedCharges'),
                additionalCharges: num('additionalCharges'),
              },
              discountPrice: num('discountPrice'),
              promoDiscount: Number(costEditTicket.promoDiscount ?? 0),
              taxRate: Number(costEditTicket.taxRate ?? 0),
            });
            return (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  {COST_EDIT_FIELDS.map(({ key, label, hint }) => (
                    <FormField key={key} label={label} htmlFor={`cost-${key}`}>
                      <Input
                        id={`cost-${key}`}
                        type="number"
                        min="0"
                        value={costEditForm[key] ?? ''}
                        onChange={(e) => setCostEditForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
                    </FormField>
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
                  <span className="text-slate-600">New total {Number(costEditTicket.taxRate ?? 0) > 0 ? '(incl. tax)' : ''}</span>
                  <span className="font-semibold text-slate-900">{rs(preview.totalAmount)}</span>
                </div>
                {Number(costEditTicket.amountPaid ?? 0) > 0 && (
                  <p className="text-xs text-amber-700">
                    Already paid {rs(Number(costEditTicket.amountPaid))} — the new total can&apos;t be set below that.
                  </p>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCostEditTicket(null)}>Cancel</Button>
            <Button variant="brand" onClick={saveCostEdit} loading={costEditSaving}>Save cost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(costsTicket)} onOpenChange={(open) => {
        if (!open) {
          setCostsTicket(null);
          setNextHearingEnabled(false);
          setNextHearingDate('');
          setNextHearingType('');
          setCostsProofFile(null);
          setCostsTrackingNo('');
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
              if (
                key === 'attestedPages' ||
                key === 'attestedCostPerPage' ||
                key === 'nonAttestedPages' ||
                key === 'nonAttestedCostPerPage'
              ) return caps.attestation;
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
                    {caps.attestation && (
                      <>
                        <FormField label="Attested charges" hint="Computed automatically">
                          <div className="flex h-11 items-center rounded-xl border border-border-soft bg-surface-muted px-4 text-sm">
                            <span className="flex-1 font-semibold tabular-nums text-slate-900">
                              PKR {((Number(clerkCosts.attestedPages) || 0) * (Number(clerkCosts.attestedCostPerPage) || 0)).toLocaleString()}
                            </span>
                            <span className="text-xs text-slate-500">
                              {clerkCosts.attestedPages || '0'} × {clerkCosts.attestedCostPerPage || '0'}
                            </span>
                          </div>
                        </FormField>
                        <FormField label="Non-attested charges" hint="Computed automatically">
                          <div className="flex h-11 items-center rounded-xl border border-border-soft bg-surface-muted px-4 text-sm">
                            <span className="flex-1 font-semibold tabular-nums text-slate-900">
                              PKR {((Number(clerkCosts.nonAttestedPages) || 0) * (Number(clerkCosts.nonAttestedCostPerPage) || 0)).toLocaleString()}
                            </span>
                            <span className="text-xs text-slate-500">
                              {clerkCosts.nonAttestedPages || '0'} × {clerkCosts.nonAttestedCostPerPage || '0'}
                            </span>
                          </div>
                        </FormField>
                      </>
                    )}
                  </div>
                )}

                {/* C12: TCS courier receipt + tracking# — physical-delivery flows only. */}
                {caps.delivery && (
                  <div className="rounded-xl border border-border-soft p-4 space-y-3">
                    <p className="text-sm font-medium text-slate-700">Courier receipt <span className="font-normal text-slate-400">(optional)</span></p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Tracking number" htmlFor="cc-tracking">
                        <Input
                          id="cc-tracking"
                          type="text"
                          placeholder="e.g. TCS-123456789"
                          value={costsTrackingNo}
                          onChange={(e) => setCostsTrackingNo(e.target.value)}
                        />
                      </FormField>
                      <FormField label="Receipt file" htmlFor="cc-proof">
                        <input
                          id="cc-proof"
                          type="file"
                          accept=".jpg,.jpeg,.png,.pdf"
                          className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f && f.size > 10 * 1024 * 1024) {
                              flash('Receipt must be under 10 MB', true);
                              e.target.value = '';
                              return;
                            }
                            setCostsProofFile(f ?? null);
                          }}
                        />
                      </FormField>
                    </div>
                    <p className="text-xs text-slate-500">Allowed: JPG, PNG, PDF — max 10 MB</p>
                    {costsProofFile && (
                      <p className="text-xs text-slate-500">Selected: <span className="font-medium text-slate-800">{costsProofFile.name}</span></p>
                    )}
                    {!costsProofFile && costsTicket.dispatchProofUrl && (
                      <p className="text-xs text-slate-500">A receipt is already on file — leave blank to keep it.</p>
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
            <Button
              variant="ghost"
              onClick={() => {
                setCostsTicket(null);
                setNextHearingEnabled(false);
                setNextHearingDate('');
                setNextHearingType('');
                setCostsProofFile(null);
                setCostsTrackingNo('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={submittingCosts}
              onClick={async () => {
                if (costsTicket && nextHearingEnabled && nextHearingDate) {
                  const hearingSaved = await submitNextHearing(costsTicket.id);
                  if (!hearingSaved) return;
                }
                submitClerkCosts();
              }}
            >
              {submittingCosts ? 'Submitting…' : 'Submit costs'}
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
            {/* C12: the clerk-costs dialog may already have captured a TCS
                receipt (dispatchProofUrl) — don't force a re-upload here. */}
            {!dispatchFile && dispatchTicket.dispatchProofUrl && (
              <p className="text-xs text-slate-500">A courier receipt is already on file — leave blank to keep it, or attach a new one to replace it.</p>
            )}
            <div className="flex gap-3">
              <button onClick={submitDispatch} disabled={dispatching || (!dispatchFile && !dispatchTracking.trim() && !dispatchTicket.dispatchProofUrl)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors">
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
      <Dialog open={Boolean(finalizeTicket)} onOpenChange={(open) => { if (!open) { setFinalizeTicket(null); setFinalizeForm(EMPTY_FINALIZE); setFinalizeDetail(null); } }}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Review &amp; Complete{finalizeTicket ? ` — ${finalizeTicket.batchNo}` : ''}</DialogTitle>
            <DialogDescription>Verify the clerk&rsquo;s submission, finalize any phase-2 charges, and complete the ticket. Digital services are delivered automatically once fully paid.</DialogDescription>
          </DialogHeader>
          {finalizeTicket && (() => {
            const caps = chargeCapabilitiesFor(finalizeTicket.intakeFlow);
            const hasAnyCap = caps.attestation || caps.printing || caps.delivery || caps.pdf;
            // PDF purchased → the clerk earns their PDF cut (shared formula).
            const wantPdf =
              (((finalizeDetail?.formPayload ?? finalizeTicket.payload) ?? {}) as Record<string, unknown>)
                .want_pdf_before_dispatch === 'Yes';
            // What the clerk originally SUBMITTED (persisted; doesn't change as the
            // admin edits the inputs) — shown beside each field so the admin can
            // compare submitted vs final.
            const clerkSubmitted = (
              field: 'attestedCharges' | 'nonAttestedCharges' | 'printingCharges' | 'deliveryCharges' | 'additionalCharges',
            ): number =>
              Number(((finalizeDetail?.[field] ?? (finalizeTicket as Record<string, unknown>)[field]) as unknown) ?? 0);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-100">
                  <CheckSquare className="h-4 w-4 shrink-0" />
                  {finalizeTicket.clerkReceiptUrl ? (
                    <span>
                      Clerk receipt submitted.{' '}
                      <button
                        type="button"
                        onClick={() => viewClerkReceipt(finalizeTicket.id)}
                        className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                      >
                        View receipt
                      </button>
                    </span>
                  ) : (
                    'No clerk receipt on file.'
                  )}
                  {!hasAnyCap ? ' No phase-2 charges for this service.' : ''}
                </div>

                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Final charges (admin) — editable page counts, compare against the clerk&rsquo;s submitted totals
                </p>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {caps.attestation && (
                    <>
                      <FormField label="Attested Pages" htmlFor="fin-attested-pages">
                        <Input id="fin-attested-pages" type="number" min="0" placeholder="0"
                          value={finalizeForm.attestedPages}
                          onChange={(e) => setFinalizeForm((f) => ({ ...f, attestedPages: e.target.value }))} />
                      </FormField>
                      <FormField label="Attested Cost Per Page" htmlFor="fin-attested-rate">
                        <Input id="fin-attested-rate" type="number" min="0" placeholder="0"
                          value={finalizeForm.attestedCostPerPage}
                          onChange={(e) => setFinalizeForm((f) => ({ ...f, attestedCostPerPage: e.target.value }))} />
                      </FormField>
                      <FormField label="Attested charges" hint="Computed automatically">
                        <div className="flex h-11 items-center rounded-xl border border-border-soft bg-surface-muted px-4 text-sm">
                          <span className="flex-1 font-semibold tabular-nums text-slate-900">
                            PKR {((Number(finalizeForm.attestedPages) || 0) * (Number(finalizeForm.attestedCostPerPage) || 0)).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Clerk submitted: PKR {clerkSubmitted('attestedCharges').toLocaleString()}</p>
                      </FormField>
                      <FormField label="Non-Attested Pages" htmlFor="fin-non-attested-pages">
                        <Input id="fin-non-attested-pages" type="number" min="0" placeholder="0"
                          value={finalizeForm.nonAttestedPages}
                          onChange={(e) => setFinalizeForm((f) => ({ ...f, nonAttestedPages: e.target.value }))} />
                      </FormField>
                      <FormField label="Non-Attested Cost Per Page" htmlFor="fin-non-attested-rate">
                        <Input id="fin-non-attested-rate" type="number" min="0" placeholder="0"
                          value={finalizeForm.nonAttestedCostPerPage}
                          onChange={(e) => setFinalizeForm((f) => ({ ...f, nonAttestedCostPerPage: e.target.value }))} />
                      </FormField>
                      <FormField label="Non-attested charges" hint="Computed automatically">
                        <div className="flex h-11 items-center rounded-xl border border-border-soft bg-surface-muted px-4 text-sm">
                          <span className="flex-1 font-semibold tabular-nums text-slate-900">
                            PKR {((Number(finalizeForm.nonAttestedPages) || 0) * (Number(finalizeForm.nonAttestedCostPerPage) || 0)).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Clerk submitted: PKR {clerkSubmitted('nonAttestedCharges').toLocaleString()}</p>
                      </FormField>
                    </>
                  )}
                  {caps.printing && (
                    <>
                      <FormField label="No. of Pages" htmlFor="fin-pages">
                        <Input id="fin-pages" type="number" min="0" placeholder="0"
                          value={finalizeForm.noOfPages}
                          onChange={(e) => setFinalizeForm((f) => ({ ...f, noOfPages: e.target.value }))} />
                      </FormField>
                      <FormField label="Cost Per Page" htmlFor="fin-rate">
                        <Input id="fin-rate" type="number" min="0" placeholder="0"
                          value={finalizeForm.costPerPage}
                          onChange={(e) => setFinalizeForm((f) => ({ ...f, costPerPage: e.target.value }))} />
                      </FormField>
                      <FormField label="Printing charges" hint="Computed automatically">
                        <div className="flex h-11 items-center rounded-xl border border-border-soft bg-surface-muted px-4 text-sm">
                          <span className="flex-1 font-semibold tabular-nums text-slate-900">
                            PKR {((Number(finalizeForm.noOfPages) || 0) * (Number(finalizeForm.costPerPage) || 0)).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Clerk submitted: PKR {clerkSubmitted('printingCharges').toLocaleString()}</p>
                      </FormField>
                    </>
                  )}
                  {caps.delivery && (
                    <FormField label="Delivery Charges" htmlFor="fin-delivery">
                      <Input id="fin-delivery" type="number" min="0" placeholder="0"
                        value={finalizeForm.deliveryCharges}
                        onChange={(e) => setFinalizeForm((f) => ({ ...f, deliveryCharges: e.target.value }))} />
                      <p className="mt-1 text-xs text-slate-400">Clerk submitted: PKR {clerkSubmitted('deliveryCharges').toLocaleString()}</p>
                    </FormField>
                  )}
                  {/* Additional Cost — admin-editable, viewable; persisted on finalize. Untaxed (separate line). */}
                  <FormField label="Additional Cost" htmlFor="fin-additional">
                    <Input id="fin-additional" type="number" min="0" placeholder="0"
                      value={finalizeForm.additionalCharges}
                      onChange={(e) => setFinalizeForm((f) => ({ ...f, additionalCharges: e.target.value }))} />
                    <p className="mt-1 text-xs text-slate-400">Separate line; not taxed.</p>
                    <p className="mt-0.5 text-xs text-slate-400">Clerk submitted: PKR {clerkSubmitted('additionalCharges').toLocaleString()}</p>
                  </FormField>
                </div>
                {/* Base + phase-2 total, and the internal earnings/margin summary — share one
                    total so the "Wusuq earnings" row below is derived from the same figure
                    shown in this breakdown (Task 4 / C15). */}
                {(() => {
                  // B11: charges are derived from the editable page counts —
                  // pages × rate, same precedence the backend applies.
                  const attestedComputed = (Number(finalizeForm.attestedPages) || 0) * (Number(finalizeForm.attestedCostPerPage) || 0);
                  const nonAttestedComputed = (Number(finalizeForm.nonAttestedPages) || 0) * (Number(finalizeForm.nonAttestedCostPerPage) || 0);
                  const printingComputed = (Number(finalizeForm.noOfPages) || 0) * (Number(finalizeForm.costPerPage) || 0);
                  const phase2Total =
                    (caps.attestation ? attestedComputed + nonAttestedComputed : 0) +
                    (caps.printing ? printingComputed : 0) +
                    (caps.delivery ? (Number(finalizeForm.deliveryCharges) || 0) : 0) +
                    (Number(finalizeForm.additionalCharges) || 0);
                  const baseAmount = Number(finalizeTicket.serviceCost || 0);
                  // Compute the finalize total via the single source (computeTicketTotal),
                  // NOT base + phase2 — that hand-rolled sum omits tax (on the service
                  // base) + discount/promo and would misstate the margin (money-model
                  // invariant). Mirrors what finalizeRemainderCore persists on approval.
                  const { totalAmount: finalizeTotal } = computeTicketTotal({
                    charges: {
                      serviceCost: baseAmount,
                      additionalServiceCost: Number(finalizeTicket.additionalServiceCost || 0),
                      deliveryCharges: caps.delivery ? Number(finalizeForm.deliveryCharges) || 0 : 0,
                      printingCharges: caps.printing ? printingComputed : 0,
                      attestedCharges: caps.attestation ? attestedComputed : 0,
                      nonAttestedCharges: caps.attestation ? nonAttestedComputed : 0,
                      additionalCharges: Number(finalizeForm.additionalCharges) || 0,
                    },
                    discountPrice: Number(finalizeTicket.discountPrice || 0),
                    promoDiscount: Number(finalizeTicket.promoDiscount || 0),
                    taxRate: Number(finalizeTicket.taxRate || 0),
                  });
                  const repName = finalizeTicket.assignedRepresentative?.name;
                  const earnings = computeFinalizeClerkEarnings(
                    finalizeTicket,
                    {
                      attestedCharges: attestedComputed,
                      nonAttestedCharges: nonAttestedComputed,
                      printingCharges: printingComputed,
                      deliveryCharges: Number(finalizeForm.deliveryCharges) || 0,
                    },
                    wantPdf,
                  );
                  const wusuqEarnings = computeWusuqMargin(finalizeTotal, earnings);
                  return (
                    <>
                      <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <span className="font-medium">Base (service cost):</span>{' '}
                        PKR {baseAmount.toLocaleString()}
                        {' + '}
                        <span className="font-medium">Phase-2 total:</span>{' '}
                        PKR {phase2Total.toLocaleString()}
                      </div>
                      {/* Clerk earnings summary — internal only, never shown to consumers */}
                      <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-amber-800">
                            {repName ? `${repName}'s earnings` : 'Clerk earnings'}
                          </span>
                          <span className="font-semibold text-amber-900">PKR {earnings.toLocaleString()}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-amber-700">
                          Clerk cost{repName ? ` · ${repName}` : ''} + phase-2 charges (internal only)
                        </p>
                      </div>
                      {/* Wusuq earnings (margin) — internal only, never shown to consumers */}
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-indigo-800">Wusuq earnings</span>
                          <span className="font-semibold text-indigo-900">PKR {wusuqEarnings.toLocaleString()}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-indigo-700">Total minus clerk earnings (internal only)</p>
                      </div>
                    </>
                  );
                })()}

                {/* Clerk availability report — what the clerk reported. */}
                {finalizeDetail?.clerkReport && (
                  <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Clerk report</p>
                    <div className="grid grid-cols-2 gap-2 text-slate-700">
                      <div>Attested available: <span className="font-medium">{finalizeDetail.clerkReport.attestedAvailable ? 'Yes' : 'No'}</span></div>
                      <div>Non-attested available: <span className="font-medium">{finalizeDetail.clerkReport.nonAttestedAvailable ? 'Yes' : 'No'}</span></div>
                      <div>Both: <span className="font-medium">{finalizeDetail.clerkReport.bothAvailable ? 'Yes' : 'No'}</span></div>
                      <div>Partial completion: <span className="font-medium">{finalizeDetail.clerkReport.partialCompletion ? 'Yes' : 'No'}</span></div>
                      {finalizeDetail.clerkReport.unavailableReason && (
                        <div className="col-span-2">Reason: <span className="font-medium whitespace-pre-wrap">{finalizeDetail.clerkReport.unavailableReason}</span></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Uploaded documents — clickable downloads. */}
                {Array.isArray(finalizeDetail?.documents) && finalizeDetail.documents.length > 0 && (
                  <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Uploaded documents ({finalizeDetail.documents.length})
                    </p>
                    <ul className="space-y-1.5">
                      {finalizeDetail.documents.map((doc: any) => (
                        <li key={doc.id} className="flex items-center justify-between gap-2">
                          <span className="truncate text-slate-700">{doc.name}</span>
                          <button
                            type="button"
                            onClick={() => viewTicketDocument(finalizeTicket.id, doc.id, doc.name)}
                            className="shrink-0 text-primary-600 hover:text-primary-800"
                            aria-label={`Download ${doc.name ?? 'document'}`}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
        <div className={`mt-4 rounded-lg p-4 text-sm font-medium ${messageError ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {viewTicketId && (
        <TicketDetailPanel
          ticketId={viewTicketId}
          onClose={() => setViewTicketId(null)}
          isClerkView={isClerk}
          onChange={loadTickets}
        />
      )}
    </div>
  );
}
