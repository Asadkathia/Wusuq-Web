'use client';
import { usePersonalFiles } from './hooks/use-personal-files';
import { PersonalFilesUploader } from './personal-files-uploader';
import { PersonalFilesQuota } from './personal-files-quota';
import { PersonalFilesList } from './personal-files-list';
import { RecentlyDeletedSection } from './recently-deleted-section';

export function PersonalFilesClient() {
  const f = usePersonalFiles();
  const quotaFull = f.usage ? f.usage.bytesUsed >= f.usage.quotaBytes : false;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My files</h1>
          <p className="mt-1 text-sm text-slate-500">
            Personal storage for documents you want handy. Only you can see these.
          </p>
        </div>
        <PersonalFilesUploader onSelect={f.upload} disabled={quotaFull} />
      </header>

      {f.usage ? (
        <PersonalFilesQuota bytesUsed={f.usage.bytesUsed} quotaBytes={f.usage.quotaBytes} />
      ) : null}

      {f.loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <PersonalFilesList
            files={f.files}
            pending={f.pendingUploads}
            searchQuery={f.searchQuery}
            onSearchChange={f.setSearchQuery}
            onDelete={f.remove}
            onDismissPending={f.dismissPending}
          />
          <RecentlyDeletedSection
            files={f.deletedFiles}
            expanded={f.showDeleted}
            onToggle={() => f.setShowDeleted(!f.showDeleted)}
            onRestore={f.restore}
          />
        </>
      )}
    </div>
  );
}
