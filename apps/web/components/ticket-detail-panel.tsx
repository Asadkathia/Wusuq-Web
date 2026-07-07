/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import {
  chargeCapabilitiesFor,
  FLOW_LABELS,
  courtTierFromCourtType,
  computeClerkEarnings,
  computeWusuqMargin,
} from '@wusuq/shared';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusPill } from '@/components/ui/status-pill';
import {
  X, User, FileText, Package, CreditCard, Clock,
  Phone, MapPin, Briefcase, Download, Truck, ClipboardCheck, Eye
} from 'lucide-react';
import {
  parseDeliveryAddress,
  flowKeyToSlug,
} from '@/lib/intake-flows';
import { buildCaseView, isCaseViewEmpty } from '@/lib/case-view';
import { CaseRecordCard } from '@/components/case-record-card';
import { DocumentPreview } from '@/components/document-preview';

type Props = {
  ticketId: string;
  onClose: () => void;
  isClerkView?: boolean;
  /** Called after a mutation inside the drawer (accept/reject) so the parent
   *  list can refresh and the now-stale row leaves its previous bucket. */
  onChange?: () => void;
};


const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  PENDING: 'warning',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
};

export function TicketDetailPanel({ ticketId, onClose, isClerkView = false, onChange }: Props) {
  const router = useRouter();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as { id?: string } | null;
      setCurrentUserId(u?.id ?? null);
    } catch {
      setCurrentUserId(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.get<any>(`/tickets/${ticketId}`);
      setTicket(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const isAssignedToMe =
    !!ticket &&
    ticket.status === 'ASSIGNED' &&
    !!currentUserId &&
    ticket.assignments?.[0]?.representative?.id === currentUserId;

  const handleAccept = async () => {
    setActionBusy(true);
    setActionError('');
    try {
      await apiClient.post(`/tickets/${ticketId}/accept-assignment`, {});
      await load();
      onChange?.();
    } catch (e: any) {
      const msg: string = e?.message || '';
      // Benign race (Bug #10): the ticket already left ASSIGNED (e.g. accepted
      // from the list a moment ago). Don't surface a red error — just refresh.
      if (/only assigned tickets can be accepted/i.test(msg)) {
        await load();
        onChange?.();
      } else {
        setActionError(msg || 'Failed to accept assignment');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    setActionBusy(true);
    setActionError('');
    try {
      await apiClient.post(`/tickets/${ticketId}/reject-assignment`, {
        reason: rejectReason.trim(),
      });
      setRejectOpen(false);
      setRejectReason('');
      await load();
      onChange?.();
    } catch (e: any) {
      setActionError(e?.message || 'Failed to reject assignment');
    } finally {
      setActionBusy(false);
    }
  };

  // Customer-facing total is ALWAYS Ticket.totalAmount (the single source —
  // computeTicketTotal on the server). Never hand-sum components here: that
  // both re-included the internal clerk cost (Bug #5) and omitted tax, so the
  // admin panel disagreed with the consumer receipt. Clerk earnings are shown
  // as their own separate internal line below.
  const customerTotal = ticket ? Number(ticket.totalAmount || 0) : 0;

  // PDF purchased at intake → the clerk earns their PDF_CLERK_FEE cut (handled
  // by the shared computeClerkEarnings).
  const wantPdf =
    ((ticket?.formPayload ?? {}) as Record<string, unknown>).want_pdf_before_dispatch === 'Yes';


  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Ticket Detail
              {ticket?.batchNo && <span className="ml-2 text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{ticket.batchNo}</span>}
            </h2>
            {ticket && (
              <div className="mt-1">
                <StatusPill label={ticket.status} variant={STATUS_VARIANT[ticket.status] ?? 'neutral'} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAssignedToMe && (
              <div className="flex gap-2">
                <button
                  disabled={actionBusy}
                  onClick={handleAccept}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Accept assignment
                </button>
                <button
                  disabled={actionBusy}
                  onClick={() => { setActionError(''); setRejectOpen(true); }}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
            {!isClerkView && ticket && ticket.status !== 'DELIVERED' && (
              <button
                onClick={() => {
                  const flow = ticket.intakeFlow ?? '';
                  const slug = flowKeyToSlug(flow);
                  if (!slug) return;
                  const category = flow.startsWith('judicial_') ? 'judicial' : 'non-judicial';
                  router.push(`/paralegal-services/${category}/${slug}?editTicketId=${ticket.id}`);
                }}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Edit ticket
              </button>
            )}
            <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {actionError && (
          <div className="border-b border-rose-100 bg-rose-50 px-6 py-2 text-sm text-rose-700">
            {actionError}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading && <div className="py-20 text-center text-slate-400 animate-pulse">Loading ticket...</div>}
          {error && <div className="py-10 text-center text-rose-500">{error}</div>}

          {ticket && (
            <>
              {/* ── Clerk view: only Case Details + Clerk Cost ── */}
              {isClerkView ? (
                <>
                  {/* Service & Case Details (clerk) */}
                  <PanelCard className="p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary-500" />Service Details</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                      <div><span className="text-slate-500">Service</span><p className="font-medium text-slate-900 mt-0.5">{ticket.service?.name ?? '—'}</p></div>
                      <div><span className="text-slate-500">Category</span><p className="font-medium text-slate-900 mt-0.5">{ticket.service?.category ?? '—'}</p></div>
                      <div><span className="text-slate-500">Service City</span><p className="font-medium text-slate-900 mt-0.5">{ticket.serviceCity ?? '—'}</p></div>
                      <div><span className="text-slate-500">Case Type</span><p className="font-medium text-slate-900 mt-0.5">{ticket.caseType ?? '—'}</p></div>
                      {ticket.intakeFlow && (
                        <div className="col-span-2">
                          <span className="text-slate-500">Intake Type</span>
                          <p className="font-medium text-slate-900 mt-0.5">
                            {(FLOW_LABELS as Record<string, string>)[ticket.intakeFlow] ?? ticket.intakeFlow}
                          </p>
                        </div>
                      )}
                    </div>
                    {ticket.formPayload && typeof ticket.formPayload === 'object' && (() => {
                      const view = buildCaseView(
                        ticket.formPayload as Record<string, string | undefined>,
                        courtTierFromCourtType((ticket.formPayload as Record<string, string | undefined>).select_court_type),
                        { scheduledDate: ticket.scheduledDate },
                      );
                      if (isCaseViewEmpty(view)) return null;
                      return (
                        <div className="border-t border-slate-100 pt-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Case Details</p>
                          <CaseRecordCard view={view} />
                        </div>
                      );
                    })()}
                  </PanelCard>

                  {/* Clerk Cost (clerk view) */}
                  {(() => {
                    const repName = ticket.assignments?.[0]?.representative?.name as string | undefined;
                    const clerkLabel = repName ? `Clerk — ${repName}` : 'Clerk';
                    return (
                      <PanelCard className="p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-primary-500" />{clerkLabel}
                        </h3>
                        <div className="space-y-2 text-sm">
                          {/* Clerk sees only their own clerk cost — never the
                              consumer's totals or the blended earnings line. */}
                          <div className="flex justify-between">
                            <span className="text-slate-500">Clerk Cost</span>
                            <span className="font-medium text-slate-800">
                              PKR {Number(ticket.clerkCost || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </PanelCard>
                    );
                  })()}
                </>
              ) : (
                <>
                  {/* ── Admin / Staff full view ── */}

                  {/* Consumer Info */}
                  <PanelCard className="p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><User className="h-4 w-4 text-primary-500" />Consumer Information</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-slate-500">Name</span><p className="font-medium text-slate-900 mt-0.5">{ticket.consumer?.name ?? '—'}</p></div>
                      <div><span className="text-slate-500">Email</span><p className="font-medium text-slate-900 mt-0.5">{ticket.consumer?.email ?? '—'}</p></div>
                      <div><span className="text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3" />Phone</span><p className="font-medium text-slate-900 mt-0.5">{ticket.consumer?.phone ?? '—'}</p></div>
                      <div><span className="text-slate-500">CNIC</span><p className="font-medium text-slate-900 mt-0.5">{ticket.consumer?.cnic ?? '—'}</p></div>
                      <div><span className="text-slate-500 flex items-center gap-1"><MapPin className="h-3 w-3" />Province</span><p className="font-medium text-slate-900 mt-0.5">{ticket.consumer?.province ?? '—'}</p></div>
                      <div><span className="text-slate-500">City</span><p className="font-medium text-slate-900 mt-0.5">{ticket.consumer?.city ?? '—'}</p></div>
                    </div>
                  </PanelCard>

                  {/* Service & Case Details */}
                  <PanelCard className="p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary-500" />Service Details</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                      <div><span className="text-slate-500">Service</span><p className="font-medium text-slate-900 mt-0.5">{ticket.service?.name ?? '—'}</p></div>
                      <div><span className="text-slate-500">Category</span><p className="font-medium text-slate-900 mt-0.5">{ticket.service?.category ?? '—'}</p></div>
                      <div><span className="text-slate-500">Service City</span><p className="font-medium text-slate-900 mt-0.5">{ticket.serviceCity ?? '—'}</p></div>
                      <div><span className="text-slate-500">Case Type</span><p className="font-medium text-slate-900 mt-0.5">{ticket.caseType ?? '—'}</p></div>
                      {ticket.intakeFlow && (
                        <div className="col-span-2">
                          <span className="text-slate-500">Intake Type</span>
                          <p className="font-medium text-slate-900 mt-0.5">
                            {(FLOW_LABELS as Record<string, string>)[ticket.intakeFlow] ?? ticket.intakeFlow}
                          </p>
                        </div>
                      )}
                    </div>
                    {ticket.formPayload && typeof ticket.formPayload === 'object' && (() => {
                      const view = buildCaseView(
                        ticket.formPayload as Record<string, string | undefined>,
                        courtTierFromCourtType((ticket.formPayload as Record<string, string | undefined>).select_court_type),
                        { scheduledDate: ticket.scheduledDate },
                      );
                      if (isCaseViewEmpty(view)) return null;
                      return (
                        <div className="border-t border-slate-100 pt-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Case Details</p>
                          <CaseRecordCard view={view} />
                        </div>
                      );
                    })()}
                  </PanelCard>

                  {/* Representative */}
                  {ticket.assignments?.length > 0 && (
                    <PanelCard className="p-4">
                      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-primary-500" />Assigned Representative</h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-slate-500">Name</span><p className="font-medium text-slate-900 mt-0.5">{ticket.assignments[0].representative?.name}</p></div>
                        <div><span className="text-slate-500">Phone</span><p className="font-medium text-slate-900 mt-0.5">{ticket.assignments[0].representative?.phone ?? '—'}</p></div>
                        <div><span className="text-slate-500">City</span><p className="font-medium text-slate-900 mt-0.5">{ticket.assignments[0].representative?.city ?? '—'}</p></div>
                        <div><span className="text-slate-500">Court</span><p className="font-medium text-slate-900 mt-0.5">{ticket.assignments[0].representative?.court ?? '—'}</p></div>
                      </div>
                    </PanelCard>
                  )}

                  {/* Charges Breakdown */}
                  <PanelCard className="p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary-500" />Charges Breakdown</h3>
                    {(() => {
                      const caps = chargeCapabilitiesFor(ticket.intakeFlow);
                      const repName = ticket.assignments?.[0]?.representative?.name as string | undefined;
                      // Phase-2 clerk charges are excluded from the customer
                      // total until finalize (B4). Gate their rows on
                      // remainderFinalizedAt so the breakdown reconciles with
                      // the Total; the admin reviews/edits proposed phase-2
                      // charges in the Review & Complete dialog, not here.
                      const phase2Visible = Boolean(ticket.remainderFinalizedAt);
                      const chargeRows: Array<[string, unknown]> = [
                        ['Service Cost', ticket.serviceCost],
                        ...(phase2Visible && caps.delivery ? [['Delivery Charges', ticket.deliveryCharges] as [string, unknown]] : []),
                        ...(phase2Visible && caps.printing ? [['Printing Charges', ticket.printingCharges] as [string, unknown]] : []),
                        ...(phase2Visible && caps.attestation ? [['Attested Charges', ticket.attestedCharges] as [string, unknown]] : []),
                        ...(phase2Visible && caps.attestation ? [['Non-Attested Charges', ticket.nonAttestedCharges] as [string, unknown]] : []),
                        ...(phase2Visible ? [['Additional Charges', ticket.additionalCharges] as [string, unknown]] : []),
                        ['Additional Service Cost', ticket.additionalServiceCost],
                        // Clerk cost is internal-only and excluded from the
                        // customer total — it appears solely in the separate
                        // clerk-earnings line below (Bug #5).
                        ['Discount', ticket.discountPrice ? `-${Number(ticket.discountPrice).toLocaleString()}` : null],
                      ];
                      const clerkEarnings = computeClerkEarnings({ ...ticket, wantPdf });
                      const wusuqEarnings = computeWusuqMargin(customerTotal, clerkEarnings);
                      return (
                        <div className="space-y-2 text-sm">
                          {chargeRows.filter(([, val]) => val !== null && val !== undefined && Number(val) !== 0).map(([label, val]) => (
                            <div key={label as string} className="flex justify-between border-b border-slate-50 pb-1.5">
                              <span className="text-slate-500">{label}</span>
                              <span className="font-medium text-slate-800">PKR {Number(val || 0).toLocaleString()}</span>
                            </div>
                          ))}
                          {clerkEarnings > 0 && (
                            <div className="flex justify-between border-b border-dashed border-amber-200 pb-1.5 text-amber-800">
                              <span className="font-medium">{repName ? `${repName}'s earnings` : 'Clerk earnings'}</span>
                              <span className="font-semibold">PKR {clerkEarnings.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-b border-dashed border-emerald-200 pb-1.5 text-emerald-800">
                            <span className="font-medium">Wusuq earnings</span>
                            <span className="font-semibold">PKR {wusuqEarnings.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between pt-1 font-semibold text-slate-900">
                            <span>Total</span><span>PKR {customerTotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-emerald-700">
                            <span>Amount Paid</span><span className="font-medium">PKR {Number(ticket.amountPaid || 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-rose-700">
                            <span>Remaining</span><span className="font-medium">PKR {Math.max(0, customerTotal - Number(ticket.amountPaid || 0)).toLocaleString()}</span>
                          </div>
                          {ticket.remainderFinalizedAt ? (
                            <div className="pt-1 text-xs text-slate-500">
                              Remainder finalized on {new Date(ticket.remainderFinalizedAt).toLocaleDateString('en-PK')}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </PanelCard>

                  {/* Consumer Notes & Delivery */}
                  {ticket.formPayload && typeof ticket.formPayload === 'object' && (() => {
                    const p = ticket.formPayload as Record<string, unknown>;
                    const notes = typeof p.notes === 'string' ? p.notes.trim() : '';
                    const deliveryMode = p.delivery_mode ? String(p.delivery_mode) : '';
                    const deliveryMethod = p.delivery_method ? String(p.delivery_method) : '';
                    const rawAddr = p.delivery_address;
                    const hasAddr = rawAddr !== undefined && rawAddr !== null && rawAddr !== '';
                    let structured: ReturnType<typeof parseDeliveryAddress> | null = null;
                    let legacyAddr = '';
                    if (hasAddr) {
                      if (typeof rawAddr === 'string') {
                        const trimmed = rawAddr.trim();
                        if (trimmed.startsWith('{')) {
                          structured = parseDeliveryAddress(rawAddr);
                        } else {
                          legacyAddr = trimmed;
                        }
                      } else if (typeof rawAddr === 'object') {
                        structured = parseDeliveryAddress(rawAddr);
                      }
                    }
                    const showCard = notes || deliveryMode || deliveryMethod || hasAddr;
                    if (!showCard) return null;
                    return (
                      <PanelCard className="p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                          <Truck className="h-4 w-4 text-primary-500" />Consumer Notes & Delivery
                        </h3>
                        <div className="space-y-3 text-sm">
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Consumer Note</span>
                            <p className="mt-1 whitespace-pre-wrap text-slate-800">
                              {notes || <span className="italic text-slate-400">(no notes)</span>}
                            </p>
                          </div>
                          {(deliveryMode || deliveryMethod) && (
                            <div className="border-t border-slate-100 pt-3">
                              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Delivery</span>
                              <p className="mt-1 text-slate-800">
                                {deliveryMode && <span className="font-medium">{deliveryMode}</span>}
                                {deliveryMode && deliveryMethod && <span className="text-slate-400"> · </span>}
                                {deliveryMethod}
                              </p>
                            </div>
                          )}
                          {hasAddr && (
                            <div className="border-t border-slate-100 pt-3">
                              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Delivery Address</span>
                              {structured ? (
                                <div className="mt-1 grid grid-cols-2 gap-2 text-slate-800">
                                  {structured.house && <div><span className="text-slate-500">House: </span>{structured.house}</div>}
                                  {structured.block && <div><span className="text-slate-500">Block: </span>{structured.block}</div>}
                                  {structured.mainArea && <div><span className="text-slate-500">Main Area: </span>{structured.mainArea}</div>}
                                  {structured.city && <div><span className="text-slate-500">City: </span>{structured.city}</div>}
                                </div>
                              ) : (
                                <p className="mt-1 whitespace-pre-wrap text-slate-800">{legacyAddr}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </PanelCard>
                    );
                  })()}

                  {/* Clerk Availability Report */}
                  <PanelCard className="p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4 text-primary-500" />Clerk Availability Report
                    </h3>
                    {ticket.clerkReport ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-slate-500">Attested available</span>
                          <p className="font-medium text-slate-900 mt-0.5">{ticket.clerkReport.attestedAvailable ? 'Yes' : 'No'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Non-Attested available</span>
                          <p className="font-medium text-slate-900 mt-0.5">{ticket.clerkReport.nonAttestedAvailable ? 'Yes' : 'No'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Both</span>
                          <p className="font-medium text-slate-900 mt-0.5">{ticket.clerkReport.bothAvailable ? 'Yes' : 'No'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Partial completion</span>
                          <p className="font-medium text-slate-900 mt-0.5">{ticket.clerkReport.partialCompletion ? 'Yes' : 'No'}</p>
                        </div>
                        {ticket.clerkReport.perPageRateAttested !== null && ticket.clerkReport.perPageRateAttested !== undefined && (
                          <div>
                            <span className="text-slate-500">Per-page rate (attested)</span>
                            <p className="font-medium text-slate-900 mt-0.5">Rs {Number(ticket.clerkReport.perPageRateAttested).toLocaleString()}</p>
                          </div>
                        )}
                        {ticket.clerkReport.perPageRateNonAttested !== null && ticket.clerkReport.perPageRateNonAttested !== undefined && (
                          <div>
                            <span className="text-slate-500">Per-page rate (non-attested)</span>
                            <p className="font-medium text-slate-900 mt-0.5">Rs {Number(ticket.clerkReport.perPageRateNonAttested).toLocaleString()}</p>
                          </div>
                        )}
                        {ticket.clerkReport.unavailableReason && (
                          <div className="col-span-2">
                            <span className="text-slate-500">Unavailable reason</span>
                            <p className="font-medium text-slate-900 mt-0.5 whitespace-pre-wrap">{ticket.clerkReport.unavailableReason}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm italic text-slate-400">(no clerk report yet)</p>
                    )}
                  </PanelCard>

                  {/* Documents — grouped by category */}
                  {ticket.documents?.length > 0 && (() => {
                    const workDocs = (ticket.documents as any[]).filter((d) => d.category !== 'DELIVERABLE_PDF');
                    const deliverableDocs = (ticket.documents as any[]).filter((d) => d.category === 'DELIVERABLE_PDF');
                    const renderDocList = (docs: any[]) => (
                      <ul className="space-y-2">
                        {docs.map((doc: any) => (
                          <li key={doc.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                            <span className="text-sm text-slate-700 truncate">{doc.name}</span>
                            <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                              <label className="flex items-center gap-1 text-xs text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={!!doc.visibleToConsumer}
                                  onChange={async (e) => {
                                    try {
                                      await apiClient.patch(`/tickets/${ticketId}/documents/${doc.id}`, {
                                        visibleToConsumer: e.target.checked,
                                      });
                                      await load();
                                    } catch (err) {
                                      console.error('Visibility toggle failed', err);
                                    }
                                  }}
                                />
                                Visible to consumer
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewDoc({
                                    url: `/tickets/${ticketId}/documents/${doc.id}/download`,
                                    name: doc.name ?? 'Document',
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-primary-600 transition-colors"
                                aria-label="Preview document"
                                title={doc.name ?? 'Preview document'}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const { blob, filename } = await apiClient.getBlob(
                                      `/tickets/${ticketId}/documents/${doc.id}/download`,
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
                                className="p-1 text-slate-400 hover:text-primary-600 transition-colors"
                                aria-label={`Download ${doc.name ?? 'document'}`}
                                title="Download"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    );
                    return (
                      <PanelCard className="p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary-500" />Documents ({ticket.documents.length})
                        </h3>
                        {workDocs.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Work documents</p>
                            {renderDocList(workDocs)}
                          </div>
                        )}
                        {deliverableDocs.length > 0 && (
                          <div className={workDocs.length > 0 ? 'border-t border-slate-100 pt-3' : ''}>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Deliverable PDF(s)</p>
                            {renderDocList(deliverableDocs)}
                          </div>
                        )}
                      </PanelCard>
                    );
                  })()}

                  {/* Status History */}
                  {ticket.history?.length > 0 && (() => {
                    // QA R5: surface the consumer's intake details (special
                    // note + delivery mode/method) as a synthetic "Intake"
                    // entry at the BOTTOM of the timeline so the timeline tells
                    // the full ticket story end-to-end, not just the workflow
                    // transitions. The separate Consumer Notes & Delivery
                    // card above remains as the primary surface; this
                    // duplication is intentional — operators reading the
                    // timeline shouldn't have to scroll back up to find what
                    // the consumer originally asked for.
                    const p = (ticket.formPayload ?? {}) as Record<string, unknown>;
                    const intakeNote = typeof p.notes === 'string' ? p.notes.trim() : '';
                    const intakeMode = p.delivery_mode ? String(p.delivery_mode) : '';
                    const intakeMethod = p.delivery_method ? String(p.delivery_method) : '';
                    const intakeBits = [
                      intakeMode || intakeMethod
                        ? `Delivery: ${[intakeMode, intakeMethod].filter(Boolean).join(' · ')}`
                        : '',
                      intakeNote ? `Special Note: ${intakeNote}` : '',
                    ].filter(Boolean);
                    const intakeSummary = intakeBits.join(' · ');
                    return (
                      <PanelCard className="p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-primary-500" />Status Timeline</h3>
                        <ol className="relative border-l border-slate-200 space-y-4 pl-4">
                          {ticket.history.map((h: any, i: number) => (
                            <li key={i} className="relative">
                              <span className="absolute -left-[19px] flex h-4 w-4 items-center justify-center rounded-full bg-primary-100 ring-4 ring-white">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary-600" />
                              </span>
                              <div className="text-sm">
                                <span className="font-medium text-slate-900">{h.to}</span>
                                {h.from && <span className="text-slate-400"> ← {h.from}</span>}
                                {h.note && <p className="text-xs text-slate-500 mt-0.5">{h.note}</p>}
                                <p className="text-xs text-slate-400 mt-0.5">{new Date(h.createdAt).toLocaleString('en-PK')}</p>
                              </div>
                            </li>
                          ))}
                          {intakeSummary && (
                            <li className="relative">
                              <span className="absolute -left-[19px] flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 ring-4 ring-white">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                              </span>
                              <div className="text-sm">
                                <span className="font-medium text-slate-900">Intake</span>
                                <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{intakeSummary}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{new Date(ticket.createdAt).toLocaleString('en-PK')}</p>
                              </div>
                            </li>
                          )}
                        </ol>
                      </PanelCard>
                    );
                  })()}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {rejectOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Reject assignment</h3>
            <p className="mt-1 text-sm text-slate-600">
              This returns the ticket to PENDING so an admin can reassign it. A reason is required.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="mt-3 w-full rounded-md border border-slate-300 p-2 text-sm"
              placeholder="Why are you rejecting this assignment?"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setRejectOpen(false); setRejectReason(''); }}
                disabled={actionBusy}
                className="px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                disabled={actionBusy || rejectReason.trim().length < 3}
                onClick={handleReject}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Confirm reject
              </button>
            </div>
          </div>
        </div>
      )}

      {previewDoc && (
        <DocumentPreview
          url={previewDoc.url}
          name={previewDoc.name}
          onClose={() => setPreviewDoc(null)}
        />
      )}

    </div>
  );
}
