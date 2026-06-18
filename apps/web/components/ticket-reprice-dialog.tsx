/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// ── Types ─────────────────────────────────────────────────────────────────────

type RepricePayloadFields = {
  year?: string;
  decided_date?: string;
  case_status?: string;
  select_court_type?: string;
  case_title?: string;
  select_court_city?: string;
  city_id?: string;
  set_type?: string;
};

type OverrideKey =
  | 'printingCharges'
  | 'attestedCharges'
  | 'nonAttestedCharges'
  | 'deliveryCharges'
  | 'additionalCharges'
  | 'additionalServiceCost'
  | 'discountPrice';

type PreviewMoney = {
  chargesSubtotal: number;
  discountTotal: number;
  taxableBase: number;
  taxAmount: number;
  totalAmount: number;
};

type PreviewResult = {
  resolver: { matched: boolean };
  charges: Record<string, number>;
  money: PreviewMoney;
};

export type TicketRepriceDialogProps = {
  ticketId: string;
  formPayload: Record<string, unknown>;
  currentTotalAmount: number;
  onClose: () => void;
  onSaved: () => void;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYLOAD_FIELD_DEFS: { key: keyof RepricePayloadFields; label: string }[] = [
  { key: 'case_status', label: 'Case Status' },
  { key: 'year', label: 'Case Year' },
  { key: 'decided_date', label: 'Decided Date' },
  { key: 'select_court_type', label: 'Court Type' },
  { key: 'case_title', label: 'Case Title' },
  { key: 'select_court_city', label: 'Service City' },
  { key: 'city_id', label: 'City ID' },
  { key: 'set_type', label: 'Set Type' },
];

const OVERRIDE_FIELD_DEFS: { key: OverrideKey; label: string }[] = [
  { key: 'printingCharges', label: 'Printing Charges' },
  { key: 'attestedCharges', label: 'Attested Charges' },
  { key: 'nonAttestedCharges', label: 'Non-Attested Charges' },
  { key: 'deliveryCharges', label: 'Delivery Charges' },
  { key: 'additionalCharges', label: 'Additional Charges' },
  { key: 'additionalServiceCost', label: 'Addl. Service Cost' },
  { key: 'discountPrice', label: 'Discount' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPayloadFields(fp: Record<string, unknown>): RepricePayloadFields {
  const out: RepricePayloadFields = {};
  // year — prefer canonical `year`; accept alias `case_year`
  if (fp.year !== undefined && fp.year !== null && fp.year !== '')
    out.year = String(fp.year);
  else if (fp.case_year !== undefined && fp.case_year !== null && fp.case_year !== '')
    out.year = String(fp.case_year);

  if (typeof fp.decided_date === 'string' && fp.decided_date)
    out.decided_date = fp.decided_date;
  if (typeof fp.case_status === 'string' && fp.case_status)
    out.case_status = fp.case_status;
  if (typeof fp.select_court_type === 'string' && fp.select_court_type)
    out.select_court_type = fp.select_court_type;
  if (typeof fp.case_title === 'string' && fp.case_title)
    out.case_title = fp.case_title;
  if (typeof fp.select_court_city === 'string' && fp.select_court_city)
    out.select_court_city = fp.select_court_city;
  if (typeof fp.city_id === 'string' && fp.city_id)
    out.city_id = fp.city_id;
  if (typeof fp.set_type === 'string' && fp.set_type)
    out.set_type = fp.set_type;
  return out;
}

function formatPKR(n: number) {
  return new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2 }).format(n);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TicketRepriceDialog({
  ticketId,
  formPayload,
  currentTotalAmount,
  onClose,
  onSaved,
}: TicketRepriceDialogProps) {
  const [payloadFields, setPayloadFields] = useState<RepricePayloadFields>(() =>
    extractPayloadFields(formPayload),
  );
  const [overrides, setOverrides] = useState<Record<OverrideKey, string>>({
    printingCharges: '',
    attestedCharges: '',
    nonAttestedCharges: '',
    deliveryCharges: '',
    additionalCharges: '',
    additionalServiceCost: '',
    discountPrice: '',
  });

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Generation counter: discard responses from stale preview fetches.
  const genRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildBody = useCallback(() => {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payloadFields)) {
      if (v !== undefined && v !== '') payload[k] = v;
    }

    // discountPrice is a top-level field on RepriceTicketDto, NOT inside overrides.
    const ov: Record<string, number> = {};
    for (const { key } of OVERRIDE_FIELD_DEFS) {
      if (key === 'discountPrice') continue; // handled at top level below
      const raw = overrides[key];
      if (raw !== '') ov[key] = Number(raw);
    }

    const body: Record<string, unknown> = { payload };
    if (Object.keys(ov).length > 0) body.overrides = ov;
    if (overrides.discountPrice !== '') body.discountPrice = Number(overrides.discountPrice);

    return body;
  }, [payloadFields, overrides]);

  const fetchPreview = useCallback(async () => {
    const gen = ++genRef.current;
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const body = buildBody();
      const result = await apiClient.post<PreviewResult>(
        `/tickets/${ticketId}/reprice/preview`,
        body,
      );
      if (gen !== genRef.current) return; // stale response — discard
      startTransition(() => {
        setPreview(result);
        setPreviewLoading(false);
      });
    } catch (err: any) {
      if (gen !== genRef.current) return;
      startTransition(() => {
        setPreviewError(err?.message ?? 'Preview failed');
        setPreviewLoading(false);
      });
    }
  }, [ticketId, buildBody]);

  // Debounce preview fetches on any field change (~400 ms).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void fetchPreview(); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchPreview]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await apiClient.patch(`/tickets/${ticketId}/reprice`, buildBody());
      onSaved();
      onClose();
    } catch (err: any) {
      setSaveError(err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const visiblePayloadFields = PAYLOAD_FIELD_DEFS.filter(
    ({ key }) => payloadFields[key] !== undefined,
  );

  const totalDiff = preview ? preview.money.totalAmount - currentTotalAmount : 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Edit Ticket — Reprice</DialogTitle>
          <DialogDescription>
            Update case fields to recalculate the price. The preview updates automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Case fields --------------------------------------------------- */}
          {visiblePayloadFields.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Case Fields
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {visiblePayloadFields.map(({ key, label }) => (
                  <label key={key} className="block">
                    <span className="text-xs font-semibold text-slate-500">{label}</span>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-lg border border-slate-200 py-1.5 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                      value={payloadFields[key] ?? ''}
                      onChange={(e) =>
                        setPayloadFields((f) => ({ ...f, [key]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Manual overrides ---------------------------------------------- */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
              Manual Overrides
            </p>
            <p className="text-xs text-slate-400 mb-3">
              Optional — leave blank to use the resolver&apos;s computed values.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {OVERRIDE_FIELD_DEFS.map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="text-xs font-semibold text-slate-500">{label}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="—"
                    className="mt-1 block w-full rounded-lg border border-slate-200 py-1.5 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                    value={overrides[key]}
                    onChange={(e) =>
                      setOverrides((o) => ({ ...o, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Live preview -------------------------------------------------- */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Price Preview
            </p>

            {previewLoading && (
              <p className="text-sm text-slate-400 animate-pulse">Calculating…</p>
            )}

            {!previewLoading && previewError && (
              <p className="text-sm text-rose-600">{previewError}</p>
            )}

            {!previewLoading && preview && (
              <>
                {preview.resolver.matched === false && (
                  <p className="mb-3 text-sm font-medium text-amber-700 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                    No pricing rule matched — result reflects manual overrides only.
                  </p>
                )}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Charges subtotal</span>
                    <span className="font-medium text-slate-800">
                      PKR {formatPKR(preview.money.chargesSubtotal)}
                    </span>
                  </div>
                  {preview.money.discountTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-emerald-600">Discount</span>
                      <span className="font-medium text-emerald-700">
                        − PKR {formatPKR(preview.money.discountTotal)}
                      </span>
                    </div>
                  )}
                  {preview.money.taxAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tax</span>
                      <span className="font-medium text-slate-800">
                        PKR {formatPKR(preview.money.taxAmount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
                    <span>New Total</span>
                    <span>PKR {formatPKR(preview.money.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Current Total</span>
                    <span className="text-slate-500">PKR {formatPKR(currentTotalAmount)}</span>
                  </div>
                  {totalDiff !== 0 && (
                    <div
                      className={[
                        'flex justify-between text-xs font-semibold',
                        totalDiff > 0 ? 'text-amber-700' : 'text-emerald-700',
                      ].join(' ')}
                    >
                      <span>Difference</span>
                      <span>
                        {totalDiff > 0 ? '+' : ''}PKR {formatPKR(totalDiff)}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {saveError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">
              {saveError}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <X className="h-4 w-4" />
              Cancel
            </button>
          </DialogClose>
          <button
            onClick={handleSave}
            disabled={saving || previewLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
