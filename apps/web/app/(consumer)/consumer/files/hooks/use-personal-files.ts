'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listPersonalFiles,
  uploadPersonalFile,
  softDeletePersonalFile,
  restorePersonalFile,
  type PersonalFile,
  type Quota,
} from '@/lib/personal-files-api';

const MAX_PARALLEL = 3;

export type LocalUpload = {
  tempId: string;
  name: string;
  size: number;
  status: 'uploading' | 'failed';
  error?: string;
};

export function usePersonalFiles() {
  const [files, setFiles] = useState<PersonalFile[]>([]);
  const [usage, setUsage] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingUploads, setPendingUploads] = useState<LocalUpload[]>([]);

  const refresh = useCallback(async () => {
    const res = await listPersonalFiles({ includeDeleted: showDeleted });
    setFiles(res.files);
    setUsage(res.usage);
  }, [showDeleted]);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const visible = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    const filtered = s
      ? files.filter((f) => f.displayName.toLowerCase().includes(s))
      : files;
    return {
      live: filtered.filter((f) => !f.deletedAt),
      deleted: filtered.filter((f) => f.deletedAt),
    };
  }, [files, searchQuery]);

  const upload = useCallback(async (incoming: File[]) => {
    if (!incoming.length) return;

    const uploads: LocalUpload[] = incoming.map((f) => ({
      tempId: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      status: 'uploading',
    }));
    setPendingUploads((prev) => [...uploads, ...prev]);

    let cursor = 0;
    async function worker() {
      while (cursor < incoming.length) {
        const my = cursor++;
        const file = incoming[my]!;
        const local = uploads[my]!;
        try {
          const created = await uploadPersonalFile(file);
          setFiles((prev) => [created, ...prev]);
          setPendingUploads((prev) => prev.filter((u) => u.tempId !== local.tempId));
        } catch (e) {
          const msg =
            (e as { response?: { error?: string; quotaBytes?: number } })?.response?.error ??
            (e instanceof Error ? e.message : 'upload_failed');
          setPendingUploads((prev) =>
            prev.map((u) =>
              u.tempId === local.tempId ? { ...u, status: 'failed', error: msg } : u,
            ),
          );
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL, incoming.length) }, worker),
    );
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const prev = files;
    setFiles((cur) =>
      cur.map((f) => (f.id === id ? { ...f, deletedAt: new Date().toISOString() } : f)),
    );
    try {
      await softDeletePersonalFile(id);
      await refresh();
    } catch {
      setFiles(prev);
    }
  }, [files, refresh]);

  const restore = useCallback(async (id: string) => {
    const prev = files;
    setFiles((cur) => cur.map((f) => (f.id === id ? { ...f, deletedAt: null } : f)));
    try {
      await restorePersonalFile(id);
      await refresh();
    } catch {
      setFiles(prev);
    }
  }, [files, refresh]);

  const dismissPending = useCallback((tempId: string) => {
    setPendingUploads((prev) => prev.filter((u) => u.tempId !== tempId));
  }, []);

  return {
    loading,
    files: visible.live,
    deletedFiles: visible.deleted,
    usage,
    pendingUploads,
    showDeleted,
    setShowDeleted,
    searchQuery,
    setSearchQuery,
    upload,
    remove,
    restore,
    dismissPending,
  };
}
