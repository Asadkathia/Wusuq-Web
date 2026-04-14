'use client';

import { Bell, User, Wallet, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';

type Notification = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  isRead: boolean;
  createdAt: string;
};

export function ConsumerTopbar() {
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient
      .get<{ count: number }>('/notifications/unread-count')
      .then((r) => setUnread(r.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!bellOpen) return;
    apiClient
      .get<{ items: Notification[] }>('/notifications?limit=15')
      .then((r) => setNotifications(r.items))
      .catch(() => {});
  }, [bellOpen]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markAllRead = async () => {
    await apiClient.post('/notifications/mark-all-read', {}).catch(() => {});
    setNotifications((n) => n.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
  };

  const markOne = async (id: string) => {
    await apiClient.patch(`/notifications/${id}/read`, {}).catch(() => {});
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, isRead: true } : x)));
    setUnread((c) => Math.max(0, c - 1));
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border-soft bg-surface px-6 shadow-sm">
      <div className="text-sm font-medium text-slate-400">{/* Breadcrumb context */}</div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
          <Wallet className="h-4 w-4 text-slate-500" />
          <span className="text-xs text-slate-500">Wallet</span>
        </div>

        <div ref={bellRef} className="relative">
          <button
            onClick={() => setBellOpen((v) => !v)}
            className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <span className="text-sm font-semibold text-slate-900">Notifications</span>
                <div className="flex items-center gap-2">
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-xs font-medium text-primary-600 hover:underline">
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setBellOpen(false)}>
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
              </div>

              <ul className="max-h-72 divide-y divide-slate-50 overflow-y-auto">
                {notifications.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-slate-400">No notifications yet</li>
                ) : (
                  notifications.map((n) => (
                    <li
                      key={n.id}
                      onClick={() => markOne(n.id)}
                      className={`cursor-pointer px-4 py-3 transition-colors hover:bg-slate-50 ${!n.isRead ? 'bg-primary-50/40' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.isRead && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary-500" />}
                        <div className={!n.isRead ? '' : 'ml-4'}>
                          <p className="text-sm font-medium text-slate-900">{n.title}</p>
                          {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>}
                          <p className="mt-1 text-[10px] text-slate-400">
                            {new Date(n.createdAt).toLocaleDateString('en-PK', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600 ring-2 ring-primary-50">
          <User className="h-5 w-5" />
        </div>
      </div>
    </header>
  );
}
