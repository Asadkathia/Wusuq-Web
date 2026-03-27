/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { PanelCard } from '@/components/ui/panel-card';
import { apiClient } from '@/lib/api-client';
import { Ticket, CheckCircle2, DollarSign, WalletCards } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('7d');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<any>(`/dashboard/summary?range=${range}`);
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [range]);

  const renderContent = () => {
    if (loading) return <div className="py-20 text-center text-slate-500 animate-pulse">Loading analytics...</div>;
    if (error) return <div className="py-20 text-center text-rose-500">{error}</div>;
    if (!data) return null;

    const { kpis, ticketTrend, ticketsByStatus, serviceMix, cityMix, pendingActions, financeTrend } = data;

    return (
      <div className="mt-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard 
            title="Total Tickets" 
            value={kpis.totalTickets} 
            icon={<Ticket className="opacity-50" />} 
          />
          <StatCard 
            title="Completed" 
            value={kpis.completedTickets} 
            icon={<CheckCircle2 className="opacity-50" />} 
          />
          <StatCard 
            title="Total Revenue" 
            value={`Rs. ${kpis.totalRevenue.toLocaleString()}`} 
            icon={<DollarSign className="opacity-50" />} 
          />
          <StatCard 
            title="Outstanding" 
            value={`Rs. ${kpis.outstandingBalance.toLocaleString()}`} 
            icon={<WalletCards className="opacity-50" />} 
          />
        </div>

        {/* Primary Analytics Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <PanelCard className="lg:col-span-2">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Ticket Volume Trend</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ticketTrend} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </PanelCard>
          
          <PanelCard>
             <h3 className="mb-4 text-sm font-semibold text-slate-900">Tickets by Status</h3>
             <div className="h-72 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie
                     data={ticketsByStatus}
                     cx="50%"
                     cy="50%"
                     innerRadius={60}
                     outerRadius={80}
                     paddingAngle={5}
                     dataKey="value"
                   >
                     {ticketsByStatus.map((entry: any, index: number) => (
                       <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                     ))}
                   </Pie>
                   <Tooltip />
                   <Legend verticalAlign="bottom" height={36} iconType="circle" />
                 </PieChart>
               </ResponsiveContainer>
             </div>
          </PanelCard>
        </div>

        {/* Context & Operations Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <PanelCard>
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Service Mix</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serviceMix} margin={{ top: 5, right: 0, bottom: 5, left: -20 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} tickLine={false} axisLine={false} tickFormatter={(v) => v.length > 10 ? v.substring(0, 10) + '...' : v} />
                  <Tooltip cursor={{fill: 'transparent'}} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PanelCard>

          <PanelCard>
            <h3 className="mb-4 text-sm font-semibold text-slate-900">City Distribution</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cityMix} margin={{ top: 5, right: 0, bottom: 5, left: -20 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{fill: 'transparent'}} />
                  <Bar dataKey="value" fill="#ec4899" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PanelCard>

          <PanelCard className="flex flex-col">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Pending Actions</h3>
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-100">
                <div className="flex items-center gap-3">
                  <WalletCards className="h-5 w-5 text-amber-600" />
                  <span className="text-sm font-medium text-amber-900">Wallet Verifications</span>
                </div>
                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">
                  {pendingActions.pendingVerifications}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100">
                <div className="flex items-center gap-3">
                  <Ticket className="h-5 w-5 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">New Tickets</span>
                </div>
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
                  {pendingActions.pendingTickets}
                </span>
              </div>
            </div>
          </PanelCard>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      <SectionHeader 
        title="Dashboard Overview" 
        description="Monitor operations, tickets, and revenue in real-time."
        action={
          <select 
            className="rounded-lg border-border-soft bg-surface text-sm font-medium shadow-sm py-2 pl-3 pr-8 text-slate-700 cursor-pointer focus:ring-2 focus:ring-primary-500"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        }
      />
      {renderContent()}
    </div>
  );
}
