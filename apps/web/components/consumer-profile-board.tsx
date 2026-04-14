/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { FormEvent, useEffect, useState } from 'react';
import { KeyRound, Save, Shield, User as UserIcon } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { PanelCard } from '@/components/ui/panel-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

export function ConsumerProfileBoard() {
  const [tab, setTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cnic, setCnic] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');

  const toast = useToast();

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null') as any;
      if (u) {
        setName(u.name ?? '');
        setEmail(u.email ?? '');
        setPhone(u.phone ?? '');
      }
    } catch {}
    apiClient
      .get<any>('/users/me')
      .then((r) => {
        if (r?.name) setName(r.name);
        if (r?.email) setEmail(r.email);
        if (r?.phone) setPhone(r.phone);
        if (r?.cnic) setCnic(r.cnic);
        if (r?.dateOfBirth) setDateOfBirth(String(r.dateOfBirth).slice(0, 10));
      })
      .catch(() => {});
  }, []);

  const initials = (name || email || '?')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const saveGeneral = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.patch('/users/me', { name, phone, cnic, dateOfBirth: dateOfBirth || undefined });
      toast.success('Profile updated', 'Your changes have been saved.');
      try {
        const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
        if (u) localStorage.setItem('wusuq_user', JSON.stringify({ ...u, name }));
      } catch {}
    } catch (err: any) {
      toast.error('Update failed', err?.message);
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwNew !== pwConfirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (pwNew.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setPwLoading(true);
    try {
      await apiClient.patch('/users/me/password', { currentPassword: pwCurrent, newPassword: pwNew });
      toast.success('Password updated');
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (err: any) {
      toast.error('Password update failed', err?.message);
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account details and security.</p>
      </div>

      {/* Identity card */}
      <PanelCard className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-xl font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/10">
            {initials}
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-slate-900">{name || 'Your account'}</p>
            <p className="text-sm text-slate-500">{email}</p>
          </div>
        </div>
      </PanelCard>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="general"><UserIcon className="h-3.5 w-3.5 mr-1.5" />General</TabsTrigger>
          <TabsTrigger value="security"><Shield className="h-3.5 w-3.5 mr-1.5" />Security</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <PanelCard>
            <form onSubmit={saveGeneral} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Full name" htmlFor="name">
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                </FormField>
                <FormField label="Email" hint="Email changes are not supported online — contact support.">
                  <Input value={email} disabled />
                </FormField>
                <FormField label="Phone" htmlFor="phone">
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 ..." />
                </FormField>
                <FormField label="CNIC" htmlFor="cnic">
                  <Input id="cnic" value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="XXXXX-XXXXXXX-X" />
                </FormField>
                <FormField label="Date of birth" htmlFor="dob">
                  <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                </FormField>
              </div>

              <div className="flex items-center justify-end">
                <Button type="submit" variant="brand" loading={loading} leftIcon={<Save className="h-4 w-4" />}>
                  Save changes
                </Button>
              </div>
            </form>
          </PanelCard>
        </TabsContent>

        <TabsContent value="security">
          <PanelCard>
            <form onSubmit={savePassword} className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Change password</p>
                  <p className="text-xs text-slate-500">Use a strong, unique password for your account.</p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Current password" required htmlFor="pwCurrent">
                  <Input id="pwCurrent" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required />
                </FormField>
                <div />
                <FormField label="New password" required hint="Minimum 8 characters" htmlFor="pwNew">
                  <Input id="pwNew" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} required />
                </FormField>
                <FormField label="Confirm new password" required htmlFor="pwConfirm">
                  <Input id="pwConfirm" type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required />
                </FormField>
              </div>

              <div className="flex items-center justify-end">
                <Button type="submit" variant="brand" loading={pwLoading} leftIcon={<Shield className="h-4 w-4" />}>
                  Update password
                </Button>
              </div>
            </form>
          </PanelCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
