'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { casesApi, type Case, type Hearing } from '@/lib/api/cases';
import { apiClient } from '@/lib/api-client';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { ArrowLeft, CheckCircle2, UploadCloud, FileText } from 'lucide-react';

export function CaseTicketWizard({ caseId }: { caseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeTicketId = searchParams.get('resume');

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [services, setServices] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    serviceId: '',
    hearingId: '',
    notes: '',
  });
  
  const [files, setFiles] = useState<File[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const c = await casesApi.getCase(caseId);
      setCaseData(c);

      const h = await casesApi.listHearings(caseId);
      setHearings(h);

      const s = await apiClient.get<any>(`/services?type=${c.type.toLowerCase()}&limit=100`);
      setServices(s.items || s || []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to initialize wizard');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.serviceId) {
      setMessage('Please select a service');
      return;
    }

    setSubmitting(true);
    setMessage('Creating proceeding ticket...');
    try {
      let createdTicket: any;
      
      const payload = {
        serviceId: form.serviceId,
        hearingId: form.hearingId || undefined,
        overrides: form.notes ? { note: form.notes, notes: form.notes } : undefined,
      };

      if (resumeTicketId) {
        createdTicket = await casesApi.continueTicket(caseId, resumeTicketId, payload);
      } else {
        createdTicket = await casesApi.createTicket(caseId, payload);
      }

      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        await apiClient.post(`/tickets/${createdTicket.id}/documents/upload`, fd);
      }

      setMessage('✅ Proceeding started successfully!');
      setTimeout(() => {
        router.push(`/cases/${caseId}`);
      }, 1500);
    } catch (error: any) {
      setMessage(error.message || 'Failed to create ticket');
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-slate-500">Loading case context...</div>;
  if (!caseData) return <div className="p-12 text-center text-rose-500">Case not found.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-20">
      <button 
        onClick={() => router.back()} 
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Case
      </button>

      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {resumeTicketId ? 'Continue Proceeding' : 'Start New Proceeding'}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          For Case: <span className="font-semibold text-slate-700">{caseData.title}</span> ({caseData.caseRef})
        </p>
        <p className="text-sm text-slate-500">
          Case details will be automatically injected into tracking forms.
        </p>
      </div>

      <PanelCard className="p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Required Service <span className="text-rose-500">*</span></span>
            <select
              required
              className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
              value={form.serviceId}
              onChange={(e) => setForm(f => ({ ...f, serviceId: e.target.value }))}
            >
              <option value="">— Select Service —</option>
              {services.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Link to Hearing</span>
            <select
              className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
              value={form.hearingId}
              onChange={(e) => setForm(f => ({ ...f, hearingId: e.target.value }))}
            >
              <option value="">— Independent Proceeding —</option>
              {hearings.map(h => (
                <option key={h.id} value={h.id}>
                  {new Date(h.scheduledDate).toLocaleDateString()} - {h.hearingType || 'Standard Hearing'}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Optional. Link this service to a specific hearing schedule.</p>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Service Notes / Remarks</span>
            <textarea
              rows={3}
              className="mt-1 block w-full rounded-xl border-0 py-2.5 px-3 text-slate-900 ring-1 ring-inset ring-border-soft placeholder:text-slate-400 focus:ring-2 focus:ring-primary-600 sm:text-sm"
              placeholder="Any specific requests for this ticket..."
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </label>

          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-sm font-semibold text-slate-900 mb-4">Supporting Documents</h4>
            <div className="flex justify-center rounded-xl border border-dashed border-slate-300 px-6 py-8">
              <div className="text-center">
                <UploadCloud className="mx-auto h-10 w-10 text-slate-300" />
                <div className="mt-4 flex flex-col items-center text-sm leading-6 text-slate-600">
                  <label htmlFor="file-upload" className="relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 hover:text-primary-500">
                    <span>Upload files</span>
                    <input id="file-upload" type="file" multiple className="sr-only"
                      onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                  </label>
                  <p className="mt-1 text-xs text-slate-500">PNG, JPG, PDF up to 10MB each</p>
                </div>
                {files.length > 0 && (
                  <ul className="mt-4 space-y-2 text-left">
                    {files.map((file, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        <FileText className="h-4 w-4 text-primary-500" />
                        <span className="truncate">{file.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {message && (
            <div className={`mt-4 rounded-lg p-4 text-sm font-medium ${message.includes('✅') ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
              {message}
            </div>
          )}

          <div className="mt-8 flex justify-end gap-3 border-t border-slate-100 pt-6">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Creating...' : <><CheckCircle2 className="h-4 w-4" /> Start Proceeding</>}
            </button>
          </div>
        </form>
      </PanelCard>
    </div>
  );
}
