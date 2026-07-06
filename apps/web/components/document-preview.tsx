'use client';

import { startTransition, useEffect, useState } from 'react';
import { AlertTriangle, Download, FileText, RefreshCw, X } from 'lucide-react';

/**
 * Classifies a document by its filename (extension) or content-type string
 * so the viewer knows whether it can render an inline preview.
 */
export function previewKind(nameOrType: string): 'pdf' | 'image' | 'other' {
  const value = (nameOrType ?? '').toLowerCase().trim();
  if (!value) return 'other';

  // Content-type style, e.g. "application/pdf", "image/png"
  if (value.startsWith('image/')) return 'image';
  if (value === 'application/pdf') return 'pdf';

  // Filename style — branch on the extension
  const extMatch = value.match(/\.([a-z0-9]+)$/);
  const ext = extMatch?.[1] ?? value;
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  return 'other';
}

interface DocumentPreviewProps {
  url: string;
  name: string;
  onClose: () => void;
}

export function DocumentPreview({ url, name, onClose }: DocumentPreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      try {
        const { apiClient } = await import('@/lib/api-client');
        const { blob } = await apiClient.getBlob(url);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        const nextUrl = createdUrl;
        startTransition(() => {
          setObjectUrl(nextUrl);
          setLoading(false);
        });
      } catch {
        if (cancelled) return;
        startTransition(() => {
          setError('Unable to load this document.');
          setLoading(false);
        });
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  const kind = previewKind(name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="truncate text-base font-semibold text-slate-900" title={name}>
            {name}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close preview">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto p-6">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="text-sm">Loading preview…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-2 text-center text-slate-500">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {!loading && !error && objectUrl && kind === 'pdf' && (
            <iframe src={objectUrl} title={name} className="h-full w-full rounded-lg border border-slate-200" />
          )}

          {!loading && !error && objectUrl && kind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={objectUrl} alt={name} className="max-h-full max-w-full rounded-lg object-contain" />
          )}

          {!loading && !error && objectUrl && kind === 'other' && (
            <div className="flex flex-col items-center gap-3 text-center text-slate-500">
              <FileText className="h-10 w-10 text-slate-400" />
              <span className="text-sm">This file type can&apos;t be previewed.</span>
              <a
                href={objectUrl}
                download={name}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
