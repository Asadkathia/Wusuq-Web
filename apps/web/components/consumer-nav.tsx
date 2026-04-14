'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Scale,
  ShieldCheck,
  Ticket,
  Wallet,
} from 'lucide-react';

type SubItem = {
  label: string;
  href: string;
};

type NavItem = {
  label: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  children?: SubItem[];
};

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/consumer/dashboard', icon: LayoutDashboard },
  { label: 'My Tickets', href: '/consumer/my-tickets', icon: Ticket },
  { label: 'My Cases', href: '/consumer/my-cases', icon: FolderOpen },
  { label: 'My Wallet', href: '/consumer/my-wallet', icon: Wallet },
  {
    label: 'Paralegal Services',
    icon: Scale,
    children: [
      { label: 'Judicial', href: '/consumer/paralegal-services/judicial' },
      { label: 'Non Judicial', href: '/consumer/paralegal-services/non-judicial' },
    ],
  },
  { label: 'Documents', href: '/consumer/documents', icon: FileText },
  { label: 'Profile', href: '/consumer/profile', icon: BriefcaseBusiness },
];

function hasActiveChild(pathname: string, children: SubItem[]) {
  return children.some((child) => pathname.startsWith(child.href));
}

export function ConsumerSidebarNav() {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);
  const [impersonatorUser, setImpersonatorUser] = useState<{ name?: string } | null>(null);

  useEffect(() => {
    try {
      const currentUser = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
      if (currentUser) setUser(currentUser);
      const impersonator = JSON.parse(localStorage.getItem('wusuq_impersonator_user') || 'null');
      if (impersonator) setImpersonatorUser(impersonator);
    } catch {}
  }, []);

  const signOut = () => {
    localStorage.removeItem('wusuq_access_token');
    localStorage.removeItem('wusuq_refresh_token');
    localStorage.removeItem('wusuq_user');
    localStorage.removeItem('wusuq_impersonator_access_token');
    localStorage.removeItem('wusuq_impersonator_refresh_token');
    localStorage.removeItem('wusuq_impersonator_user');
    window.location.href = '/login';
  };

  const exitImpersonation = () => {
    localStorage.setItem('wusuq_access_token', localStorage.getItem('wusuq_impersonator_access_token') ?? '');
    localStorage.setItem('wusuq_refresh_token', localStorage.getItem('wusuq_impersonator_refresh_token') ?? '');
    localStorage.setItem('wusuq_user', localStorage.getItem('wusuq_impersonator_user') ?? '');
    localStorage.removeItem('wusuq_impersonator_access_token');
    localStorage.removeItem('wusuq_impersonator_refresh_token');
    localStorage.removeItem('wusuq_impersonator_user');
    window.location.href = '/dashboard';
  };

  return (
    <aside className="w-[252px] shrink-0 border-r border-slate-200 bg-white">
      <div className="flex h-full flex-col">
        <div className="px-6 py-6">
          <div className="flex h-[102px] w-[102px] items-center justify-center bg-[#7b248d] text-[28px] font-bold uppercase tracking-[0.16em] text-white">
            W
          </div>
        </div>

        {impersonatorUser && (
          <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
              <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
              Viewing as {user?.name ?? 'user'}
            </p>
            <p className="mt-0.5 text-xs text-amber-600">Signed in as {impersonatorUser.name}</p>
            <button
              onClick={exitImpersonation}
              className="mt-2 w-full rounded-md bg-amber-600 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
            >
              Back to my account
            </button>
          </div>
        )}

        <nav className="flex-1 space-y-1 px-3 pb-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href ? pathname.startsWith(item.href) : false;
            const hasChildren = Boolean(item.children?.length);
            const childActive = item.children ? hasActiveChild(pathname, item.children) : false;
            const groupOpen = hasChildren ? openGroups[item.label] ?? childActive : false;

            return (
              <div key={item.label}>
                <div
                  className={[
                    'flex items-center justify-between rounded-md px-3 py-2.5',
                    isActive || childActive ? 'bg-[#f1f3f7]' : 'hover:bg-[#f5f7fb]',
                  ].join(' ')}
                >
                  {item.href ? (
                    <Link href={item.href} className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 text-[#8b2a97]" />
                      <span className="truncate text-sm font-medium text-[#2f3e59]">{item.label}</span>
                    </Link>
                  ) : (
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 text-[#8b2a97]" />
                      <span className="truncate text-sm font-medium text-[#2f3e59]">{item.label}</span>
                    </div>
                  )}

                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((current) => ({
                          ...current,
                          [item.label]: !current[item.label],
                        }))
                      }
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#e8edf3] text-slate-500"
                      aria-label={`Toggle ${item.label}`}
                    >
                      {groupOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                  ) : null}
                </div>

                {hasChildren && groupOpen ? (
                  <div className="mt-1 space-y-1 px-4">
                    {item.children!.map((child) => {
                      const activeChild = pathname.startsWith(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-[#f5f7fb]"
                        >
                          <span
                            className={[
                              'h-2 w-2 rounded-full border',
                              activeChild ? 'border-[#222] bg-[#222]' : 'border-[#8f9aaa] bg-transparent',
                            ].join(' ')}
                          />
                          <span
                            className={[
                              'text-sm font-medium',
                              activeChild ? 'text-[#121f35]' : 'text-[#3f4f69]',
                            ].join(' ')}
                          >
                            {child.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 px-3 py-4">
          {user && (
            <div className="mb-3 px-3">
              <p className="truncate text-xs font-semibold text-slate-800">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
