'use client';

import { useCallback, useEffect, useState } from 'react';

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

async function apiRequest(path: string, method = 'GET', body?: unknown) {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('wusuq_access_token') : null;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

export function ElectionsBoard() {
  const [items, setItems] = useState<Election[]>([]);
  const [message, setMessage] = useState('');
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);

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
    try {
      const result = await apiRequest('/elections');
      setItems(result.items ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load elections');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const loadCandidates = async (electionId: string) => {
    try {
      const result = await apiRequest(`/elections/${electionId}/candidates`);
      setCandidates(result.items ?? []);
      setSelectedElectionId(electionId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load candidates');
    }
  };

  const createElection = async () => {
    try {
      await apiRequest('/elections', 'POST', {
        ...electionForm,
        year: Number(electionForm.year),
      });
      setMessage('Election created');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Create election failed');
    }
  };

  const addCandidate = async () => {
    if (!selectedElectionId) {
      setMessage('Select election first');
      return;
    }

    try {
      await apiRequest(`/elections/${selectedElectionId}/candidates`, 'POST', {
        position: candidateForm.position,
        memberName: candidateForm.memberName,
        votes: Number(candidateForm.votes),
      });
      setMessage('Candidate added');
      await loadCandidates(selectedElectionId);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Add candidate failed');
    }
  };

  const finalizeElection = async (id: string) => {
    try {
      await apiRequest(`/elections/${id}/finalize`, 'POST');
      setMessage('Election finalized');
      await load();
      if (selectedElectionId === id) {
        await loadCandidates(id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Finalize failed');
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-semibold">Elections</h2>

      <div className="mt-4 grid gap-3 rounded border border-slate-300 p-4 md:grid-cols-3">
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Election Name"
          value={electionForm.name}
          onChange={(e) => setElectionForm((c) => ({ ...c, name: e.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Body Name"
          value={electionForm.bodyName}
          onChange={(e) => setElectionForm((c) => ({ ...c, bodyName: e.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Province"
          value={electionForm.province}
          onChange={(e) => setElectionForm((c) => ({ ...c, province: e.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="City"
          value={electionForm.city}
          onChange={(e) => setElectionForm((c) => ({ ...c, city: e.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Year"
          value={electionForm.year}
          onChange={(e) => setElectionForm((c) => ({ ...c, year: e.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Tenure"
          value={electionForm.tenure}
          onChange={(e) => setElectionForm((c) => ({ ...c, tenure: e.target.value }))}
        />
      </div>
      <button
        type="button"
        className="mt-3 rounded bg-slate-900 px-3 py-2 text-sm text-white"
        onClick={() => void createElection()}
      >
        Create Election
      </button>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border border-slate-200 text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2">Election Name</th>
              <th className="p-2">Year</th>
              <th className="p-2">Tenure</th>
              <th className="p-2">Status</th>
              <th className="p-2">Total Candidates</th>
              <th className="p-2">Created By</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="p-2">{item.electionName}</td>
                <td className="p-2">{item.electionYear}</td>
                <td className="p-2">{item.electionTenure}</td>
                <td className="p-2">{item.status}</td>
                <td className="p-2">{item.totalCandidates}</td>
                <td className="p-2">{item.createdBy}</td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void loadCandidates(item.id)}
                    >
                      View Candidates
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1"
                      onClick={() => void finalizeElection(item.id)}
                    >
                      Finalize Election
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedElectionId ? (
        <div className="mt-6 rounded border border-slate-300 p-4">
          <h3 className="text-lg font-semibold">Candidates ({selectedElectionId})</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input
              className="rounded border border-slate-300 p-2"
              placeholder="Position"
              value={candidateForm.position}
              onChange={(e) => setCandidateForm((c) => ({ ...c, position: e.target.value }))}
            />
            <input
              className="rounded border border-slate-300 p-2"
              placeholder="Member Name"
              value={candidateForm.memberName}
              onChange={(e) => setCandidateForm((c) => ({ ...c, memberName: e.target.value }))}
            />
            <input
              className="rounded border border-slate-300 p-2"
              placeholder="Votes"
              value={candidateForm.votes}
              onChange={(e) => setCandidateForm((c) => ({ ...c, votes: e.target.value }))}
            />
          </div>
          <button
            type="button"
            className="mt-3 rounded bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={() => void addCandidate()}
          >
            Add Candidate
          </button>

          <ul className="mt-3 space-y-1 text-sm">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                {candidate.memberName} - {candidate.position} - votes: {candidate.votes}
                {candidate.isWinner ? ' (Winner)' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
