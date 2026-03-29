'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trophy, Users, Search } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

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

export default function PublicElectionsPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedElection, setSelectedElection] = useState<Election | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/elections`);
      if (res.ok) {
        const data = await res.json();
        setElections(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadCandidates = async (election: Election) => {
    setSelectedElection(election);
    setCandidates([]);
    try {
      const res = await fetch(`${API_BASE}/elections/${election.id}/candidates`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.items ?? []);
      }
    } catch {}
  };

  const filtered = elections.filter(e =>
    !search || e.electionName.toLowerCase().includes(search.toLowerCase())
  );

  const byPosition = candidates.reduce<Record<string, Candidate[]>>((acc, c) => {
    (acc[c.position] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-[#7b248d] text-white text-lg font-bold">W</div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Wusuq Elections</h1>
            <p className="text-xs text-slate-500">Public results and candidate profiles</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search elections..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#7b248d]"
          />
        </div>

        {/* Election list */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading && <p className="col-span-3 text-sm text-slate-500">Loading…</p>}
          {filtered.map(election => (
            <button
              key={election.id}
              onClick={() => loadCandidates(election)}
              className={`text-left rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-[#7b248d]/40 ${selectedElection?.id === election.id ? 'border-[#7b248d] ring-1 ring-[#7b248d]' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{election.electionName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{election.electionYear} · {election.electionTenure}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${election.status === 'FINALIZED' ? 'bg-emerald-100 text-emerald-700' : election.status === 'ACTIVE' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                  {election.status}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
                <Users className="h-3.5 w-3.5" />
                {election.totalCandidates} candidate{election.totalCandidates !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
          {!loading && filtered.length === 0 && (
            <p className="col-span-3 text-sm text-slate-500">No elections found.</p>
          )}
        </div>

        {/* Candidates */}
        {selectedElection && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3">
              {selectedElection.electionName} — Candidates
            </h2>
            {Object.entries(byPosition).map(([position, positionCandidates]) => (
              <div key={position}>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">{position}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {positionCandidates
                    .sort((a, b) => b.votes - a.votes)
                    .map(candidate => (
                      <div key={candidate.id} className={`rounded-xl border bg-white p-4 shadow-sm ${candidate.isWinner ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                              {candidate.memberName}
                              {candidate.isWinner && <Trophy className="h-4 w-4 text-amber-500" />}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">{candidate.position}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-bold text-[#7b248d]">{candidate.votes}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider">votes</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
            {candidates.length === 0 && (
              <p className="text-sm text-slate-500">No candidates registered yet.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
