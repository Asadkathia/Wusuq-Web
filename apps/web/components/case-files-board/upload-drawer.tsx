'use client';

import { useState } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { CohortPicker, type CohortValue } from './cohort-picker';
import { FileUpload } from '@/components/intake-wizard/file-upload';

type Props = {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
};

type CaseMeta = {
  caseNo: string;
  caseYear: string;
  caseTitle: string;
  judgeName: string;
  courtLevel: string;
  caseType: string;
};

export function UploadDrawer({ open, onClose, onUploaded }: Props) {
  const [cohort, setCohort] = useState<Partial<CohortValue>>({});
  const [caseMeta, setCaseMeta] = useState<CaseMeta>({
    caseNo: '',
    caseYear: '',
    caseTitle: '',
    judgeName: '',
    courtLevel: '',
    caseType: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [captions, setCaptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cohortReady = Boolean(
    cohort.serviceId && cohort.cityId && cohort.courtName && cohort.courtType,
  );

  const setCaseMetaField = (key: keyof CaseMeta, value: string) => {
    setCaseMeta((prev) => ({ ...prev, [key]: value }));
  };

  const reset = () => {
    setCohort({});
    setCaseMeta({ caseNo: '', caseYear: '', caseTitle: '', judgeName: '', courtLevel: '', caseType: '' });
    setFiles([]);
    setCaptions([]);
    setError('');
  };

  const handleFilesAdd = (added: File[]) => {
    setFiles((prev) => [...prev, ...added]);
    setCaptions((prev) => [...prev, ...added.map(() => '')]);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setCaptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCaptionChange = (index: number, caption: string) => {
    setCaptions((prev) => {
      const next = prev.slice();
      next[index] = caption;
      return next;
    });
  };

  const handleSave = async () => {
    if (!cohortReady || files.length === 0) {
      setError('Pick a service / city / court and at least one file.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        const form = new FormData();
        form.append('file', file);
        form.append('serviceId', cohort.serviceId!);
        form.append('cityId', cohort.cityId!);
        if (cohort.cityName) form.append('cityName', cohort.cityName);
        form.append('courtName', cohort.courtName!);
        form.append('courtType', cohort.courtType!);
        const caption = captions[i];
        if (caption) form.append('caption', caption);
        // Intake-style case metadata — append only when provided.
        if (caseMeta.caseNo.trim()) form.append('caseNo', caseMeta.caseNo.trim());
        if (caseMeta.caseYear.trim()) form.append('caseYear', caseMeta.caseYear.trim());
        if (caseMeta.caseTitle.trim()) form.append('caseTitle', caseMeta.caseTitle.trim());
        if (caseMeta.judgeName.trim()) form.append('judgeName', caseMeta.judgeName.trim());
        if (caseMeta.courtLevel.trim()) form.append('courtLevel', caseMeta.courtLevel.trim());
        if (caseMeta.caseType.trim()) form.append('caseType', caseMeta.caseType.trim());
        await apiClient.post('/personal-files/case-files', form);
      }
      reset();
      onUploaded();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-slate-900/40"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <aside className="flex h-full w-full max-w-xl flex-col bg-surface shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border-soft px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Upload case files</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-surface-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
          <CohortPicker value={cohort} onChange={setCohort} />

          {/* ── Case metadata (optional) ──────────────────────────── */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Case details{' '}
              <span className="font-normal text-slate-400">(optional)</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="upload-case-no"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Case no.
                </label>
                <input
                  id="upload-case-no"
                  type="text"
                  value={caseMeta.caseNo}
                  onChange={(e) => setCaseMetaField('caseNo', e.target.value)}
                  placeholder="e.g. 1234/2024"
                  className="w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label
                  htmlFor="upload-case-year"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Case year
                </label>
                <input
                  id="upload-case-year"
                  type="number"
                  min={1900}
                  max={new Date().getFullYear()}
                  value={caseMeta.caseYear}
                  onChange={(e) => setCaseMetaField('caseYear', e.target.value)}
                  placeholder="e.g. 2022"
                  className="w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="upload-case-title"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Case title / parties
              </label>
              <input
                id="upload-case-title"
                type="text"
                value={caseMeta.caseTitle}
                onChange={(e) => setCaseMetaField('caseTitle', e.target.value)}
                placeholder="e.g. Ahmed vs State"
                className="w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label
                htmlFor="upload-judge-name"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Judge name
              </label>
              <input
                id="upload-judge-name"
                type="text"
                value={caseMeta.judgeName}
                onChange={(e) => setCaseMetaField('judgeName', e.target.value)}
                placeholder="e.g. Justice Ali"
                className="w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="upload-court-level"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Court level
                </label>
                <input
                  id="upload-court-level"
                  type="text"
                  value={caseMeta.courtLevel}
                  onChange={(e) => setCaseMetaField('courtLevel', e.target.value)}
                  placeholder="e.g. High Court"
                  className="w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label
                  htmlFor="upload-case-type"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Case type
                </label>
                <input
                  id="upload-case-type"
                  type="text"
                  value={caseMeta.caseType}
                  onChange={(e) => setCaseMetaField('caseType', e.target.value)}
                  placeholder="e.g. Civil Revision"
                  className="w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
          </div>

          {cohortReady ? (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Files</p>
              <FileUpload
                inputId="case-files-upload"
                files={files}
                captions={captions}
                onCaptionChange={handleCaptionChange}
                onFilesAdd={handleFilesAdd}
                onRemoveFile={handleRemoveFile}
              />
            </div>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-border-soft px-5 py-4">
          <button
            type="button"
            onClick={() => { reset(); onClose(); }}
            className="inline-flex items-center gap-1 rounded-xl border border-border-soft bg-surface px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-surface-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !cohortReady || files.length === 0}
            onClick={handleSave}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-elev-1 transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? 'Uploading…' : 'Save'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
