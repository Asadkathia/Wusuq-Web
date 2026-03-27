/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { SectionHeader } from '@/components/ui/section-header';
import { PanelCard } from '@/components/ui/panel-card';
import { User, Shield, Key, Mail, Smartphone, Bell, Clock, Laptop } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export function ProfileBoard() {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [name, setName] = useState('Administrator User');
  const [phone, setPhone] = useState('');
  const [cnic, setCnic] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');

  const handleSave = async () => {
    setLoading(true);
    setMessage('Saving...');
    try {
      await apiClient.patch('/users/me', { name, phone, cnic, dateOfBirth });
      setMessage('Profile updated successfully');
    } catch (error: any) {
      setMessage(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSave = async () => {
    if (pwNew !== pwConfirm) return setMessage('New passwords do not match');
    setLoading(true);
    setMessage('Updating security...');
    try {
      await apiClient.patch('/users/me/password', { currentPassword: pwCurrent, newPassword: pwNew });
      setMessage('Password changed successfully');
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (error: any) {
      setMessage(error.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Profile & Security" 
        description="Manage your personal information, security preferences, and active sessions."
      />

      <div className="flex flex-col md:flex-row gap-6">
        {/* Navigation Sidebar */}
        <div className="w-full md:w-64 flex-shrink-0">
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'general' ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              <User className="h-4 w-4" />
              General Info
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'security' ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              <Shield className="h-4 w-4" />
              Security & Auth
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'notifications' ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              <Bell className="h-4 w-4" />
              Notifications
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'sessions' ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              <Laptop className="h-4 w-4" />
              Active Sessions
            </button>
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 space-y-6">
          
          {activeTab === 'general' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
              {message && (
                <div className={`p-4 rounded-xl text-sm font-medium ${message.includes('success') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                  {message}
                </div>
              )}
              <PanelCard className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-6 border-b border-slate-100 pb-4">Personal Details</h3>
                
                <div className="flex items-center gap-6 mb-8">
                  <div className="h-20 w-20 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                    <User className="h-8 w-8" />
                  </div>
                  <div>
                    <button className="rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-border-soft hover:bg-surface-muted transition-colors">
                      Upload Avatar
                    </button>
                    <p className="text-xs text-slate-500 mt-2">JPG, GIF or PNG. Max size of 800K</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 block mb-1">Full Name</span>
                    <input type="text" className="w-full rounded-lg border-0 py-2.5 px-3 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm text-slate-900" value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 block mb-1">Email Address</span>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                        <Mail className="h-4 w-4 text-slate-400" />
                      </div>
                      <input type="email" disabled className="block w-full rounded-lg border-0 py-2.5 pl-10 px-3 ring-1 ring-inset ring-border-soft bg-slate-50 text-slate-500 sm:text-sm" value="admin@wusuq.internal" />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 block mb-1">Phone Number</span>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                        <Smartphone className="h-4 w-4 text-slate-400" />
                      </div>
                      <input type="tel" className="block w-full rounded-lg border-0 py-2.5 pl-10 px-3 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm text-slate-900" placeholder="+966 50 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 block mb-1">CNIC Number</span>
                    <input type="text" className="w-full rounded-lg border-0 py-2.5 px-3 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm text-slate-900" placeholder="12345-1234567-1" value={cnic} onChange={(e) => setCnic(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 block mb-1">Date of Birth</span>
                    <input type="date" className="w-full rounded-lg border-0 py-2.5 px-3 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm text-slate-900" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                  </label>
                </div>
                
                <div className="mt-8 flex justify-end">
                  <button onClick={handleSave} disabled={loading} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 disabled:opacity-50 transition-colors">
                    Save Changes
                  </button>
                </div>
              </PanelCard>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
              <PanelCard className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-6 border-b border-slate-100 pb-4">Change Password</h3>
                <div className="space-y-4 max-w-md">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 block mb-1">Current Password</span>
                    <input type="password" placeholder="••••••••" className="w-full rounded-lg border-0 py-2 px-3 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm text-slate-900" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 block mb-1">New Password</span>
                    <input type="password" placeholder="••••••••" className="w-full rounded-lg border-0 py-2 px-3 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm text-slate-900" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 block mb-1">Confirm New Password</span>
                    <input type="password" placeholder="••••••••" className="w-full rounded-lg border-0 py-2 px-3 ring-1 ring-inset ring-border-soft focus:ring-2 focus:ring-primary-600 sm:text-sm text-slate-900" />
                  </label>
                  <button className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors">
                    Update Password
                  </button>
                </div>
              </PanelCard>

              <PanelCard className="p-6 border-rose-200 bg-rose-50/30">
                <div className="flex gap-4">
                  <div className="mt-1">
                    <Key className="h-6 w-6 text-rose-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Two-Factor Authentication</h4>
                    <p className="text-sm text-slate-600 mt-1 max-w-xl">Add an extra layer of security to your account by requiring a code from your authentication app upon login.</p>
                    <button className="mt-4 rounded-lg bg-white border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
                      Enable 2FA
                    </button>
                  </div>
                </div>
              </PanelCard>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
              <PanelCard className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-6 border-b border-slate-100 pb-4">Notification Preferences</h3>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">System Alerts</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Urgent issues, server status, and security alerts</p>
                    </div>
                    <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600" />
                  </div>
                  <div className="h-px w-full bg-slate-100"></div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Ticket Updates</h4>
                      <p className="text-xs text-slate-500 mt-0.5">When cases enter your queue or require approval</p>
                    </div>
                    <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600" />
                  </div>
                  <div className="h-px w-full bg-slate-100"></div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Finance & Invoices</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Weekly summaries and payment verifications</p>
                    </div>
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600" />
                  </div>
                </div>
              </PanelCard>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
              <PanelCard className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-6 border-b border-slate-100 pb-4">Active Sessions</h3>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-4 p-4 rounded-xl border border-primary-200 bg-primary-50/50">
                    <Laptop className="h-6 w-6 text-primary-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">Mac OS Safari <span className="bg-primary-100 text-primary-700 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded">Current</span></h4>
                          <p className="text-xs text-slate-600 mt-1">Riyadh, Saudi Arabia · 192.168.1.1</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-white">
                    <Smartphone className="h-6 w-6 text-slate-400 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">iOS Safari</h4>
                          <p className="text-xs text-slate-500 mt-1">Last active 2 days ago · Jeddah, Saudi Arabia</p>
                        </div>
                        <button className="text-xs font-semibold text-rose-600 hover:text-rose-800">
                          Revoke
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100">
                  <button className="flex items-center text-sm font-semibold text-rose-600 hover:text-rose-800 transition-colors">
                    Sign out of all other sessions
                  </button>
                </div>
              </PanelCard>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
