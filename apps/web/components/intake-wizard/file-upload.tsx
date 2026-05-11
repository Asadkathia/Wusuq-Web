'use client';

import { Eye, FileText, Image as ImageIcon, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';

// PDF #43 — per-file caption choices. Consumers tag each upload so the clerk
// (and downstream filing workflow) know which docs are the Petition, which
// is the Power of Attorney, supporting evidence, etc. "Other" reveals a
// free-form input so we don't lock users out of edge cases.
export const FILE_CAPTION_OPTIONS = [
  'Petition',
  'Power of Attorney',
  'Supporting Document',
  'FIR / Police Report',
  'ID Card',
  'Court Order',
  'Other',
] as const;

export type FileCaptionOption = (typeof FILE_CAPTION_OPTIONS)[number];

type FileUploadProps = {
  files: File[];
  /** Caption strings per file, parallel-indexed with `files`. May be empty for
   * legacy callers that don't track captions — the picker is still rendered
   * but state is local-only. */
  captions?: string[];
  /** Optional callback to update a caption at a given index. When omitted,
   * the caption pickers stay uncontrolled and are effectively read-only. */
  onCaptionChange?: (index: number, caption: string) => void;
  onFilesAdd: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  inputId: string;
  title?: string;
  description?: string;
  error?: string;
  isDragging?: boolean;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// A caption value is "Other" when it isn't one of the canonical preset
// labels. We persist the free-form text directly under `captions[i]`, so to
// distinguish we keep a sentinel: empty string = unselected, any of the
// non-Other presets = preset chosen, anything else = "Other" + free text.
function isPresetCaption(value: string): boolean {
  return (FILE_CAPTION_OPTIONS as readonly string[]).includes(value) && value !== 'Other';
}

export function FileUpload({
  files,
  captions = [],
  onCaptionChange,
  onFilesAdd,
  onRemoveFile,
  inputId,
  title = 'Supporting Documents',
  description = 'Upload files or drag them here. PNG, JPG, PDF, DOC up to 10MB each.',
  error,
  isDragging = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: FileUploadProps) {
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  return (
    <div className="mt-4">
      <h4 className="mb-4 text-sm font-semibold text-slate-900">{title}</h4>
      <div
        className={`flex justify-center rounded-xl border border-dashed px-6 py-10 transition ${
          isDragging ? 'border-primary-600 ring-2 ring-primary-600 ring-offset-2' : 'border-slate-300'
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="w-full text-center">
          <UploadCloud className="mx-auto h-12 w-12 text-slate-300" />
          <div className="mt-4 flex justify-center text-sm leading-6 text-slate-600">
            <label
              htmlFor={inputId}
              className="relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 hover:text-primary-500"
            >
              <span>Upload files</span>
              <input
                id={inputId}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => onFilesAdd(Array.from(e.target.files ?? []))}
              />
            </label>
            <p className="pl-1">or drag and drop</p>
          </div>
          <p className="text-xs text-slate-500">{description}</p>
          {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
          {files.length > 0 && (
            <ul aria-live="polite" className="mt-4 space-y-2 text-left">
              {files.map((file, i) => {
                const captionRaw = captions[i] ?? '';
                const presetValue = isPresetCaption(captionRaw)
                  ? captionRaw
                  : captionRaw === ''
                    ? ''
                    : 'Other';
                const otherText = presetValue === 'Other' ? captionRaw : '';
                return (
                  <li
                    key={i}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {file.type.startsWith('image/') ? (
                        <ImageIcon className="h-4 w-4 shrink-0 text-primary-500" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-primary-500" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{file.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatFileSize(file.size)} · {file.type || 'Unknown type'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                      {/* Caption picker per file (PDF #43). Hidden when no
                          onCaptionChange handler is supplied — keeps legacy
                          call sites visually unchanged. */}
                      {onCaptionChange ? (
                        <div className="flex items-center gap-1">
                          <select
                            aria-label={`Caption for ${file.name}`}
                            value={presetValue}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === '') {
                                onCaptionChange(i, '');
                              } else if (next === 'Other') {
                                // Keep any existing free-form text on switch
                                onCaptionChange(i, otherText || 'Other');
                              } else {
                                onCaptionChange(i, next);
                              }
                            }}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-600"
                          >
                            <option value="">Caption…</option>
                            {FILE_CAPTION_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          {presetValue === 'Other' ? (
                            <input
                              type="text"
                              aria-label={`Custom caption for ${file.name}`}
                              placeholder="Describe…"
                              value={otherText === 'Other' ? '' : otherText}
                              onChange={(e) => onCaptionChange(i, e.target.value)}
                              className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-600"
                            />
                          ) : null}
                        </div>
                      ) : null}

                      <div className="flex shrink-0 items-center gap-1">
                        <a
                          href={previews[i]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-primary-600 focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
                          aria-label={`View ${file.name}`}
                          title="View file"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => onRemoveFile(i)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
