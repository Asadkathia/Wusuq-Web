'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { startTransition, useEffect, useState, type ComponentType } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';

export type NavSubItem = { label: string; href: string; count?: number };

export type NavItem = {
  label: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  children?: NavSubItem[];
  count?: number;
};

type ShellNavProps = {
  items: NavItem[];
  variant: 'consumer' | 'staff';
};

function hasActiveChild(pathname: string, children: NavSubItem[]) {
  return children.some((child) => pathname.startsWith(child.href));
}

type ShellNavBodyProps = ShellNavProps & {
  onNavigate?: () => void;
};

export function ShellNavBody({ items, variant, onNavigate }: ShellNavBodyProps) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [impersonatorName, setImpersonatorName] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let nextUser: string | null = null;
    let nextImpersonator: string | null = null;
    try {
      const current = JSON.parse(localStorage.getItem('wusuq_user') || 'null');
      if (current?.name) nextUser = current.name;
      const impersonator = JSON.parse(localStorage.getItem('wusuq_impersonator_user') || 'null');
      if (impersonator?.name) nextImpersonator = impersonator.name;
    } catch {}
    startTransition(() => {
      setUserName(nextUser);
      setImpersonatorName(nextImpersonator);
    });
  }, []);

  const exitImpersonation = () => {
    localStorage.setItem('wusuq_access_token', localStorage.getItem('wusuq_impersonator_access_token') ?? '');
    localStorage.setItem('wusuq_refresh_token', localStorage.getItem('wusuq_impersonator_refresh_token') ?? '');
    localStorage.setItem('wusuq_user', localStorage.getItem('wusuq_impersonator_user') ?? '');
    localStorage.removeItem('wusuq_impersonator_access_token');
    localStorage.removeItem('wusuq_impersonator_refresh_token');
    localStorage.removeItem('wusuq_impersonator_user');
    window.location.href = variant === 'consumer' ? '/consumer/dashboard' : '/dashboard';
  };

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold tracking-[0.08em] text-white shadow-elev-1">
            W
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-ink-900">Wusuq</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
              {variant === 'consumer' ? 'Client portal' : 'Staff portal'}
            </p>
          </div>
        </div>
      </div>

      {/* Impersonation banner */}
      {impersonatorName ? (
        <div className="mx-3 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            Viewing as {userName ?? 'user'}
          </p>
          <p className="mt-0.5 text-[11px] text-amber-700">Signed in as {impersonatorName}</p>
          <button
            onClick={exitImpersonation}
            className="mt-2 w-full rounded-md bg-amber-600 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
          >
            Back to my account
          </button>
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.href ? pathname.startsWith(item.href) : false;
          const hasChildren = Boolean(item.children?.length);
          const childActive = item.children ? hasActiveChild(pathname, item.children) : false;
          const groupOpen = hasChildren ? openGroups[item.label] ?? childActive : false;

          const activeRow = isActive || childActive;

          const content = (
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                  activeRow ? 'bg-brand-500 text-white' : 'bg-chrome-100 text-brand-500',
                ].join(' ')}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span
                className={[
                  'truncate text-sm font-medium',
                  activeRow ? 'text-ink-900' : 'text-ink-700',
                ].join(' ')}
              >
                {item.label}
              </span>
              {item.count != null && item.count > 0 ? (
                <span className="ml-auto shrink-0 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {item.count > 99 ? '99+' : item.count}
                </span>
              ) : null}
            </div>
          );

          return (
            <div key={item.label} className="mb-0.5">
              <div
                className={[
                  'group relative flex items-center justify-between rounded-lg px-2.5 py-2',
                  'transition-colors duration-150',
                  activeRow ? 'bg-chrome-100' : 'hover:bg-chrome-50',
                ].join(' ')}
              >
                {activeRow ? (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-500" />
                ) : null}
                {item.href ? (
                  <Link href={item.href} onClick={onNavigate} className="min-w-0 flex-1">
                    {content}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">{content}</div>
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
                    className="ml-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-chrome-200 hover:text-slate-600"
                    aria-label={`Toggle ${item.label}`}
                  >
                    {groupOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                ) : null}
              </div>

              {hasChildren && groupOpen ? (
                <div className="mt-0.5 space-y-0.5 pl-10">
                  {item.children!.map((child) => {
                    const activeChild = pathname.startsWith(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        className={[
                          'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                          activeChild
                            ? 'text-ink-900 bg-chrome-100'
                            : 'text-ink-600 hover:text-ink-900 hover:bg-chrome-50',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'h-1.5 w-1.5 rounded-full transition-colors',
                            activeChild ? 'bg-brand-500' : 'bg-ink-400',
                          ].join(' ')}
                        />
                        {child.label}
                        {child.count != null && child.count > 0 ? (
                          <span className="ml-auto shrink-0 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                            {child.count > 99 ? '99+' : child.count}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export function ShellNav({ items, variant }: ShellNavProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-border-soft bg-surface lg:block">
      <ShellNavBody items={items} variant={variant} />
    </aside>
  );
}
