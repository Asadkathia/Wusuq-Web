'use client';
import { Search, Loader2 } from 'lucide-react';
import { type PersonalFile } from '@/lib/personal-files-api';
import { PersonalFilesRow } from './personal-files-row';
import type { LocalUpload } from './hooks/use-personal-files';

export function PersonalFilesList({
  files, pending, searchQuery, onSearchChange, onDelete, onDismissPending,
}: {
  files: PersonalFile[];
  pending: LocalUpload[];
  searchQuery: string;
  onSearchChange: (s: string) => void;
  onDelete: (id: string) => void;
  onDismissPending: (tempId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search your files…"
          className="w-full rounded-xl border-0 bg-surface py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-brand-500/50"
        />
      </div>

      {pending.length > 0 ? (
        <div className="flex flex-col gap-2">
          {pending.map((p) => (
            <div
              key={p.tempId}
              className="flex items-center gap-3 rounded-lg border border-dashed border-brand-200 bg-brand-50/40 p-3"
            >
              {p.status === 'uploading' ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
              ) : (
                <span className="text-xs font-medium text-rose-600">Failed</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                {p.error ? <p className="text-xs text-rose-600">{p.error}</p> : null}
              </div>
              {p.status === 'failed' ? (
                <button
                  type="button"
                  onClick={() => onDismissPending(p.tempId)}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {files.length === 0 && pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-muted/40 p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No files yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Upload PDFs, images, or Office docs. Up to 10 MB each · 500 MB total.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {files.map((f) => (
            <PersonalFilesRow key={f.id} file={f} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
