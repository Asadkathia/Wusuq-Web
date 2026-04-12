'use client';

import { UploadCloud, FileText } from 'lucide-react';

type FileUploadProps = {
  files: File[];
  onFilesChange: (files: File[]) => void;
};

export function FileUpload({ files, onFilesChange }: FileUploadProps) {
  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-slate-900 mb-4">Supporting Documents</h4>
      <div className="flex justify-center rounded-xl border border-dashed border-slate-300 px-6 py-10">
        <div className="text-center">
          <UploadCloud className="mx-auto h-12 w-12 text-slate-300" />
          <div className="mt-4 flex text-sm leading-6 text-slate-600">
            <label
              htmlFor="file-upload"
              className="relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 hover:text-primary-500"
            >
              <span>Upload files</span>
              <input
                id="file-upload"
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => onFilesChange(Array.from(e.target.files ?? []))}
              />
            </label>
            <p className="pl-1">or drag and drop</p>
          </div>
          <p className="text-xs text-slate-500">PNG, JPG, PDF, DOC up to 10MB each</p>
          {files.length > 0 && (
            <ul className="mt-4 space-y-2 text-left">
              {files.map((file, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200"
                >
                  <FileText className="h-4 w-4 text-primary-500" />
                  <span className="truncate">{file.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
