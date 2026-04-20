/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { SectionHeader } from '@/components/ui/section-header';
import { DataTableShell } from '@/components/ui/data-table-shell';
import { FilterBar } from '@/components/ui/filter-bar';
import { StatusPill } from '@/components/ui/status-pill';
import { PanelCard } from '@/components/ui/panel-card';
import { RefreshCw, UserPlus, Mail, Shield, CheckCircle, XCircle, Pencil, Trash2, X, Wallet, MonitorPlay } from 'lucide-react';

const USER_ROLES = [
  'super_admin', 'manager_admin', 'staff_admin', 'lead_admin',
  'lawyer', 'consumer', 'representative', 'investor', 'company',
];

type UserData = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  cnic: string | null;
  role: string;
  verified: boolean;
  isActive: boolean;
  walletBalance: number;
  createdAt: string;
};

const emptyForm = {
  name: '', email: '', phone: '', cnic: '',
  password: '', role: 'consumer', address: '', province: '', district: '', city: '',
};

export function UsersBoard() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [topupUser, setTopupUser] = useState<UserData | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupMode, setTopupMode] = useState<'JAZZ_CASH' | 'EASY_PAISA' | 'BANK_TRANSFER'>('BANK_TRANSFER');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>('/users?limit=200');
      setUsers(result.items ?? result ?? []);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter((u) =>
    (roleFilter === 'all' || u.role === roleFilter) &&
    (u.name.toLowerCase().includes(search.toLowerCase()) ||
     u.email.toLowerCase().includes(search.toLowerCase()) ||
     u.role.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => { setForm(emptyForm); setShowCreate(true); setEditUser(null); };
  const openEdit = (u: UserData) => {
    setForm({ name: u.name, email: u.email, phone: u.phone || '', cnic: u.cnic || '',
      password: '', role: u.role, address: '', province: '', district: '', city: '' });
    setEditUser(u);
    setShowCreate(true);
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editUser) {
        await apiClient.patch(`/users/${editUser.id}`, { name: form.name, phone: form.phone, cnic: form.cnic, role: form.role, address: form.address, province: form.province, district: form.district, city: form.city });
        setMessage('User updated');
      } else {
        await apiClient.post('/users', form);
        setMessage('User created');
      }
      setShowCreate(false);
      load();
    } catch (error: any) {
      setMessage(error.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: UserData) => {
    try {
      await apiClient.post(`/users/${u.id}/${u.isActive ? 'deactivate' : 'activate'}`);
      setMessage(`User ${u.isActive ? 'deactivated' : 'activated'}`);
      load();
    } catch (error: any) {
      setMessage(error.message || 'Toggle failed');
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await apiClient.delete(`/users/${id}`);
      setMessage('User deleted');
      load();
    } catch (error: any) {
      setMessage(error.message || 'Delete failed');
    }
  };

  const submitTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topupUser || !topupAmount) return;
    setSaving(true);
    try {
      await apiClient.post('/wallet/topup', {
        userId: topupUser.id,
        amount: Number(topupAmount),
        paymentMode: topupMode,
        currency: 'PKR',
      });
      setMessage(`Topup of ${topupAmount} PKR created for ${topupUser.name}.`);
      setTopupUser(null);
      setTopupAmount('');
    } catch (error: any) {
      setMessage(error.message || 'Topup failed');
    } finally {
      setSaving(false);
    }
  };

  const impersonate = async (targetUser: UserData) => {
    if (!confirm(`Impersonate ${targetUser.name}? You will be logged in as them.`)) return;
    try {
      const result = await apiClient.post<any>(`/auth/impersonate/${targetUser.id}`);
      // Stash current admin session so we can restore it later
      localStorage.setItem('wusuq_impersonator_access_token', localStorage.getItem('wusuq_access_token') ?? '');
      localStorage.setItem('wusuq_impersonator_refresh_token', localStorage.getItem('wusuq_refresh_token') ?? '');
      localStorage.setItem('wusuq_impersonator_user', localStorage.getItem('wusuq_user') ?? '');
      localStorage.setItem('wusuq_access_token', result.accessToken);
      localStorage.setItem('wusuq_refresh_token', result.refreshToken);
      localStorage.setItem('wusuq_user', JSON.stringify(result.user));
      window.location.href = '/dashboard';
    } catch (error: any) {
      setMessage(error.message || 'Impersonation failed (Requires super_admin)');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Manage Users"
        description="View and administer user accounts, roles, and statuses across the platform."
        action={
          <div className="flex gap-2">
            <button onClick={load} disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted disabled:opacity-50 transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 transition-colors">
              <UserPlus className="h-4 w-4" /> Create User
            </button>
          </div>
        }
      />

      {message && (
        <div className={`rounded-lg p-4 text-sm font-medium ${message.toLowerCase().includes('fail') || message.toLowerCase().includes('error') ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showCreate && (
        <PanelCard className="p-6 border-primary-200">
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-semibold text-slate-900">{editUser ? 'Edit User' : 'Create User'}</h3>
            <button onClick={() => setShowCreate(false)}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
          </div>
          <form onSubmit={saveUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Full Name', key: 'name', required: true },
              { label: 'Email', key: 'email', required: !editUser, type: 'email' },
              { label: 'Phone', key: 'phone' },
              { label: 'CNIC (13 digits)', key: 'cnic' },
              ...(!editUser ? [{ label: 'Password', key: 'password', required: true, type: 'password' }] : []),
              { label: 'Province', key: 'province' },
              { label: 'District', key: 'district' },
              { label: 'City', key: 'city' },
            ].map(({ label, key, required, type }) => (
              <label key={key} className="block">
                <span className="text-sm font-medium text-slate-700">{label}{required && <span className="text-rose-500 ml-0.5">*</span>}</span>
                <input
                  required={required}
                  type={type || 'text'}
                  className="mt-1 block w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                  value={(form as any)[key]}
                  onChange={(e) => setForm((c) => ({ ...c, [key]: e.target.value }))}
                />
              </label>
            ))}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Role<span className="text-rose-500 ml-0.5">*</span></span>
              <select required className="mt-1 block w-full rounded-lg border-0 py-2 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                value={form.role} onChange={(e) => setForm((c) => ({ ...c, role: e.target.value }))}>
                {USER_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Address</span>
              <input className="mt-1 block w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm"
                value={form.address} onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))} />
            </label>
            <div className="md:col-span-2 flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : editUser ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        </PanelCard>
      )}

      {topupUser && (
        <PanelCard className="p-6 border-emerald-200">
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-semibold text-slate-900">Topup Wallet ({topupUser.name})</h3>
            <button onClick={() => setTopupUser(null)}><X className="h-5 w-5 text-slate-400 hover:text-slate-700" /></button>
          </div>
          <form onSubmit={submitTopup} className="space-y-4 max-w-sm">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Amount (PKR)</span>
              <input type="number" required className="mt-1 block w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-emerald-600 sm:text-sm"
                value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Payment Mode</span>
              <select required className="mt-1 block w-full rounded-lg border-0 py-2 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-emerald-600 sm:text-sm"
                value={topupMode} onChange={(e) => setTopupMode(e.target.value as typeof topupMode)}>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="JAZZ_CASH">JazzCash</option>
                <option value="EASY_PAISA">EasyPaisa</option>
              </select>
            </label>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50">
                {saving ? 'Processing...' : 'Topup'}
              </button>
            </div>
          </form>
        </PanelCard>
      )}

      <DataTableShell header={
        <FilterBar 
          searchPlaceholder="Search users by name, email, or role..." 
          onSearch={setSearch} 
          actions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <select className="w-full sm:w-auto rounded-lg border-0 py-2 pl-3 pr-8 text-slate-900 shadow-sm ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                <option value="all">All Roles</option>
                <option value="consumer">Consumer</option>
                <option value="lawyer">Lawyer</option>
                <option value="representative">Representative</option>
                <option value="manager_admin">Manager Admin</option>
              </select>
            </div>
          }
        />
      }>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Verified</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 flex-shrink-0 rounded-full bg-primary-100 flex items-center justify-center font-bold text-primary-700 text-sm">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{user.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3" />{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{user.phone || '—'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                    <Shield className="h-3.5 w-3.5 text-slate-400" />{user.role.replace(/_/g, ' ')}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.verified
                    ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                    : <XCircle className="h-4 w-4 text-slate-300" />}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusPill label={user.isActive ? 'ACTIVE' : 'INACTIVE'} variant={user.isActive ? 'success' : 'neutral'} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => impersonate(user)} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Impersonate User"><MonitorPlay className="h-4 w-4" /></button>
                    <button onClick={() => setTopupUser(user)} className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors" title="Wallet Topup"><Wallet className="h-4 w-4" /></button>
                    <button onClick={() => openEdit(user)} className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors" title="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => toggleActive(user)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${user.isActive ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}>
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => deleteUser(user.id)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors" title="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}
