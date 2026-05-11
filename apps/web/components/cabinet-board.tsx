/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { SectionHeader } from '@/components/ui/section-header';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { Trophy, CalendarCheck, RefreshCw } from 'lucide-react';

type CabinetSeat = {
  id: string;
  memberName: string;
  position: string;
  year: number;
  tenure: string;
  votes: number;
  election: { id: string; name: string };
};

export function CabinetBoard() {
  const [items, setItems] = useState<CabinetSeat[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>('/cabinet');
      setItems(result.items ?? []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load cabinet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Cabinet Members" 
        description="View the current active leadership finalized and elected across all bodies."
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

      <DataTableShell>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Member Profile</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Seat & Body</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Turnout</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tenure Term</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 font-bold shadow-sm">
                      <Trophy className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{item.memberName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.position}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-slate-900">{item.election?.name}</div>
                  <div className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">{item.year} CYCLE</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded inline-block">
                    {item.votes.toLocaleString()} Votes
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <CalendarCheck className="h-4 w-4 text-emerald-500" />
                    {item.tenure} Active
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500">
                  No cabinet members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}
