'use client';
import { Download, FileText, Image as ImageIcon, RotateCcw, Trash2 } from 'lucide-react';
import { downloadPersonalFile, type PersonalFile } from '@/lib/personal-files-api';

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return d.toLocaleDateString();
}

export function PersonalFilesRow({
  file, deleted, onDelete, onRestore,
}: {
  file: PersonalFile;
  deleted?: boolean;
  onDelete?: (id: string) => void;
  onRestore?: (id: string) => void;
}) {
  const isImage = file.mimeType.startsWith('image/');
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
        {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{file.displayName}</p>
        <p className="text-xs text-slate-500">{fmtSize(file.sizeBytes)} · {fmtDate(file.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {!deleted ? (
          <>
            <button
              type="button"
              onClick={() => downloadPersonalFile(file.id)}
              className="flex items-center gap-1.5 rounded-md border border-border-soft px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(file.id)}
              aria-label={`Delete ${file.displayName}`}
              className="flex items-center justify-center rounded-md border border-border-soft p-1.5 text-slate-500 hover:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onRestore?.(file.id)}
            className="flex items-center gap-1.5 rounded-md border border-border-soft px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restore
          </button>
        )}
      </div>
    </div>
  );
}
