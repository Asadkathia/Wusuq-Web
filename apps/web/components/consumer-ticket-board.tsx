/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock,
  Download,
  FileText,
  Hash,
  Landmark,
  MapPin,
  RefreshCw,
  Scale,
  Search,
  Ticket as TicketIcon,
  Truck,
} from 'lucide-react';
import { FLOW_LABELS, isFlowKey, documentCategoryLabel, chargeCapabilitiesFor, orderCaseDetailKeys } from '@wusuq/shared';
import { parseDeliveryAddress } from '@/lib/intake-flows';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { IconButton } from '@/components/ui/icon-button';
import { useToast } from '@/components/ui/toast';
import { FutureTicketsStrip } from './consumer-ticket-board/future-tickets-strip';

type TicketStatus = 'UNPAID' | 'PAID' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_APPROVAL' | 'COMPLETED' | 'DELIVERED';

type TicketRow = {
  id: string;
  batchNo: string;
  serviceCity: string | null;
  caseType: string | null;
  status: TicketStatus;
  createdAt?: string;
  totalAmount?: number | string | null;
  amountPaid?: number | string | null;
  serviceCost?: number | string | null;
  createdBy?: string | null;
  remainderFinalizedAt?: string | null;
  consumer: { id: string; name: string };
  service: { id: string; name: string; category: string; type: string };
  payload?: Record<string, string> | null;
  intakeFlow?: string | null;
  scheduledDate?: string | null;
  deliveryStatus?: 'PENDING' | 'DISPATCHED' | null;
  trackingNo?: string | null;
};

// Lifecycle order for the compact progress strip on each card.
const LIFECYCLE: TicketStatus[] = [
  'UNPAID',
  'PAID',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_APPROVAL',
  'COMPLETED',
];

// First present value among the given payload keys (handles canonical + alias
// names, e.g. case_petition_no / case_no, case_year / year).
function payloadVal(
  payload: Record<string, string> | null | undefined,
  keys: string[],
): string | null {
  if (!payload) return null;
  for (const k of keys) {
    const v = payload[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusVariant(status: TicketStatus) {
  if (status === 'COMPLETED' || status === 'DELIVERED') return 'success' as const;
  if (status === 'UNPAID') return 'warning' as const;
  if (status === 'WAITING_APPROVAL') return 'brand' as const;
  if (status === 'PAID' || status === 'ASSIGNED' || status === 'IN_PROGRESS') return 'info' as const;
  return 'neutral' as const;
}

function statusLabel(status: TicketStatus) {
  switch (status) {
    case 'UNPAID': return 'Unpaid';
    case 'PAID': return 'Paid';
    case 'ASSIGNED': return 'Assigned';
    case 'IN_PROGRESS': return 'In progress';
    case 'WAITING_APPROVAL': return 'Being reviewed';
    case 'COMPLETED': return 'Completed';
    case 'DELIVERED': return 'Delivered';
    default: return status;
  }
}

function formatPKR(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(n);
}

function relativeTime(iso?: string) {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

type FilterTab = 'all' | 'active' | 'completed' | 'unpaid';

export function ConsumerTicketBoard() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const searchParams = useSearchParams();
  const initialTab: FilterTab =
    searchParams?.get('filter') === 'unpaid' ? 'unpaid' : 'all';
  const [tab, setTab] = useState<FilterTab>(initialTab);
  const [viewTicketId, setViewTicketId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { id?: string } | null;
      setCurrentUserId(user?.id ?? null);
    } catch {}
  }, []);

  const loadTickets = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: '200', consumerId: currentUserId });
      const result = await apiClient.get<{ items?: TicketRow[] }>(`/tickets?${q.toString()}`);
      setTickets(result.items ?? []);
    } catch (err: any) {
      toast.error('Unable to load tickets', err?.message);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, toast]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (tab === 'active' && (t.status === 'COMPLETED' || t.status === 'DELIVERED')) return false;
      if (tab === 'completed' && t.status !== 'COMPLETED' && t.status !== 'DELIVERED') return false;
      if (tab === 'unpaid' && t.status !== 'UNPAID') return false;
      if (!s) return true;
      return (
        t.batchNo.toLowerCase().includes(s) ||
        t.service.name.toLowerCase().includes(s) ||
        (t.caseType ?? '').toLowerCase().includes(s) ||
        (t.serviceCity ?? '').toLowerCase().includes(s)
      );
    });
  }, [tickets, search, tab]);

  const counts = useMemo(() => ({
    all: tickets.length,
    active: tickets.filter((t) => t.status !== 'COMPLETED' && t.status !== 'DELIVERED').length,
    completed: tickets.filter((t) => t.status === 'COMPLETED' || t.status === 'DELIVERED').length,
    unpaid: tickets.filter((t) => t.status === 'UNPAID').length,
  }), [tickets]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My tickets</h1>
          <p className="mt-1 text-sm text-slate-500">Track every request you&rsquo;ve submitted.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/consumer/paralegal-services/judicial">
            <Button variant="brand" size="md" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Start a new request
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="all">All <span className="ml-2 text-slate-400 tabular-nums">{counts.all}</span></TabsTrigger>
            <TabsTrigger value="active">Active <span className="ml-2 text-slate-400 tabular-nums">{counts.active}</span></TabsTrigger>
            <TabsTrigger value="completed">Completed <span className="ml-2 text-slate-400 tabular-nums">{counts.completed}</span></TabsTrigger>
            <TabsTrigger value="unpaid">Unpaid <span className="ml-2 text-slate-400 tabular-nums">{counts.unpaid}</span></TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Input
                placeholder="Search batch, service, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <IconButton
              variant="solid"
              icon={<RefreshCw className={['h-4 w-4', loading ? 'animate-spin' : ''].join(' ')} />}
              aria-label="Refresh"
              onClick={loadTickets}
              disabled={loading}
            />
          </div>
        </div>

        <TabsContent value={tab}>
          <TicketList loading={loading} tickets={filtered} onOpen={setViewTicketId} />
        </TabsContent>
      </Tabs>

      <ConsumerTicketDrawer
        ticketId={viewTicketId}
        onClose={() => setViewTicketId(null)}
      />
    </div>
  );
}

function TicketList({
  loading,
  tickets,
  onOpen,
}: {
  loading: boolean;
  tickets: TicketRow[];
  onOpen: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <PanelCard className="text-center py-16">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
          <TicketIcon className="h-6 w-6" />
        </div>
        <p className="text-base font-semibold text-slate-900">No tickets to show</p>
        <p className="mt-1 text-sm text-slate-500">Start your first paralegal request from the dashboard.</p>
        <Link href="/consumer/dashboard" className="mt-5 inline-flex">
          <Button variant="subtle" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
            Go to dashboard
          </Button>
        </Link>
      </PanelCard>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tickets.map((t) => {
        const payload = (t as { payload?: Record<string, string> | null }).payload ?? {};
        const futureDate = payload.future_date ?? '';
        // QA P6: the next-hearing CTA used to render only for COMPLETED
        // tickets ("Order Future Tickets"). Consumers also want a hint on
        // in-flight pending tickets so they can queue the next hearing's
        // service without waiting for the current ticket to close. Same
        // strip; the copy adapts to the workflow state inside the strip.
        const isPendingFlow =
          payload.case_status === 'Pending Case' &&
          futureDate !== '' &&
          (t.intakeFlow === 'judicial_case_files' || t.intakeFlow === 'judicial_case_information');
        const showStrip = isPendingFlow;
        return (
          <div key={t.id}>
            <TicketCard ticket={t} onOpen={() => onOpen(t.id)} />
            {showStrip && (
              <FutureTicketsStrip
                ticketId={t.id}
                flow={t.intakeFlow as 'judicial_case_files' | 'judicial_case_information'}
                nextHearingDate={futureDate}
                ticketStatus={t.status}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TicketCard({ ticket, onOpen }: { ticket: TicketRow; onOpen: () => void }) {
  const total = Number(ticket.totalAmount ?? 0);
  const paid = Number(ticket.amountPaid ?? 0);
  const base = Number(ticket.serviceCost ?? 0);
  const remaining = Math.max(0, total - paid);
  const isConsumerCreated = ticket.createdBy === 'CONSUMER';
  const isUnpaid = ticket.status === 'UNPAID';
  const isFullyPaid = paid >= total && total > 0;

  // Show base "Pay now" when: consumer-created, UNPAID status, base not yet covered
  const showPayNow =
    isConsumerCreated &&
    isUnpaid &&
    (base === 0 ? remaining > 0 : paid < base);

  // Show "Final payment due" when: remainder has been finalized but not yet fully paid
  const showFinalPayment =
    isConsumerCreated &&
    Boolean(ticket.remainderFinalizedAt) &&
    !isFullyPaid &&
    remaining > 0;

  // ── Detail surface (Feature: max ticket details on cards) ──────────────────
  const p = ticket.payload;
  const caseNo = payloadVal(p, ['case_petition_no', 'case_no', 'fir_no', 'doc_no']);
  const caseYear = payloadVal(p, ['case_year', 'year']);
  const caseTitle = payloadVal(p, ['case_title', 'title']);
  const courtName = payloadVal(p, ['select_court', 'select_court_type']);
  const flowLabel =
    ticket.intakeFlow && isFlowKey(ticket.intakeFlow) ? FLOW_LABELS[ticket.intakeFlow] : null;
  const cat = (ticket.service?.category ?? '').toLowerCase();
  const categoryLabel = cat ? (cat.includes('non') ? 'Non-Judicial' : 'Judicial') : null;
  const createdStr = formatDate(ticket.createdAt);
  const hearingStr = formatDate(ticket.scheduledDate);
  // Lifecycle position for the status-step strip (DELIVERED = fully complete).
  const lifePos =
    ticket.status === 'DELIVERED' ? LIFECYCLE.length : Math.max(0, LIFECYCLE.indexOf(ticket.status));
  const payPct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group text-left rounded-2xl bg-surface p-5 ring-1 ring-border-soft shadow-elev-1 transition-[transform,box-shadow] duration-200 ease-silk hover:-translate-y-0.5 hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500 shrink-0">
            <TicketIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{ticket.service.name}</p>
            <p className="truncate text-xs text-slate-500">
              {ticket.batchNo}
              {ticket.createdAt ? ` · ${relativeTime(ticket.createdAt)}` : ''}
            </p>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition-[transform,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </div>

      {/* Case identifiers */}
      {caseNo || caseTitle ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {caseNo ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-slate-600">
              <Hash className="h-3 w-3" />Case {caseNo}{caseYear ? `/${caseYear}` : ''}
            </span>
          ) : null}
          {caseTitle ? (
            <span className="inline-flex max-w-full items-center truncate rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {caseTitle}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Court · service · category */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        {ticket.serviceCity ? (
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{ticket.serviceCity}</span>
        ) : null}
        {courtName ? (
          <span className="inline-flex items-center gap-1"><Landmark className="h-3 w-3" />{courtName}</span>
        ) : null}
        {ticket.caseType ? (
          <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{ticket.caseType}</span>
        ) : null}
        {flowLabel ? (
          <span className="inline-flex items-center gap-1">
            <Scale className="h-3 w-3" />{flowLabel}{categoryLabel ? ` · ${categoryLabel}` : ''}
          </span>
        ) : null}
      </div>

      {/* Status-step lifecycle strip */}
      <div className="mt-4 flex items-center gap-1" aria-hidden>
        {LIFECYCLE.map((stage, i) => (
          <span
            key={stage}
            className={`h-1 flex-1 rounded-full ${
              i < lifePos ? 'bg-brand-500' : i === lifePos ? 'bg-brand-300' : 'bg-border-soft'
            }`}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <StatusPill dot label={statusLabel(ticket.status)} variant={statusVariant(ticket.status)} />
        {total > 0 ? (
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-slate-900">PKR {formatPKR(total)}</p>
            {remaining > 0 ? (
              <p className="text-[11px] tabular-nums text-amber-600">
                PKR {formatPKR(remaining)} due{paid > 0 ? ` · PKR ${formatPKR(paid)} paid` : ''}
              </p>
            ) : (
              <p className="text-[11px] text-emerald-600">Fully paid</p>
            )}
          </div>
        ) : null}
      </div>

      {/* Payment progress bar */}
      {total > 0 && remaining > 0 ? (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border-soft" aria-hidden>
          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${payPct}%` }} />
        </div>
      ) : null}

      {/* Out-for-delivery (physical files dispatched) */}
      {ticket.deliveryStatus === 'DISPATCHED' ? (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">
          <Truck className="h-3.5 w-3.5" />
          Out for delivery
          {ticket.trackingNo ? <span className="font-mono text-indigo-500">· {ticket.trackingNo}</span> : null}
        </div>
      ) : null}

      {/* Dates */}
      {createdStr || hearingStr ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
          {createdStr ? (
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />Created {createdStr}</span>
          ) : null}
          {hearingStr ? (
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Hearing {hearingStr}</span>
          ) : null}
        </div>
      ) : null}

      {showFinalPayment ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-rose-700">
            Final payment due — PKR {formatPKR(remaining)}
          </p>
          <Link
            href={`/consumer/tickets/${ticket.id}/pay`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 shrink-0"
          >
            Pay now
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : showPayNow ? (
        <div className="mt-3 flex justify-end">
          <Link
            href={`/consumer/tickets/${ticket.id}/pay`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            Pay now
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

// Consumer-scoped drawer (My Tickets list): wraps the shared ConsumerTicketDetail
// in drawer chrome. Consumer-safe — no clerk/admin internals.
function ConsumerTicketDrawer({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  return (
    <Drawer open={Boolean(ticketId)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Ticket details</DrawerTitle>
          <DrawerDescription className="sr-only">Your request details and payment status</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          {ticketId ? <ConsumerTicketDetail ticketId={ticketId} /> : null}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-28 shrink-0 text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className="flex-1 text-sm text-slate-800">{value}</dd>
    </div>
  );
}

function MiniStat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'amber' | 'emerald' }) {
  const toneClass: Record<typeof tone, string> = {
    slate: 'text-slate-900',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
  };
  return (
    <div className="rounded-xl bg-surface-muted px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={['mt-1 text-base font-semibold tabular-nums', toneClass[tone]].join(' ')}>{value}</p>
    </div>
  );
}

// ─── Consumer ticket detail helpers ─────────────────────────────────────────

/** Keys from formPayload that are handled in the separate Delivery section or
 *  are internal identifiers — excluded from the Case Details render. */
const CASE_DETAIL_SKIP_KEYS = new Set([
  'delivery_address',
  'delivery_mode',
  'delivery_method',
  'delivery_city_id',
  'delivery_province',
  'delivery_district',
  // Internal / idempotency
  'parent_ticket_id',
  'notes',
]);

/** Consumer-friendly labels for formPayload keys (supplements the generic
 *  underscore-to-space transform for well-known intake field names). */
const PAYLOAD_LABEL: Record<string, string> = {
  select_court_city: 'City',
  city: 'City',
  select_court: 'Court',
  select_court_type: 'Court type',
  select_service: 'Service type',
  case_type: 'Case type',
  case_type_other: 'Case type (other)',
  case_petition_no: 'Case no.',
  case_no: 'Case no.',
  case_year: 'Case year',
  year: 'Case year',
  case_title: 'Case title',
  judge_designation: 'Judge designation',
  judge_name: 'Judge',
  case_date: 'Case date',
  future_date: 'Next hearing',
  case_status: 'Case status',
  search_method: 'Search method',
  want_pdf_before_dispatch: 'PDF copy',
  cnic: 'CNIC',
  required_documentations: 'Document bundle',
};

function payloadLabel(key: string): string {
  return (
    PAYLOAD_LABEL[key] ??
    key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** True if the key is safe to display in the consumer case-details panel.
 *  Skips delivery-prefixed keys, ID-only fields, and internal markers. */
function isCaseDetailKey(key: string, value: unknown): boolean {
  if (CASE_DETAIL_SKIP_KEYS.has(key)) return false;
  // Any key prefixed with 'delivery_' is for the separate delivery section.
  if (key.startsWith('delivery_')) return false;
  // Internal numeric IDs are not useful to consumers.
  if (key.endsWith('_id')) return false;
  // Empty / null / binary refs
  if (value === null || value === undefined || String(value).trim() === '') return false;
  if (String(value).includes('upload')) return false;
  return true;
}

function statusLabelFull(status: string): string {
  const MAP: Record<string, string> = {
    UNPAID: 'Unpaid — awaiting payment',
    PAID: 'Payment received',
    ASSIGNED: 'Representative assigned',
    IN_PROGRESS: 'In progress',
    WAITING_APPROVAL: 'Under review',
    COMPLETED: 'Completed',
    DELIVERED: 'Delivered',
  };
  return MAP[status] ?? status;
}

// ─── End helpers ─────────────────────────────────────────────────────────────

// Consumer-safe ticket detail — the single rendering used by both the My
// Tickets drawer and the full-page route (/consumer/tickets/[id]). Shows ONLY
// consumer-visible info: service, location, charges (NO clerk cost / no admin
// internals), status guidance, downloadable final documents, and pay-now
// actions. The admin TicketDetailPanel must NOT be used for consumers — it
// exposes clerk cost, PII and status-override controls.
export function ConsumerTicketDetail({
  ticketId,
  showHeader = true,
}: {
  ticketId: string;
  showHeader?: boolean;
}) {
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticketId) return;
    startTransition(() => setLoading(true));
    apiClient
      .get<any>(`/tickets/${ticketId}`)
      .then((r) => setTicket(r))
      .catch(() => setTicket(null))
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (loading || !ticket) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  const charges: Array<[string, number]> = (
    [
      ['Service', Number(ticket.serviceCost || 0)],
      ['Delivery', Number(ticket.deliveryCharges || 0)],
      ['Printing', Number(ticket.printingCharges || 0)],
      ['Attested', Number(ticket.attestedCharges || 0)],
      ['Non-attested', Number(ticket.nonAttestedCharges || 0)],
      ['Additional', Number(ticket.additionalCharges || 0)],
    ] as Array<[string, number]>
  ).filter((row) => Number(row[1]) !== 0);

  const total = Number(ticket.totalAmount || 0);
  const paid = Number(ticket.amountPaid || 0);
  const base = Number(ticket.serviceCost || 0);
  const remaining = Math.max(0, total - paid);
  const discount = Number(ticket.discountPrice || 0);
  const isConsumerCreated = ticket.createdBy === 'CONSUMER';
  const isUnpaid = ticket.status === 'UNPAID';
  const isFullyPaid = paid >= total && total > 0;
  const showFinalPayment =
    isConsumerCreated && Boolean(ticket.remainderFinalizedAt) && !isFullyPaid && remaining > 0;
  const showPayNow =
    !showFinalPayment && isConsumerCreated && isUnpaid && (base === 0 ? remaining > 0 : paid < base);

  const nextSteps: Record<string, string> = {
    UNPAID: "Your request is awaiting payment. Complete your payment to proceed.",
    PAID: "Payment received. We're assigning a representative. You'll get a notification shortly.",
    ASSIGNED: "A representative has been assigned and will start work soon.",
    IN_PROGRESS: "Your request is being handled. We'll notify you once it moves forward.",
    WAITING_APPROVAL: "Your request is under final review. You'll be notified on completion.",
    COMPLETED: "All done — your documents are being prepared for delivery.",
    DELIVERED: "All done — you can download the final documents above.",
  };

  return (
    <div className="space-y-6">
      {showHeader ? (
        <header>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
              <TicketIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-900">{ticket.service?.name ?? 'Ticket'}</h2>
              <p className="text-xs text-slate-500">
                {ticket.batchNo ?? ' '}
                {ticket.createdAt ? ` · ${relativeTime(ticket.createdAt)}` : ''}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <StatusPill dot label={statusLabel(ticket.status)} variant={statusVariant(ticket.status)} />
          </div>
        </header>
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        <MiniStat label="Total" value={`PKR ${formatPKR(total)}`} />
        <MiniStat label={remaining > 0 ? 'Due' : 'Paid'} value={`PKR ${formatPKR(remaining > 0 ? remaining : paid)}`} tone={remaining > 0 ? 'amber' : 'emerald'} />
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Service details</h4>
        <dl className="mt-3 space-y-2 text-sm">
          {ticket.caseType ? <Row label="Case type" value={ticket.caseType} /> : null}
          {ticket.serviceCity ? <Row label="Location" value={ticket.serviceCity} /> : null}
          {ticket.service?.category ? <Row label="Category" value={ticket.service.category} /> : null}
        </dl>
      </section>

      {/* ── Section 2: Case details ─────────────────────────────────────── */}
      {ticket.formPayload && typeof ticket.formPayload === 'object' && (() => {
        const p = ticket.formPayload as Record<string, unknown>;
        const displayKeys = orderCaseDetailKeys(
          Object.keys(p).filter((k) => isCaseDetailKey(k, p[k]))
        );
        if (displayKeys.length === 0) return null;
        return (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Case details</h4>
            <div className="mt-3 divide-y divide-border-soft rounded-xl ring-1 ring-border-soft bg-surface">
              {displayKeys.map((k) => (
                <div key={k} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <span className="w-32 shrink-0 font-medium text-slate-500">{payloadLabel(k)}</span>
                  <span className="flex-1 text-slate-800">{String(p[k])}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* ── Section 3: Delivery address & method (physical flows only) ──── */}
      {chargeCapabilitiesFor(ticket.intakeFlow).delivery &&
        ticket.formPayload &&
        typeof ticket.formPayload === 'object' &&
        (() => {
          const p = ticket.formPayload as Record<string, unknown>;
          const deliveryMode = p.delivery_mode ? String(p.delivery_mode) : '';
          const deliveryMethod = p.delivery_method ? String(p.delivery_method) : '';
          const rawAddr = p.delivery_address;
          if (!deliveryMode && !deliveryMethod && !rawAddr) return null;
          const addr = rawAddr ? parseDeliveryAddress(rawAddr) : null;
          const addrParts = addr
            ? ([addr.house, addr.block, addr.mainArea, addr.city] as (string | undefined)[]).filter(
                (s): s is string => Boolean(s?.trim())
              )
            : [];
          return (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" /> Delivery
              </h4>
              <div className="mt-3 divide-y divide-border-soft rounded-xl ring-1 ring-border-soft bg-surface">
                {(deliveryMode || deliveryMethod) && (
                  <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <span className="w-32 shrink-0 font-medium text-slate-500">Method</span>
                    <span className="flex-1 text-slate-800">
                      {[deliveryMode, deliveryMethod].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                )}
                {addrParts.length > 0 && (
                  <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <span className="w-32 shrink-0 font-medium text-slate-500">Address</span>
                    <span className="flex-1 text-slate-800">{addrParts.join(', ')}</span>
                  </div>
                )}
                {ticket.trackingNo && (
                  <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <span className="w-32 shrink-0 font-medium text-slate-500">Tracking no.</span>
                    <span className="flex-1 font-mono text-slate-800">{ticket.trackingNo}</span>
                  </div>
                )}
                {ticket.deliveryStatus && (
                  <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <span className="w-32 shrink-0 font-medium text-slate-500">Dispatch status</span>
                    <span className="flex-1 text-slate-800">
                      {ticket.deliveryStatus === 'DISPATCHED' ? 'Dispatched' : 'Pending dispatch'}
                    </span>
                  </div>
                )}
              </div>
            </section>
          );
        })()}

      {charges.length > 0 || discount > 0 ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Charges</h4>
          <div className="mt-3 divide-y divide-border-soft rounded-xl ring-1 ring-border-soft bg-surface">
            {charges.map(([label, val]) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-600">{label}</span>
                <span className="tabular-nums text-slate-900">PKR {formatPKR(val)}</span>
              </div>
            ))}
            {discount > 0 ? (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-600">Discount</span>
                <span className="tabular-nums text-emerald-600">− PKR {formatPKR(discount)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold">
              <span className="text-slate-900">Total</span>
              <span className="tabular-nums text-slate-900">PKR {formatPKR(total)}</span>
            </div>
          </div>
        </section>
      ) : null}

      {Array.isArray(ticket.documents) && ticket.documents.length > 0 ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Documents</h4>
          <div className="mt-3 space-y-2">
            {ticket.documents.map((doc: any) => (
              <button
                key={doc.id}
                type="button"
                onClick={async () => {
                  try {
                    const { blob, filename } = await apiClient.getBlob(
                      `/tickets/${ticket.id}/documents/${doc.id}/download`,
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename || doc.name || 'document';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error('Document download failed', err);
                  }
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ring-border-soft bg-surface transition-colors hover:bg-surface-muted"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {documentCategoryLabel(doc.category)}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {doc.caption || doc.name || 'Document'}
                  </span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl bg-brand-50/60 px-4 py-3 text-xs text-brand-700 ring-1 ring-inset ring-brand-100">
        <p className="flex items-center gap-2 font-semibold">
          <Clock className="h-3.5 w-3.5" /> What&rsquo;s next?
        </p>
        <p className="mt-1 text-brand-700/80">{nextSteps[ticket.status] ?? ''}</p>
      </section>

      {showFinalPayment ? (
        <div className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-medium text-rose-700 mb-2">Final payment due — PKR {formatPKR(remaining)}</p>
          <Link href={`/consumer/tickets/${ticketId}/pay`}>
            <Button variant="brand" size="sm" rightIcon={<ArrowUpRight className="h-3.5 w-3.5" />}>Pay now</Button>
          </Link>
        </div>
      ) : null}
      {showPayNow ? (
        <Link href={`/consumer/tickets/${ticketId}/pay`} className="inline-block">
          <Button variant="brand" size="sm" rightIcon={<ArrowUpRight className="h-3.5 w-3.5" />}>Pay now</Button>
        </Link>
      ) : null}

      {/* ── Section 1: Status timeline ─────────────────────────────────── */}
      {Array.isArray(ticket.history) && ticket.history.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Timeline
          </h4>
          <ol className="relative mt-3 border-l border-slate-200 pl-5 space-y-4">
            {(ticket.history as Array<{ from?: string; to: string; createdAt: string }>).map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 ring-4 ring-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                </span>
                <p className="text-sm font-medium text-slate-900">{statusLabelFull(h.to)}</p>
                {h.from && (
                  <p className="text-xs text-slate-400 mt-0.5">from {statusLabelFull(h.from)}</p>
                )}
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {new Date(h.createdAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {ticket.status === 'COMPLETED' || ticket.status === 'DELIVERED' ? (
        <PanelCard className="mt-4 border border-brand-200 bg-gradient-to-br from-brand-50 to-violet-50">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
              <ArrowRight className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-900">Need another service?</h3>
              <p className="mt-1 text-sm text-slate-600">Browse judicial and non-judicial services to start a new request.</p>
              <Link href="/consumer/paralegal-services" className="mt-3 inline-block">
                <Button variant="brand" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>Order another service</Button>
              </Link>
            </div>
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}
