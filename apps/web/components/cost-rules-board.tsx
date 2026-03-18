'use client';

import { useCallback, useEffect, useState } from 'react';

type CostRuleType = 'service' | 'clerk';

type CostRule = {
  id: string;
  serviceId: string;
  category: string;
  caseType?: string | null;
  province?: string | null;
  audience?: string | null;
  yearFrom: number;
  yearTo: number;
  amount: number;
  isActive: boolean;
};

type CostRulesBoardProps = {
  title: string;
  type: CostRuleType;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

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

export function CostRulesBoard({ title, type }: CostRulesBoardProps) {
  const [items, setItems] = useState<CostRule[]>([]);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    serviceId: '',
    category: '',
    caseType: '',
    province: '',
    audience: '',
    yearFrom: String(new Date().getFullYear()),
    yearTo: String(new Date().getFullYear()),
    amount: '',
    isActive: true,
  });

  const endpoint = type === 'service' ? '/service-costs' : '/clerk-costs';

  const load = useCallback(async () => {
    try {
      const result = await apiRequest(endpoint);
      setItems(result.items ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load rules');
    }
  }, [endpoint]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const createRule = async () => {
    const amount = Number(form.amount);
    const yearFrom = Number(form.yearFrom);
    const yearTo = Number(form.yearTo);

    if (!form.serviceId || !form.category || amount < 0 || yearFrom > yearTo) {
      setMessage('Provide valid service, category, amount, and year range');
      return;
    }

    try {
      await apiRequest(endpoint, 'POST', {
        serviceId: form.serviceId,
        category: form.category,
        caseType: form.caseType || undefined,
        province: form.province || undefined,
        audience: type === 'service' ? form.audience || undefined : undefined,
        yearFrom,
        yearTo,
        amount,
        isActive: form.isActive,
      });
      setMessage('Rule created');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Create failed');
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-2xl font-semibold">{title}</h2>

      <div className="mt-4 grid gap-3 rounded border border-slate-300 p-4 md:grid-cols-4">
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Service ID"
          value={form.serviceId}
          onChange={(event) => setForm((c) => ({ ...c, serviceId: event.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Category"
          value={form.category}
          onChange={(event) => setForm((c) => ({ ...c, category: event.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Case Type"
          value={form.caseType}
          onChange={(event) => setForm((c) => ({ ...c, caseType: event.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Province"
          value={form.province}
          onChange={(event) => setForm((c) => ({ ...c, province: event.target.value }))}
        />

        {type === 'service' ? (
          <input
            className="rounded border border-slate-300 p-2"
            placeholder="Audience (local/overseas)"
            value={form.audience}
            onChange={(event) => setForm((c) => ({ ...c, audience: event.target.value }))}
          />
        ) : null}

        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Year From"
          value={form.yearFrom}
          onChange={(event) => setForm((c) => ({ ...c, yearFrom: event.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Year To"
          value={form.yearTo}
          onChange={(event) => setForm((c) => ({ ...c, yearTo: event.target.value }))}
        />
        <input
          className="rounded border border-slate-300 p-2"
          placeholder="Amount"
          value={form.amount}
          onChange={(event) => setForm((c) => ({ ...c, amount: event.target.value }))}
        />
      </div>

      <button
        type="button"
        className="mt-3 rounded bg-slate-900 px-3 py-2 text-sm text-white"
        onClick={() => void createRule()}
      >
        Create Rule
      </button>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border border-slate-200 text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-2">Service</th>
              <th className="p-2">Category</th>
              <th className="p-2">Case Type</th>
              <th className="p-2">Province</th>
              {type === 'service' ? <th className="p-2">Audience</th> : null}
              <th className="p-2">Year Mode</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="p-2">{item.serviceId}</td>
                <td className="p-2">{item.category}</td>
                <td className="p-2">{item.caseType ?? '-'}</td>
                <td className="p-2">{item.province ?? '-'}</td>
                {type === 'service' ? <td className="p-2">{item.audience ?? '-'}</td> : null}
                <td className="p-2">
                  {item.yearFrom === item.yearTo
                    ? `Single Year (${item.yearFrom})`
                    : `Range (${item.yearFrom}-${item.yearTo})`}
                </td>
                <td className="p-2">{item.amount}</td>
                <td className="p-2">{item.isActive ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
