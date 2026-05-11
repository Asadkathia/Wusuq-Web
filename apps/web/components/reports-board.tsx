/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
 
 
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { BarChart3, Download, Play, RefreshCw, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function ReportsBoard() {
  const [types, setTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [dateRange, setDateRange] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadTypes = useCallback(async () => {
    try {
      const list = await apiClient.get<string[]>('/reports');
      setTypes(list);
      if (list.length > 0 && list[0]) setSelectedType(list[0]);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load report types');
    }
  }, []);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  const run = async () => {
    if (!selectedType) return;
    setLoading(true);
    setResult(null);
    setMessage('');
    try {
      const query = new URLSearchParams();
      if (dateRange !== 'all') query.set('dateRange', dateRange);
      if (statusFilter !== 'all') query.set('status', statusFilter);
      
      const data = await apiClient.get<any>(`/reports/${selectedType}?${query.toString()}`);
      setResult(data?.data || data); // ensure we unwrap if shaped
    } catch (error: any) {
      setMessage(error.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!result || !Array.isArray(result) || result.length === 0) return;
    const isObject = typeof result[0] === 'object' && result[0] !== null;
    if (!isObject) return;
    
    const columns = Object.keys(result[0]);
    const csvContent = [
      columns.join(','),
      ...result.map(row => columns.map(c => `"${String(row[c] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${selectedType}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderContent = () => {
    if (!result) return null;

    // Handle Array Data (Table)
    if (Array.isArray(result) && result.length > 0) {
      const isObject = typeof result[0] === 'object' && result[0] !== null;
      
      if (isObject) {
        const columns = Object.keys(result[0]).slice(0, 6); // Max 6 columns for clean UI
        
        // Check if we can build a chart (look for a string key and a number key)
        const stringKey = columns.find(key => typeof result[0][key] === 'string');
        const numberKey = columns.find(key => typeof result[0][key] === 'number');
        const canChart = stringKey && numberKey && result.length <= 15;

        return (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {canChart && (
              <PanelCard className="p-6">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Visual Summary
                </h3>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey={stringKey} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
                      <Tooltip 
                        cursor={{ fill: '#f1f5f9' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey={numberKey} fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </PanelCard>
            )}

            <PanelCard className="p-0 border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 p-4 px-6 text-sm font-semibold text-slate-900">
                Data Table ({result.length} Records)
                <button onClick={exportCsv} className="inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-800 text-xs font-semibold px-3 py-1.5 bg-primary-50 rounded-lg transition-colors">
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>
              <DataTableShell>
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {columns.map(col => (
                        <th key={col} className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          {col.replace(/([A-Z])/g, ' $1').trim()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {result.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        {columns.map(col => (
                          <td key={col} className="px-6 py-4 whitespace-nowrap text-slate-700">
                            {typeof row[col] === 'boolean' ? (row[col] ? 'Yes' : 'No') : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            </PanelCard>
          </div>
        );
      }
      
      // Simple array
      return (
        <PanelCard className="p-6">
          <ul className="list-disc pl-5 space-y-1 text-slate-700">
            {result.map((item, i) => <li key={i}>{String(item)}</li>)}
          </ul>
        </PanelCard>
      );
    }

    // Handle Object Data (Metrics Cards)
    if (typeof result === 'object' && result !== null) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-bottom-4 duration-500">
          {Object.entries(result).map(([key, value]) => {
            if (typeof value === 'object') return null; // Skip nested objects for simple metric view
            return (
              <PanelCard key={key} className="p-6">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {typeof value === 'boolean' ? (value ? 'Active' : 'Inactive') : String(value)}
                </div>
              </PanelCard>
            );
          })}
        </div>
      );
    }

    // Fallback for strings/numbers
    return (
      <PanelCard className="p-6 text-xl font-medium text-slate-800">
        {String(result)}
      </PanelCard>
    );
  };

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Reports & Analytics" 
        description="Generate standard operational and financial reports dynamically."
      />

      <PanelCard className="p-4 bg-slate-50/50 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1 w-full">
          <label className="sr-only">Select Report Type</label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
              <FileText className="h-4 w-4 text-slate-400" />
            </div>
            <select
              className="block w-full rounded-lg border-0 py-2.5 pl-10 pr-10 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm font-medium"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              disabled={types.length === 0}
            >
              {types.length === 0 ? <option>Loading templates...</option> : null}
              {types.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Report
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <button
          onClick={run}
          disabled={!selectedType || loading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Generate Report
        </button>
      </PanelCard>

      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.toLowerCase().includes('failed') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {/* Dynamic Results Area */}
      {result && !loading && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Generated Output</h3>
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>
          {renderContent()}
        </div>
      )}
      
      {!result && !loading && !message && (
        <div className="py-20 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 mb-4">
            <BarChart3 className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">No report generated</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Select a report template from the dropdown above and click generate to view data.</p>
        </div>
      )}
    </div>
  );
}
