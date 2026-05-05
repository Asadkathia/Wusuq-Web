/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { advanceOnEnter } from '@/lib/form-utils';
import { SectionHeader } from '@/components/ui/section-header';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { FileText, Download, FolderGit2, RefreshCw, FileImage, File, UploadCloud, X } from 'lucide-react';

type DocumentItem = {
  id: string;
  name: string;
  type: string;
  fileUrl: string;
  createdAt: string;
  ticket: {
    id: string;
    batchNo: string;
    consumer: { id: string; name: string };
  };
};
const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'] as const;

export function DocumentsBoard() {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTicketId, setUploadTicketId] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isConsumer, setIsConsumer] = useState(false);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
      if (!u) return;
      setIsConsumer(CONSUMER_ROLES.includes(u.role as (typeof CONSUMER_ROLES)[number]));
      setUserId(u.id ?? '');
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: '200' });
      if (search) query.set('search', search);
      if (isConsumer && userId) query.set('consumerId', userId);
      const result = await apiClient.get<any>(`/documents?${query.toString()}`);
      setItems(result.items ?? []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [search, isConsumer, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('pdf')) return <FileText className="h-5 w-5 text-rose-500" />;
    if (t.includes('image') || t.includes('png') || t.includes('jpg')) return <FileImage className="h-5 w-5 text-blue-500" />;
    return <File className="h-5 w-5 text-slate-400" />;
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTicketId) return setMessage('Please enter a Ticket ID to attach documents to.');
    if (uploadFiles.length === 0) return setMessage('Please select at least one file to upload.');

    setUploadLoading(true);
    setMessage('Uploading documents...');
    try {
      for (const file of uploadFiles) {
        const formData = new FormData();
        formData.append('file', file);
        await apiClient.post(`/tickets/${uploadTicketId}/documents/upload`, formData);
      }
      setMessage('Documents uploaded successfully');
      setIsUploadOpen(false);
      setUploadTicketId('');
      setUploadFiles([]);
      load();
    } catch (error: any) {
      setMessage(error.message || 'Upload failed. Check if Ticket ID is valid.');
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Document Repository" 
        description="Centralized, searchable storage for all generated forms, uploaded proofs, and service artifacts."
        action={
          <div className="flex gap-2">
            <a
              href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api'}/documents/export?format=csv`}
              download="documents-export.csv"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-emerald-700 hover:bg-emerald-500 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </a>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-primary-700 hover:bg-primary-500 transition-colors"
            >
              <UploadCloud className="h-4 w-4" />
              Upload Document
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('failed') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      <DataTableShell
        header={
          <FilterBar 
            searchPlaceholder="Search files by name, batch number, or type..."
            onSearch={setSearch}
          />
        }
      >
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">File Details</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Context (Ticket/Batch)</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Consumer</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date Logged</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                      {getFileIcon(item.type)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 truncate max-w-[200px]" title={item.name}>{item.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5 uppercase tracking-wider font-semibold">{item.type}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                    <FolderGit2 className="h-3.5 w-3.5 text-slate-400" />
                    {item.ticket.batchNo}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-slate-900">{item.ticket.consumer.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                  <a 
                    href={item.fileUrl || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                    title="Download/View File"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                  No documents found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setIsUploadOpen(false)}></div>
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">Upload Documents</h3>
              <button onClick={() => setIsUploadOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            
            <form onSubmit={handleUploadSubmit} onKeyDown={advanceOnEnter} className="space-y-6">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 flex justify-between">
                  <span>Target Ticket ID</span>
                  <span className="text-slate-400 text-xs font-normal">Required for context mapping</span>
                </span>
                <input required className="w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" placeholder="e.g. 123e4567-..." value={uploadTicketId} onChange={(e) => setUploadTicketId(e.target.value)} />
              </label>

              <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
                <UploadCloud className="mx-auto h-10 w-10 text-slate-400 mb-2" />
                <label className="cursor-pointer text-sm font-semibold text-primary-600 hover:text-primary-500">
                  <span>Choose files</span>
                  <input type="file" multiple className="sr-only" onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))} />
                </label>
                <p className="text-xs text-slate-500 mt-1">PNG, JPG, PDF up to 10MB each</p>
                {uploadFiles.length > 0 && (
                  <div className="mt-4 text-left border-t border-slate-200 pt-4">
                    <p className="text-xs font-semibold text-slate-700 mb-2">{uploadFiles.length} file(s) selected:</p>
                    <ul className="space-y-1 text-xs text-slate-600">
                      {uploadFiles.map((f, i) => (
                        <li key={i} className="truncate">{f.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsUploadOpen(false)} className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={uploadLoading} className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 flex items-center gap-2 transition-colors">
                  {uploadLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
