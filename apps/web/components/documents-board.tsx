'use client';

import { useCallback, useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

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

export function DocumentsBoard() {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const query = search ? `&search=${encodeURIComponent(search)}` : '';
      const result = await apiRequest(`/documents?limit=200${query}`);
      setItems(result.items ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load documents');
    }
  }, [search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-semibold">Documents</h2>

      <div className="mt-4 flex gap-2">
        <input
          className="w-full rounded border border-slate-300 p-2"
          placeholder="Search by file name/type/batch"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
          onClick={() => void load()}
        >
          Search
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border border-slate-200 text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2">File</th>
              <th className="p-2">Type</th>
              <th className="p-2">Ticket</th>
              <th className="p-2">Consumer</th>
              <th className="p-2">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="p-2">{item.name}</td>
                <td className="p-2">{item.type}</td>
                <td className="p-2">{item.ticket.batchNo}</td>
                <td className="p-2">{item.ticket.consumer.name}</td>
                <td className="p-2">{new Date(item.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
