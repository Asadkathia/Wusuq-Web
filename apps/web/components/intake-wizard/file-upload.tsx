'use client';

import { FileText, Image as ImageIcon, UploadCloud, X } from 'lucide-react';

type FileUploadProps = {
  files: File[];
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

export function FileUpload({
  files,
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
        <div className="text-center">
          <UploadCloud className="mx-auto h-12 w-12 text-slate-300" />
          <div className="mt-4 flex text-sm leading-6 text-slate-600">
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
              {files.map((file, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700"
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
                  <button
                    type="button"
                    onClick={() => onRemoveFile(i)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
