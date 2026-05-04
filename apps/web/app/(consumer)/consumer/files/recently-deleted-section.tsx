'use client';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type PersonalFile } from '@/lib/personal-files-api';
import { PersonalFilesRow } from './personal-files-row';

export function RecentlyDeletedSection({
  files, expanded, onToggle, onRestore,
}: {
  files: PersonalFile[];
  expanded: boolean;
  onToggle: () => void;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-border-soft bg-surface-muted/40 p-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-sm font-medium text-slate-700"
      >
        <span className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Recently deleted
          <span className="text-xs text-slate-500">({files.length}, 30-day recovery)</span>
        </span>
      </button>
      {expanded && files.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {files.map((f) => (
            <PersonalFilesRow key={f.id} file={f} deleted onRestore={onRestore} />
          ))}
        </div>
      ) : null}
      {expanded && files.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">Nothing here yet.</p>
      ) : null}
    </div>
  );
}
