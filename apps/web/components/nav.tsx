'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, type ComponentType } from 'react';
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Scale,
  ShieldCheck,
  Ticket,
  Users,
  Vote,
  Wallet,
  WalletCards
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
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Cases', href: '/cases', icon: FolderOpen },
  {
    label: 'Paralegal Services',
    icon: Scale,
    children: [
      { label: 'Judicial', href: '/paralegal-services/judicial' },
      { label: 'Non judicial', href: '/paralegal-services/non-judicial' }
    ]
  },
  {
    label: 'Paralegal Tickets',
    icon: Ticket,
    children: [
      { label: 'Pending Tickets', href: '/tickets/pending' },
      { label: 'Completed Tickets', href: '/tickets/completed' },
      { label: 'Immature Tickets', href: '/tickets/immature' },
      { label: 'Assigned Tickets', href: '/tickets/assigned' },
      { label: 'In Progress Tickets', href: '/tickets/in-progress' }
    ]
  },
  { label: 'Finance', href: '/finance', icon: WalletCards, adminOnly: true },
  { label: 'Reports', href: '/reports', icon: BarChart3, adminOnly: true },
  { label: 'Documents', href: '/documents', icon: FolderOpen },
  { label: 'Wallet', href: '/wallet', icon: Wallet },
  {
    label: 'Manage Users',
    icon: Users,
    adminOnly: true,
    children: [
      { label: 'Users', href: '/manage-users/users' },
      { label: 'Representatives', href: '/manage-users/representatives' }
    ]
  },
  { label: 'Invoices', icon: FileText, adminOnly: true },
  {
    label: 'Manage Cost',
    icon: CircleDollarSign,
    adminOnly: true,
    children: [
      { label: 'Service Cost Rules', href: '/manage-cost/service-cost' },
      { label: 'Clerk Cost Rules', href: '/manage-cost/clerk-cost' },
      { label: 'Ticket Charges', href: '/manage-cost/ticket-charges' },
      { label: 'Exchange Rates', href: '/manage-cost/exchange-rates' },
      { label: 'Geographic Data', href: '/manage-cost/geo' },
    ]
  },
  { label: 'Elections & Cabinet', href: '/elections-cabinet/elections', icon: Vote, adminOnly: true },
  { label: 'Profile', href: '/profile', icon: BriefcaseBusiness }
];

function hasActiveChild(pathname: string, children: SubItem[]) {
  return children.some((child) => pathname.startsWith(child.href));
}

export function SidebarNav() {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<any>(null);
  const [impersonatorUser, setImpersonatorUser] = useState<any>(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
      if (u) setUser(u);
      const imp = JSON.parse(localStorage.getItem('wusuq_impersonator_user') || 'null');
      if (imp) setImpersonatorUser(imp);
    } catch {}
  }, []);

  const isAdmin = user?.role?.includes('admin') ?? false;

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

        {/* Impersonation banner */}
        {impersonatorUser && (
          <div className="mx-3 mb-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
              Viewing as {user?.name ?? 'user'}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Signed in as {impersonatorUser.name}</p>
            <button
              onClick={exitImpersonation}
              className="mt-2 w-full rounded-md bg-amber-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
            >
              Back to my account
            </button>
          </div>
        )}

        <nav className="flex-1 space-y-1 px-3 pb-6">
          {navItems.filter(item => !item.adminOnly || isAdmin).map((item) => {
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
                    isActive || childActive ? 'bg-[#f1f3f7]' : 'hover:bg-[#f5f7fb]'
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
                          [item.label]: !current[item.label]
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
                              activeChild
                                ? 'border-[#222] bg-[#222]'
                                : 'border-[#8f9aaa] bg-transparent'
                            ].join(' ')}
                          />
                          <span
                            className={[
                              'text-sm font-medium',
                              activeChild ? 'text-[#121f35]' : 'text-[#3f4f69]'
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

        {/* Sign Out */}
        <div className="border-t border-slate-200 px-3 py-4">
          {user && (
            <div className="mb-3 px-3">
              <p className="text-xs font-semibold text-slate-800 truncate">{user.name}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
