/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { advanceOnEnter } from '@/lib/form-utils';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatusPill } from '@/components/ui/status-pill';
import { Plus, RefreshCw, Users, ShieldCheck, Trophy, CheckCircle, Edit, Trash2 } from 'lucide-react';

type Election = {
  id: string;
  electionName: string;
  electionYear: number;
  electionTenure: string;
  status: string;
  totalCandidates: number;
  createdBy: string;
};

type Candidate = {
  id: string;
  position: string;
  memberName: string;
  votes: number;
  isWinner: boolean;
};

export function ElectionsBoard() {
  const [items, setItems] = useState<Election[]>([]);
  const [message, setMessage] = useState('');
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [selectedElection, setSelectedElection] = useState<Election | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [votingCandidateId, setVotingCandidateId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');

  const [electionForm, setElectionForm] = useState({
    name: '',
    bodyName: '',
    province: '',
    city: '',
    year: String(new Date().getFullYear()),
    tenure: '5 years',
  });

  const [candidateForm, setCandidateForm] = useState({
    position: '',
    memberName: '',
    votes: '0',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (provinceFilter) q.set('province', provinceFilter);
      if (cityFilter) q.set('city', cityFilter);
      const result = await apiClient.get<any>(`/elections?${q.toString()}`);
      setItems(result.items ?? []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load elections');
    } finally {
      setLoading(false);
    }
  }, [provinceFilter, cityFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCandidates = async (electionId: string) => {
    try {
      const result = await apiClient.get<any>(`/elections/${electionId}/candidates`);
      setCandidates(result.items ?? []);
      setSelectedElectionId(electionId);
      setSelectedElection(items.find(i => i.id === electionId) ?? null);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load candidates');
    }
  };

  const castVote = async (candidateId: string, position: string) => {
    if (!selectedElectionId) return;
    setVotingCandidateId(candidateId);
    try {
      await apiClient.post(`/elections/${selectedElectionId}/vote`, { candidateId, position });
      setMessage('Vote cast successfully');
      loadCandidates(selectedElectionId);
    } catch (error: any) {
      setMessage(error.message || 'Vote failed');
    } finally {
      setVotingCandidateId(null);
    }
  };

  const createElection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/elections', {
        ...electionForm,
        year: Number(electionForm.year),
      });
      setMessage('Election created');
      setElectionForm(prev => ({ ...prev, name: '', bodyName: '' }));
      load();
    } catch (error: any) {
      setMessage(error.message || 'Create election failed');
    }
  };

  const addCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedElectionId) {
      setMessage('Select election first');
      return;
    }

    try {
      await apiClient.post(`/elections/${selectedElectionId}/candidates`, {
        position: candidateForm.position,
        memberName: candidateForm.memberName,
        votes: Number(candidateForm.votes),
      });
      setMessage('Candidate added');
      setCandidateForm({ position: '', memberName: '', votes: '0' });
      loadCandidates(selectedElectionId);
      load();
    } catch (error: any) {
      setMessage(error.message || 'Add candidate failed');
    }
  };

  const finalizeElection = async (id: string) => {
    try {
      await apiClient.post(`/elections/${id}/finalize`);
      setMessage('Election finalized');
      load();
      if (selectedElectionId === id) {
        loadCandidates(id);
      }
    } catch (error: any) {
      setMessage(error.message || 'Finalize failed');
    }
  };

  const deleteElection = async (id: string) => {
    if (!confirm('Are you sure you want to delete this election?')) return;
    try {
      await apiClient.delete(`/elections/${id}`);
      setMessage('Election deleted');
      if (selectedElectionId === id) {
        setSelectedElectionId('');
        setCandidates([]);
      }
      load();
    } catch (error: any) {
      setMessage(error.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Elections Console" 
        description="Manage organizational elections, track candidates, and finalize results."
        action={
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('failed') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main List */}
        <div className="lg:col-span-2 space-y-6">
          <PanelCard className="p-0 border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-100 p-6 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary-600" /> All Elections
            </h3>
            <DataTableShell header={
              <FilterBar 
                searchPlaceholder="Search elections..." 
                onSearch={setSearch} 
                actions={
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <input className="w-full sm:w-32 rounded-lg border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" placeholder="Province..." value={provinceFilter} onChange={e => setProvinceFilter(e.target.value)} />
                    <input className="w-full sm:w-32 rounded-lg border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" placeholder="City..." value={cityFilter} onChange={e => setCityFilter(e.target.value)} />
                  </div>
                }
              />
            }>
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Election Name & Cycle</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Candidates</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {items.filter(i => !search || i.electionName.toLowerCase().includes(search.toLowerCase())).map((item) => (
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedElectionId === item.id ? 'bg-primary-50/50' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900">{item.electionName}</div>
                        <div className="text-xs text-slate-500 mt-1 flex gap-2 items-center">
                          <span>{item.electionYear}</span>
                          <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                          <span>Tenure: {item.electionTenure}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusPill 
                          label={item.status}
                          variant={item.status === 'FINALIZED' ? 'success' : item.status === 'ACTIVE' ? 'warning' : 'neutral'}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                          <Users className="h-4 w-4 text-slate-400" />
                          {item.totalCandidates}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => loadCandidates(item.id)}
                            className="text-primary-600 hover:text-primary-800 font-semibold"
                          >
                            Manage
                          </button>
                          {item.status !== 'FINALIZED' && (
                            <button
                              onClick={() => finalizeElection(item.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold transition-colors"
                            >
                              <CheckCircle className="h-3.5 w-3.5" /> Finalize
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setElectionForm({
                                name: item.electionName,
                                bodyName: (item as any).bodyName || '',
                                province: (item as any).province || '',
                                city: (item as any).city || '',
                                year: String(item.electionYear),
                                tenure: item.electionTenure,
                              });
                            }}
                            className="text-slate-500 hover:text-slate-700 p-1"
                            title="Edit Election"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteElection(item.id)}
                            className="text-rose-400 hover:text-rose-600 p-1"
                            title="Delete Election"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                     <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">No elections scheduled.</td></tr>
                  )}
                </tbody>
              </table>
            </DataTableShell>
          </PanelCard>
        </div>

        {/* Side Panel: Create & Context */}
        <div className="space-y-6">
          <PanelCard className="p-6 border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2 border-b border-slate-100 pb-4">
              <Plus className="h-5 w-5 text-primary-600" /> Create Election
            </h3>
            <form onSubmit={createElection} onKeyDown={advanceOnEnter} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 block mb-1">Name</span>
                <input required className="w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" placeholder="e.g. Board of Directors 2026" value={electionForm.name} onChange={e => setElectionForm(c => ({...c, name: e.target.value}))} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 block mb-1">Body Name</span>
                <input required className="w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" placeholder="e.g. National Bar" value={electionForm.bodyName} onChange={e => setElectionForm(c => ({...c, bodyName: e.target.value}))} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                 <label className="block">
                   <span className="text-sm font-medium text-slate-700 block mb-1">Province</span>
                   <input className="w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" placeholder="Region" value={electionForm.province} onChange={e => setElectionForm(c => ({...c, province: e.target.value}))} />
                 </label>
                 <label className="block">
                   <span className="text-sm font-medium text-slate-700 block mb-1">City</span>
                   <input className="w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" placeholder="City" value={electionForm.city} onChange={e => setElectionForm(c => ({...c, city: e.target.value}))} />
                 </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                 <label className="block">
                   <span className="text-sm font-medium text-slate-700 block mb-1">Year</span>
                   <input type="number" required className="w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" value={electionForm.year} onChange={e => setElectionForm(c => ({...c, year: e.target.value}))} />
                 </label>
                 <label className="block">
                   <span className="text-sm font-medium text-slate-700 block mb-1">Tenure</span>
                   <select className="w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" value={electionForm.tenure} onChange={e => setElectionForm(c => ({...c, tenure: e.target.value}))}>
                     <option value="1 year">1 Year</option>
                     <option value="2 years">2 Years</option>
                     <option value="4 years">4 Years</option>
                     <option value="5 years">5 Years</option>
                   </select>
                 </label>
              </div>
              <button type="submit" className="w-full mt-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors">Start Election</button>
            </form>
          </PanelCard>

          {selectedElectionId && (
            <PanelCard className="p-6 border-primary-200 bg-primary-50/20">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2 border-b border-primary-100 pb-4">
                <Users className="h-5 w-5 text-primary-600" /> Manage Candidates
              </h3>
              
              <form onSubmit={addCandidate} onKeyDown={advanceOnEnter} className="space-y-3 mb-6">
                <label className="block">
                  <span className="text-xs font-medium text-slate-700 block mb-1">Member Name</span>
                  <input required className="w-full rounded-md border-0 py-1.5 px-3 ring-1 ring-inset ring-border-soft sm:text-sm" placeholder="Full name" value={candidateForm.memberName} onChange={e => setCandidateForm(c => ({...c, memberName: e.target.value}))} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700 block mb-1">Position</span>
                    <input required className="w-full rounded-md border-0 py-1.5 px-3 ring-1 ring-inset ring-border-soft sm:text-sm" placeholder="e.g. President" value={candidateForm.position} onChange={e => setCandidateForm(c => ({...c, position: e.target.value}))} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700 block mb-1">Initial Votes</span>
                    <input type="number" required className="w-full rounded-md border-0 py-1.5 px-3 ring-1 ring-inset ring-border-soft sm:text-sm" value={candidateForm.votes} onChange={e => setCandidateForm(c => ({...c, votes: e.target.value}))} />
                  </label>
                </div>
                <button type="submit" className="w-full rounded-md bg-white border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">Add to Ballot</button>
              </form>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {candidates.map(candidate => (
                  <div key={candidate.id} className="bg-white border border-slate-200 rounded-lg p-3 flex justify-between items-center shadow-sm">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                        {candidate.memberName}
                        {candidate.isWinner && <Trophy className="h-3.5 w-3.5 text-amber-500" />}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{candidate.position}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {selectedElection?.status === 'ACTIVE' && (
                        <button
                          onClick={() => castVote(candidate.id, candidate.position)}
                          disabled={votingCandidateId === candidate.id}
                          className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50 transition-colors"
                        >
                          {votingCandidateId === candidate.id ? '...' : 'Vote'}
                        </button>
                      )}
                      <div className="text-right">
                        <div className="text-sm font-bold text-primary-600">{candidate.votes}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Votes</div>
                      </div>
                    </div>
                  </div>
                ))}
                {candidates.length === 0 && <p className="text-sm text-slate-500 italic text-center py-4">No candidates nominated yet.</p>}
              </div>
            </PanelCard>
          )}

        </div>
      </div>
    </div>
  );
}
