'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { casesApi, type Case, type CaseEvent } from '@/lib/api/cases';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { StatusPill } from '@/components/ui/status-pill';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { ArrowLeft, Clock, Ticket as TicketIcon, Calendar, FileText, Plus, RefreshCw, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CaseSuggestedSteps } from '@/components/case-suggested-steps';
import { CaseDriftBanner } from '@/components/case-drift-banner';

type CaseDetailProps = {
  caseId: string;
  basePath?: string;
  readOnly?: boolean;
};

export function CaseDetail({ caseId, basePath = '/cases', readOnly = false }: CaseDetailProps) {
  const router = useRouter();
  const [caseData, setCaseData] = useState<Case & { events: CaseEvent[], tickets: any[], documents: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  
  const [activeTab, setActiveTab] = useState<'overview' | 'tickets' | 'hearings' | 'timeline'>('overview');

  const loadCase = useCallback(async () => {
    setLoading(true);
    try {
      const data = await casesApi.getCase(caseId);
      setCaseData(data);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load case details');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  if (loading) return <div className="p-12 text-center text-slate-500">Loading case details...</div>;
  if (!caseData) return <div className="p-12 text-center text-rose-500">Case not found.</div>;

  const isJudicial = caseData.type === 'JUDICIAL';

  return (
    <div className="space-y-6 pb-20">
      <button 
        onClick={() => router.back()} 
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Cases
      </button>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{caseData.title}</h1>
            <StatusPill label={caseData.status} variant={caseData.status === 'OPEN' ? 'success' : caseData.status === 'CLOSED' ? 'neutral' : 'warning'} />
          </div>
          <p className="mt-2 text-sm text-slate-500 flex items-center gap-3">
            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">{caseData.caseRef}</span>
            <span>{caseData.type} Law</span>
            <span>Consumer: {caseData.consumer.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={loadCase} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
             <RefreshCw className="h-4 w-4" /> Refresh
           </button>
           {!readOnly ? (
             <Link href={`${basePath}/${caseId}/new-ticket`} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500">
               <Plus className="h-4 w-4" /> Start Proceeding
             </Link>
           ) : null}
        </div>
      </div>

      {message && (
        <div className="p-4 rounded-xl text-sm font-medium bg-rose-50 text-rose-800 border border-rose-200">
          {message}
        </div>
      )}

      {!readOnly ? <CaseDriftBanner caseId={caseId} /> : null}
      {!readOnly ? <CaseSuggestedSteps caseId={caseId} basePath={basePath} /> : null}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', name: 'Overview', icon: Info },
            { id: 'tickets', name: 'Tickets/Proceedings', icon: TicketIcon, count: caseData.tickets.length },
            { id: 'hearings', name: 'Schedule', icon: Calendar, count: caseData.tickets.filter((t: any) => t.scheduledDate).length },
            { id: 'timeline', name: 'Timeline & Events', icon: Clock },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`
                flex items-center gap-2 whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium
                ${activeTab === tab.id 
                  ? 'border-primary-600 text-primary-600' 
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }
              `}
            >
              <tab.icon className="h-4 w-4" />
              {tab.name}
              {tab.count !== undefined ? (
                <span className={`ml-2 rounded-full py-0.5 px-2.5 text-xs font-medium ${activeTab === tab.id ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-900'}`}>
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PanelCard className="p-6">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <FileText className="h-5 w-5 text-primary-600" /> Case Context & Metadata
            </h3>
            
            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
               {isJudicial ? (
                 <>
                   <div><div className="text-xs font-medium text-slate-500">Court Level</div><div className="mt-1 text-sm text-slate-900">{caseData.courtLevel || '-'}</div></div>
                   <div><div className="text-xs font-medium text-slate-500">Court City</div><div className="mt-1 text-sm text-slate-900">{caseData.courtCity || '-'}</div></div>
                   <div><div className="text-xs font-medium text-slate-500">Case/Petition No</div><div className="mt-1 text-sm text-slate-900">{caseData.caseNo || '-'}</div></div>
                   <div><div className="text-xs font-medium text-slate-500">Case Year</div><div className="mt-1 text-sm text-slate-900">{caseData.caseYear || '-'}</div></div>
                   <div><div className="text-xs font-medium text-slate-500">Case Type</div><div className="mt-1 text-sm text-slate-900">{caseData.caseCategory || '-'}</div></div>
                   <div><div className="text-xs font-medium text-slate-500">Court Case Status</div><div className="mt-1 text-sm text-slate-900">{caseData.courtCaseStatus || '-'}</div></div>
                 </>
               ) : (
                 <>
                   <div><div className="text-xs font-medium text-slate-500">Province</div><div className="mt-1 text-sm text-slate-900">{caseData.province || '-'}</div></div>
                   <div><div className="text-xs font-medium text-slate-500">District</div><div className="mt-1 text-sm text-slate-900">{caseData.district || '-'}</div></div>
                   <div><div className="text-xs font-medium text-slate-500">Police Station</div><div className="mt-1 text-sm text-slate-900">{caseData.policeStation || '-'}</div></div>
                   <div><div className="text-xs font-medium text-slate-500">FIR No</div><div className="mt-1 text-sm text-slate-900">{caseData.firNo || '-'}</div></div>
                   <div><div className="text-xs font-medium text-slate-500">Offence</div><div className="mt-1 text-sm text-slate-900">{caseData.offence || '-'}</div></div>
                   <div><div className="text-xs font-medium text-slate-500">Document No</div><div className="mt-1 text-sm text-slate-900">{caseData.docNo || '-'}</div></div>
                 </>
               )}
            </div>
          </PanelCard>

          <PanelCard className="p-6">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <Info className="h-5 w-5 text-primary-600" /> Additional Details
            </h3>
            
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium text-slate-500">Parties</div>
                <div className="mt-1 text-sm text-slate-900">
                  <span className="font-semibold text-primary-700">{caseData.petitioner || 'Unknown'}</span> 
                  <span className="text-slate-400 mx-2">vs</span> 
                  <span className="font-semibold text-rose-700">{caseData.respondent || 'Unknown'}</span>
                </div>
              </div>
              
              <div>
                <div className="text-xs font-medium text-slate-500">Notes & Description</div>
                <div className="mt-1 text-sm text-slate-700 p-3 bg-slate-50 rounded-lg min-h-[80px]">
                  {caseData.notes || 'No notes provided.'}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500">Created At</div>
                <div className="mt-1 text-sm text-slate-900">{new Date(caseData.createdAt).toLocaleString()}</div>
              </div>
            </div>
          </PanelCard>
        </div>
      )}

      {/* Tickets Tab */}
      {activeTab === 'tickets' && (
        <PanelCard className="p-0 border-slate-200">
           <DataTableShell header={
              <div className="flex items-center justify-between py-3 px-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-900">Linked Proceedings (Tickets)</h3>
              </div>
            }>
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Batch No & Details</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {caseData.tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900">{t.batchNo}</div>
                        <div className="text-xs text-slate-500 mt-1">{new Date(t.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900">{t.service.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusPill label={t.status} variant={t.status === 'COMPLETED' ? 'success' : 'warning'} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                         {!readOnly ? (
                           t.status === 'COMPLETED' ? (
                              <Link href={`${basePath}/${caseId}/new-ticket?resume=${t.id}`} className="text-primary-600 hover:text-primary-800 font-semibold text-sm">
                                Continue Sequence
                              </Link>
                           ) : (
                              <span className="text-slate-400 text-sm">In Progress</span>
                           )
                         ) : (
                           <span className="text-slate-400 text-sm">View only</span>
                         )}
                      </td>
                    </tr>
                  ))}
                  {caseData.tickets.length === 0 && (
                     <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">No tickets linked to this case yet.</td></tr>
                  )}
                </tbody>
              </table>
           </DataTableShell>
        </PanelCard>
      )}

      {/* Schedule Tab — case schedule lives on tickets with scheduledDate set. */}
      {activeTab === 'hearings' && (() => {
        const entries = (caseData.tickets ?? [])
          .filter((t: any) => t.scheduledDate)
          .sort(
            (a: any, b: any) =>
              new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime(),
          );
        return (
          <PanelCard className="p-0 border-slate-200">
            <DataTableShell header={
              <div className="flex items-center justify-between py-3 px-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-900">Case Schedule</h3>
              </div>
            }>
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ticket</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Outcome</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {entries.map((t: any) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-slate-900">{new Date(t.scheduledDate).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900">{t.hearingType || 'Standard'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {t.batchNo ?? '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-700">{t.outcome || '-'}</div>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">No scheduled items.</td></tr>
                  )}
                </tbody>
              </table>
            </DataTableShell>
          </PanelCard>
        );
      })()}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <PanelCard className="p-6">
          <div className="max-w-3xl mx-auto space-y-8">
            {caseData.events.map((event, idx) => (
              <div key={event.id} className="relative flex gap-4">
                {idx !== caseData.events.length - 1 && (
                  <div className="absolute top-6 left-2.5 -bottom-8 w-px bg-slate-200" />
                )}
                
                <div className={`
                  relative flex h-5 w-5 mt-1 flex-none items-center justify-center bg-white rounded-full ring-2
                  ${event.type === 'CONTEXT_DRIFT_DETECTED' ? 'ring-amber-500'
                    : event.type === 'CONTEXT_RESOLVED' ? 'ring-emerald-500'
                    : event.type.includes('COMPLETED') ? 'ring-emerald-500'
                    : event.type.includes('HEARING') ? 'ring-amber-500'
                    : 'ring-primary-600'}
                `}>
                  {event.type === 'CONTEXT_DRIFT_DETECTED' && <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />}
                  {event.type === 'CONTEXT_RESOLVED' && <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />}
                  {event.type.includes('HEARING') && <Calendar className="h-2.5 w-2.5 text-amber-500" />}
                  {event.type.includes('TICKET') && <TicketIcon className="h-2.5 w-2.5 text-primary-600" />}
                </div>
                
                <div className="flex-auto py-0.5">
                  <div className="flex items-center justify-between gap-x-4">
                    <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                    <time dateTime={event.createdAt} className="flex-none text-xs text-slate-500">
                      {new Date(event.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {event.description && (
                    <p className="mt-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      {event.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {caseData.events.length === 0 && (
              <p className="text-center text-slate-500 py-8">No events recorded.</p>
            )}
          </div>
        </PanelCard>
      )}

    </div>
  );
}
