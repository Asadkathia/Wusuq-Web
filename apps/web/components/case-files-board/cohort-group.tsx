'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Trash2,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { DocumentPreview } from '@/components/document-preview';

type CaseFile = {
  id: string;
  displayName: string;
  sizeBytes: number;
  createdAt: string;
  mimeType: string;
  attachedTicketId?: string | null;
};

type Props = {
  service: string;
  city: string;
  court: string;
  /** D1: representative case title for this cohort, from the newest
   *  upload's caseMeta. Null when no upload carried a case title. */
  caseTitle?: string | null;
  /** D1: presiding judge for this cohort, from caseMeta.judgeName. */
  judgeName?: string | null;
  files: CaseFile[];
  onDeleted: (fileId: string) => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function CohortGroup({ service, city, court, caseTitle, judgeName, files, onDeleted }: Props) {
  const [open, setOpen] = useState(files.length > 1);
  const [previewFile, setPreviewFile] = useState<CaseFile | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleDownload = async (id: string, displayName: string) => {
    try {
      const { blob, filename } = await apiClient.getBlob(`/personal-files/${id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || displayName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // swallow — surfaced via UI later if needed.
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this file?')) return;
    await apiClient.delete(`/personal-files/${id}`);
    onDeleted(id);
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected file(s)?`)) return;
    setBulkDeleting(true);
    try {
      await apiClient.delete<{ deletedCount: number; skippedIds: string[] }>(
        '/personal-files/bulk',
        { body: JSON.stringify({ ids: Array.from(selected) }) },
      );
      for (const id of selected) onDeleted(id);
      setSelected(new Set());
    } catch {
      // swallow — surfaced via UI later if needed (matches handleDelete above).
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-soft bg-surface shadow-elev-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {service} · {city} · {court}
            </p>
            {/* D1: case title + presiding judge from caseMeta. */}
            {caseTitle ? <p className="text-xs text-slate-500">{caseTitle}</p> : null}
            {judgeName ? (
              <p className="text-xs text-slate-400">Judge: {judgeName}</p>
            ) : null}
          </div>
        </div>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
          {files.length}
        </span>
      </button>
      {open ? (
        <div className="border-t border-border-soft">
          {selected.size > 0 ? (
            <div className="flex items-center justify-between gap-3 bg-rose-50 px-5 py-2">
              <p className="text-xs font-semibold text-rose-700">{selected.size} selected</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {bulkDeleting ? 'Deleting…' : 'Delete selected'}
                </button>
              </div>
            </div>
          ) : null}
          <div className="divide-y divide-border-soft">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(f.id)}
                    onChange={() => toggleSelected(f.id)}
                    aria-label={`Select ${f.displayName}`}
                    className="h-4 w-4 shrink-0 rounded border-border-soft"
                  />
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{f.displayName}</p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString()}
                      {f.attachedTicketId ? (
                        <>
                          {' · '}
                          <a
                            href={`/consumer/my-tickets/${f.attachedTicketId}`}
                            className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                          >
                            Attached <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewFile(f)}
                    className="rounded-xl border border-border-soft bg-surface p-2 text-slate-600 transition-colors hover:bg-surface-muted"
                    aria-label="View"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(f.id, f.displayName)}
                    className="rounded-xl border border-border-soft bg-surface p-2 text-slate-600 transition-colors hover:bg-surface-muted"
                    aria-label="Download"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(f.id)}
                    className="rounded-xl border border-border-soft bg-surface p-2 text-rose-600 transition-colors hover:bg-rose-50"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {previewFile ? (
        <DocumentPreview
          url={`/personal-files/${previewFile.id}/download`}
          name={previewFile.displayName}
          onClose={() => setPreviewFile(null)}
        />
      ) : null}
    </div>
  );
}
