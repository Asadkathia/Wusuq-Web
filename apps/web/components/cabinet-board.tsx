'use client';

import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

type CabinetSeat = {
  id: string;
  memberName: string;
  position: string;
  year: number;
  tenure: string;
  votes: number;
  election: { id: string; name: string };
};

async function apiRequest(path: string) {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('wusuq_access_token') : null;

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

export function CabinetBoard() {
  const [items, setItems] = useState<CabinetSeat[]>([]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await apiRequest('/cabinet');
      setItems(result.items ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load cabinet');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-semibold">Cabinet</h2>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border border-slate-200 text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2">Member</th>
              <th className="p-2">Position</th>
              <th className="p-2">Election</th>
              <th className="p-2">Year</th>
              <th className="p-2">Tenure</th>
              <th className="p-2">Votes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="p-2">{item.memberName}</td>
                <td className="p-2">{item.position}</td>
                <td className="p-2">{item.election.name}</td>
                <td className="p-2">{item.year}</td>
                <td className="p-2">{item.tenure}</td>
                <td className="p-2">{item.votes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
