'use client';

import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

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

export function ReportsBoard() {
  const [types, setTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [message, setMessage] = useState('');

  const loadTypes = useCallback(async () => {
    try {
      const list = await apiRequest('/reports');
      setTypes(list);
      setSelectedType(list[0] ?? '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load reports list');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTypes();
  }, [loadTypes]);

  const run = async () => {
    if (!selectedType) return;

    try {
      const data = await apiRequest(`/reports/${selectedType}`);
      setResult(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to run report');
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-semibold">Reports</h2>

      <div className="mt-4 flex gap-2">
        <select
          className="rounded border border-slate-300 p-2"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
          onClick={() => void run()}
        >
          Run Report
        </button>
      </div>

      {result ? (
        <pre className="mt-4 overflow-auto rounded border border-slate-300 bg-slate-50 p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
