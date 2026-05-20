'use client';

import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Bell, LogOut, Menu as MenuIcon, User, Wallet, X } from 'lucide-react';
import { startTransition, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { IconButton } from './icon-button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './menu';
import { ShellNavBody, type NavItem } from './shell-nav';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';

type Notification = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  isRead: boolean;
  createdAt: string;
  metadata?: {
    ticketId?: string;
    caseId?: string;
    transactionId?: string;
  } | null;
};

type Variant = 'consumer' | 'staff';

type ShellTopbarProps = {
  variant: Variant;
  walletHref?: string;
  profileHref?: string;
  onSignOut: () => void;
  /** Nav items rendered inside the mobile drawer (< lg). */
  mobileNavItems?: NavItem[];
};

export function ShellTopbar({ variant, walletHref, profileHref = '/profile', onSignOut, mobileNavItems }: ShellTopbarProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [user, setUser] = useState<{ name?: string; email?: string; role?: string } | null>(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
      if (u) startTransition(() => setUser(u));
    } catch {}

    apiClient.get<{ count: number }>('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {});

    if (variant === 'consumer') {
      apiClient
        .get<{ balance?: number }>('/wallet/me')
        .then((r) => setWalletBalance(Number(r.balance ?? 0)))
        .catch(() => {});
    }
  }, [variant]);

  useEffect(() => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('wusuq_access_token')
        : null;
    if (!token) return;

    const es = new EventSource(
      `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`,
    );

    es.onmessage = (evt) => {
      try {
        const n = JSON.parse(evt.data) as Notification;
        setNotifications((prev) => [{ ...n, isRead: false }, ...prev].slice(0, 15));
        setUnread((c) => c + 1);
      } catch {}
    };

    return () => es.close();
  }, []);

  const loadNotifications = () => {
    apiClient
      .get<{ items: Notification[] }>('/notifications?limit=15')
      .then((r) => setNotifications(r.items))
      .catch(() => {});
  };

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

  const hrefFor = (n: Notification): string | null => {
    const ticketId = n.metadata?.ticketId;
    if (ticketId) {
      return variant === 'consumer'
        ? `/consumer/tickets/${ticketId}`
        : `/tickets/${ticketId}`;
    }
    return null;
  };

  const initials = (user?.name ?? user?.email ?? '?')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border-soft bg-surface/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-2">
        {mobileNavItems ? (
          <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <DialogPrimitive.Trigger asChild>
              <IconButton
                icon={<MenuIcon className="h-5 w-5" />}
                aria-label="Open navigation"
                className="lg:hidden"
              />
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay
                className={[
                  'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm',
                  'data-[state=open]:animate-in data-[state=open]:fade-in-0',
                  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
                ].join(' ')}
              />
              <DialogPrimitive.Content
                className={[
                  'fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-[300px] flex-col bg-surface shadow-elev-3 ring-1 ring-border-soft lg:hidden',
                  'data-[state=open]:animate-in data-[state=open]:slide-in-from-left',
                  'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left',
                  'duration-300 ease-silk',
                ].join(' ')}
              >
                <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
                <ShellNavBody
                  items={mobileNavItems}
                  variant={variant}
                  onNavigate={() => setMobileNavOpen(false)}
                />
                <DialogPrimitive.Close
                  aria-label="Close navigation"
                  className="absolute right-3 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-surface-muted hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {variant === 'consumer' && walletBalance !== null ? (
          <Link
            href={walletHref ?? '/consumer/my-wallet'}
            className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-100 transition-colors hover:bg-brand-100"
          >
            <Wallet className="h-4 w-4" />
            <span className="tabular-nums">PKR {new Intl.NumberFormat('en-PK').format(walletBalance)}</span>
          </Link>
        ) : null}

        {/* Notifications */}
        <Menu onOpenChange={(open) => { if (open) loadNotifications(); }}>
          <MenuTrigger asChild>
            <div className="relative">
              <IconButton
                icon={<Bell className="h-5 w-5" />}
                aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
              />
              {unread > 0 ? (
                <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-surface">
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </div>
          </MenuTrigger>
          <MenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
              <span className="text-sm font-semibold text-slate-900">Notifications</span>
              {unread > 0 ? (
                <button onClick={markAllRead} className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
                  Mark all read
                </button>
              ) : null}
            </div>
            <ul className="max-h-72 divide-y divide-border-soft overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="px-4 py-8 text-center text-xs text-slate-400">No notifications yet</li>
              ) : (
                notifications.map((n) => {
                  const href = hrefFor(n);
                  const inner = (
                    <div className="flex items-start gap-2">
                      {!n.isRead ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" /> : null}
                      <div className={!n.isRead ? '' : 'ml-4'}>
                        <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                        {n.body ? <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p> : null}
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
                  );
                  return (
                    <li
                      key={n.id}
                      onClick={() => markOne(n.id)}
                      className={[
                        'cursor-pointer px-4 py-3 transition-colors hover:bg-surface-muted',
                        !n.isRead ? 'bg-brand-50/50' : '',
                      ].join(' ')}
                    >
                      {href ? (
                        <Link href={href} className="block">
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </MenuContent>
        </Menu>

        {/* User menu */}
        <Menu>
          <MenuTrigger asChild>
            <button
              aria-label="User menu"
              className="flex items-center gap-2 rounded-lg pl-1 pr-2 py-1 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/10">
                {initials}
              </span>
              <span className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-xs font-semibold text-slate-900 max-w-[140px] truncate">{user?.name ?? 'Account'}</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-[0.08em]">{user?.role ?? ''}</span>
              </span>
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="min-w-[14rem]">
            <MenuLabel>{user?.email ?? 'Signed in'}</MenuLabel>
            <MenuSeparator />
            <MenuItem asChild>
              <Link href={profileHref}>
                <User className="h-4 w-4" />
                Profile
              </Link>
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={onSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}
